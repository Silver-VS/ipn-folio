// SPDX-License-Identifier: AGPL-3.0-or-later
// Estado de la pantalla de proyecto: proyecto abierto, archivos, pestañas, estado de guardado, mensajes y PDF.
// Runas de Svelte 5 en una clase; sin store global.
//
// Contrato del autoguardado (HANDOFF 02): renombrar, borrar, restaurar y mandar a la papelera pasan SIEMPRE por `auto`
// (`renombrar`, `borrar`, `moverAPapelera`, `restaurarDePapelera`, `descartar`), nunca por `almacen.*`: así un
// cambio pendiente no resucita la ruta vieja. Borrar es mandar a la papelera (D29): se puede deshacer.
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { acerca } from '../../acerca';
import {
  normalizarRuta,
  textoDeError,
  tipoPorRuta,
  type Aviso,
  type ElementoPapelera,
  type EstadoAutoguardado,
  type InfoArchivo,
  type Proyecto,
} from '../../almacen';
import { aTexto, estaBajo } from '../../almacen/rutas';
import { reemplazarTextoExterno } from '../../editor/crear-editor';
import { plano } from '../../textos/plano';
import { t } from '../../textos/t';
import { leerDias } from '../papelera/purga';
import { textoRestaurado } from '../papelera/restauracion';
import type { Servicios } from '../servicios';
import { esImagen, moverBajo, nombreDe, nombreUnico, unirRuta } from './arbol';

export type PestanaCompacta = 'editor' | 'pdf' | 'archivos' | 'problemas';
export const PESTANAS_COMPACTAS: readonly PestanaCompacta[] = ['editor', 'pdf', 'archivos', 'problemas'];

export interface Mensaje {
  id: number;
  tipo: 'info' | 'aviso' | 'error';
  texto: string;
  accion?: { etiqueta: string; ejecutar: () => void };
}

/** Un problema de la compilación (se llena en la sesión 09). */
export interface Problema {
  severidad: 'error' | 'aviso';
  texto: string;
  ruta?: string;
  linea?: number;
}

export interface PdfMostrado {
  bytes: Uint8Array;
  nombre: string;
  /** Cambia con cada PDF recibido, aunque sea el mismo contenido (el visor conserva página y zoom). */
  version: number;
}

interface PestanasGuardadas {
  abiertos: string[];
  activo?: string;
  compacta?: PestanaCompacta;
}

const clavePestanas = (id: string) => `folio.pestanas.${id}`;
const SEGUNDOS_MENSAJE = 9;

export class EstadoProyecto {
  readonly id: string;
  readonly servicios: Servicios;

  proyecto = $state.raw<Proyecto>(null as unknown as Proyecto);
  archivos = $state.raw<InfoArchivo[]>([]);
  /** Archivos y carpetas de ESTE proyecto que están en la papelera (lo más reciente primero). */
  papelera = $state.raw<ElementoPapelera[]>([]);
  /** Pide al árbol de archivos que enfoque una fila (p. ej. tras «Deshacer»); `n` cambia en cada petición. */
  enfocarArbol = $state.raw<{ ruta: string; n: number } | undefined>();
  abiertos = $state<string[]>([]);
  activo = $state<string | undefined>();
  guardado = $state<EstadoAutoguardado>('guardado');
  ultimoGuardado = $state<number | undefined>();
  mensajes = $state.raw<Mensaje[]>([]);
  /** Archivos abiertos que otra pestaña cambió mientras aquí había cambios sin guardar. */
  conflictos = $state.raw<string[]>([]);
  pdf = $state.raw<PdfMostrado | undefined>();
  problemas = $state.raw<Problema[]>([]);
  salida = $state('');
  paletaAbierta = $state(false);
  pestanaCompacta = $state<PestanaCompacta>('editor');
  /** Sube cada vez que un panel pasa a otra ventana del navegador o vuelve: los paneles se vuelven a medir. */
  generacionVentanas = $state(0);

  /** Vistas montadas (una por archivo abierto) y el último `EditorState` de cada archivo (sobrevive al desmontar). */
  readonly vistas = new Map<string, EditorView>();
  readonly estadosEditor = new Map<string, EditorState>();

  private readonly sucios = new Set<string>();
  private conocidas = new Set<string>();
  private contadorMensajes = 0;
  private contadorPdf = 0;
  private quitar: Array<() => void> = [];
  private refrescoPendiente = false;
  private destruido = false;

  private constructor(servicios: Servicios, proyecto: Proyecto) {
    this.servicios = servicios;
    this.id = proyecto.id;
    this.proyecto = proyecto;
  }

  /** Abre un proyecto activo; `undefined` si no existe o está en la papelera. */
  static async abrir(servicios: Servicios, id: string): Promise<EstadoProyecto | undefined> {
    const proyecto = await servicios.almacen.obtenerProyecto(id);
    if (!proyecto || proyecto.enPapelera) return undefined;
    const estado = new EstadoProyecto(servicios, proyecto);
    await estado.refrescarArchivos();
    await estado.refrescarPapelera();
    await estado.restaurarPestanas();
    estado.conectar();
    return estado;
  }

  // ---------- conexión con los servicios ----------

  private conectar(): void {
    const { auto, avisos, almacen } = this.servicios;
    this.guardado = auto.estado;
    this.ultimoGuardado = auto.ultimoGuardado;
    this.quitar.push(
      auto.alCambiar(() => {
        if (auto.estado === 'error' && this.guardado !== 'error') this.avisar('error', t('guardado.error'));
        this.guardado = auto.estado;
        this.ultimoGuardado = auto.ultimoGuardado;
        if (auto.estado === 'guardado') {
          for (const ruta of this.sucios) if (!this.conflictos.includes(ruta)) this.sucios.delete(ruta);
        }
      }),
      avisos.escuchar((a) => void this.alAvisoExterno(a)),
      // Cambios locales: solo se vuelve a listar si aparece un archivo nuevo (cada guardado emite un evento).
      almacen.al('cambio-archivo', (e) => {
        if (e.proyectoId === this.id && !this.conocidas.has(e.ruta)) this.pedirRefresco();
      }),
      almacen.al('cambio-papelera', (e) => {
        if (e.elemento.proyectoId === this.id) void this.refrescarPapelera();
      }),
    );
  }

  /** Suelta los oyentes y guarda lo pendiente. */
  async destruir(): Promise<void> {
    if (this.destruido) return;
    this.destruido = true;
    for (const q of this.quitar) q();
    this.quitar = [];
    await this.servicios.auto.guardarTodo().catch(() => {});
  }

  // ---------- archivos ----------

  async refrescarArchivos(): Promise<void> {
    const lista = await this.servicios.almacen.listarArchivos(this.id);
    if (this.destruido) return;
    this.archivos = lista;
    this.conocidas = new Set(lista.map((a) => a.ruta));
  }

  /** Vuelve a leer la papelera de este proyecto (sin los proyectos enteros: esos viven en el inicio). */
  async refrescarPapelera(): Promise<void> {
    try {
      const todos = await this.servicios.almacen.listarPapelera();
      if (!this.destruido) this.papelera = todos.filter((e) => e.proyectoId === this.id && e.clase !== 'proyecto');
    } catch {
      /* la lista de la papelera es una comodidad: si falla, la vista Papelera lo dirá */
    }
  }

  private pedirRefresco(): void {
    if (this.refrescoPendiente) return;
    this.refrescoPendiente = true;
    queueMicrotask(() => {
      this.refrescoPendiente = false;
      void this.refrescarArchivos();
    });
  }

  private async recargarProyecto(): Promise<void> {
    const p = await this.servicios.almacen.obtenerProyecto(this.id);
    if (p && !this.destruido) this.proyecto = p;
  }

  private rutas(): Set<string> {
    return new Set(this.archivos.map((a) => a.ruta));
  }

  // ---------- pestañas ----------

  abrirArchivo(ruta: string): void {
    const info = this.archivos.find((a) => a.ruta === ruta);
    if (!info) return;
    if (info.tipo === 'binario' && !esImagen(ruta)) {
      this.avisar('info', plano(t('proyecto.no_se_puede_abrir', { ruta })));
      return;
    }
    if (!this.abiertos.includes(ruta)) this.abiertos = [...this.abiertos, ruta];
    this.activo = ruta;
    void this.guardarPestanas();
  }

  activarArchivo(ruta: string): void {
    if (!this.abiertos.includes(ruta)) return;
    this.activo = ruta;
    void this.guardarPestanas();
  }

  cerrarArchivo(ruta: string): void {
    const i = this.abiertos.indexOf(ruta);
    if (i < 0) return;
    const quedan = this.abiertos.filter((r) => r !== ruta);
    this.abiertos = quedan;
    this.estadosEditor.delete(ruta);
    this.quitarConflicto(ruta);
    if (this.activo === ruta) this.activo = quedan[Math.min(i, quedan.length - 1)];
    void this.guardarPestanas();
  }

  seleccionarPestanaCompacta(p: PestanaCompacta): void {
    this.pestanaCompacta = p;
    void this.guardarPestanas();
  }

  private async guardarPestanas(): Promise<void> {
    const datos: PestanasGuardadas = {
      abiertos: [...this.abiertos],
      activo: this.activo,
      compacta: this.pestanaCompacta,
    };
    try {
      await this.servicios.almacen.guardarAjuste(clavePestanas(this.id), datos);
    } catch {
      /* las pestañas son una comodidad: si no se guardan no pasa nada */
    }
  }

  private async restaurarPestanas(): Promise<void> {
    const guardadas = await this.servicios.almacen.leerAjuste<PestanasGuardadas>(clavePestanas(this.id));
    const existentes = this.rutas();
    const abiertos = (guardadas?.abiertos ?? []).filter((r) => existentes.has(r));
    if (abiertos.length === 0) {
      const principal = existentes.has(this.proyecto.principal) ? this.proyecto.principal : undefined;
      const primero = principal ?? this.archivos.find((a) => a.tipo === 'texto')?.ruta;
      if (primero) abiertos.push(primero);
    }
    this.abiertos = abiertos;
    this.activo = guardadas?.activo && abiertos.includes(guardadas.activo) ? guardadas.activo : abiertos[0];
    if (guardadas?.compacta && PESTANAS_COMPACTAS.includes(guardadas.compacta))
      this.pestanaCompacta = guardadas.compacta;
  }

  // ---------- edición y guardado ----------

  /** Cada pulsación: el autoguardado agrupa las escrituras (400 ms de calma). */
  alEditar(ruta: string, texto: string): void {
    this.sucios.add(ruta);
    if (!this.conflictos.includes(ruta)) this.servicios.auto.programar(this.id, ruta, texto);
  }

  /** Ctrl+S: guarda ya. La sesión 09 agrega la compilación. */
  async guardarYa(): Promise<void> {
    await this.servicios.auto.guardarTodo();
  }

  // ---------- operaciones del árbol (todas por el autoguardado) ----------

  async crearArchivo(rutaEscrita: string): Promise<boolean> {
    try {
      const ruta = normalizarRuta(rutaEscrita);
      if ([...this.rutas()].some((r) => r.toLowerCase() === ruta.toLowerCase())) {
        this.avisar('error', plano(t('archivos.error.ya_existe', { ruta })));
        return false;
      }
      this.servicios.auto.programar(this.id, ruta, '');
      await this.servicios.auto.guardarTodo();
      await this.refrescarArchivos();
      this.abrirArchivo(ruta);
      return true;
    } catch (e) {
      this.avisarError(e);
      return false;
    }
  }

  async renombrarArchivo(vieja: string, nuevaEscrita: string): Promise<boolean> {
    try {
      const nueva = normalizarRuta(nuevaEscrita);
      if (nueva === vieja) return true;
      if (this.rutas().has(nueva)) {
        this.avisar('error', plano(t('archivos.error.ya_existe', { ruta: nueva })));
        return false;
      }
      await this.servicios.auto.renombrar(this.id, vieja, nueva);
      // Las vistas se vuelven a crear con el nuevo nombre (lenguaje y etiqueta dependen de la ruta).
      for (const mapa of [this.estadosEditor, this.vistas] as Array<Map<string, unknown>>) {
        for (const r of [...mapa.keys()]) if (estaBajo(r, vieja)) mapa.delete(r);
      }
      const mover = (r: string) => moverBajo(r, vieja, nueva) ?? r;
      this.abiertos = this.abiertos.map(mover);
      if (this.activo) this.activo = mover(this.activo);
      for (const r of [...this.sucios]) if (estaBajo(r, vieja)) this.sucios.delete(r);
      this.conflictos = this.conflictos.map(mover);
      await Promise.all([this.refrescarArchivos(), this.recargarProyecto()]);
      void this.guardarPestanas();
      return true;
    } catch (e) {
      this.avisarError(e);
      return false;
    }
  }

  /**
   * Manda un archivo o carpeta a la papelera (D29). Sin confirmación: es reversible. El aviso trae «Deshacer», que
   * restaura desde la papelera (sobrevive a recargar) y se queda hasta que se cierre.
   */
  async borrarArchivo(ruta: string): Promise<void> {
    try {
      // `auto.borrar` guarda antes lo pendiente (la papelera conserva la última versión) y no borra si algo no se pudo guardar.
      const elemento = await this.servicios.auto.borrar(this.id, ruta);
      for (const r of this.abiertos.filter((x) => estaBajo(x, ruta))) this.cerrarArchivo(r);
      for (const r of [...this.sucios]) if (estaBajo(r, ruta)) this.sucios.delete(r);
      await Promise.all([this.refrescarArchivos(), this.recargarProyecto(), this.refrescarPapelera()]);
      const dias = await leerDias(this.servicios.almacen, acerca.papelera);
      this.avisar('info', plano(t('archivos.borrado', { ruta, dias })), {
        etiqueta: t('archivos.deshacer'),
        ejecutar: () => void this.restaurarDePapelera(elemento, true),
      });
    } catch (e) {
      this.avisarError(e);
    }
  }

  /**
   * Devuelve un elemento de la papelera de este proyecto a su lugar. Con `deshacer` solo avisa si tuvo que cambiarle
   * el nombre; desde la lista de la papelera siempre dice qué se restauró.
   */
  async restaurarDePapelera(elemento: ElementoPapelera, deshacer = false): Promise<void> {
    try {
      const r = await this.servicios.auto.restaurarDePapelera(elemento.id);
      await Promise.all([this.refrescarArchivos(), this.recargarProyecto(), this.refrescarPapelera()]);
      const primera = r.rutas[0];
      const cambioNombre = !!primera && primera.final !== primera.original;
      if (!deshacer || cambioNombre) this.avisar('info', textoRestaurado(elemento, r));
      if (elemento.clase === 'archivo' && primera) this.abrirArchivo(primera.final);
      if (primera) this.enfocarArbol = { ruta: primera.final, n: (this.enfocarArbol?.n ?? 0) + 1 };
    } catch (e) {
      this.avisarError(e);
      await this.refrescarPapelera();
    }
  }

  /** Agrega archivos del equipo (arrastrar y soltar o el botón «Subir archivos») a una carpeta del proyecto. */
  async subirArchivos(archivos: readonly File[], carpeta = ''): Promise<void> {
    if (archivos.length === 0) return;
    try {
      const ocupadas = this.rutas();
      let agregados = 0;
      let primero: string | undefined;
      for (const archivo of archivos) {
        const nombre = nombreUnico(ocupadas, carpeta, archivo.name.replace(/[\\/]/g, '_'));
        const ruta = normalizarRuta(unirRuta(carpeta, nombre));
        const bytes = new Uint8Array(await archivo.arrayBuffer());
        this.servicios.auto.programar(this.id, ruta, bytes);
        ocupadas.add(ruta);
        primero ??= ruta;
        agregados++;
      }
      await this.servicios.auto.guardarTodo();
      await this.refrescarArchivos();
      this.avisar('info', plano(t('archivos.subidos', { n: agregados })));
      if (agregados === 1 && primero && tipoPorRuta(primero) === 'texto') this.abrirArchivo(primero);
    } catch (e) {
      this.avisarError(e);
    }
  }

  /** Manda el proyecto a la papelera (guarda antes lo pendiente). */
  async moverAPapelera(): Promise<void> {
    await this.servicios.auto.moverAPapelera(this.id);
  }

  // ---------- cambios hechos en otra pestaña ----------

  private async alAvisoExterno(a: Aviso): Promise<void> {
    if (this.destruido) return;
    if (a.tipo === 'cambio-papelera') {
      if (a.elemento.proyectoId === this.id) await this.refrescarPapelera();
      return;
    }
    if (a.proyectoId !== this.id) return;
    if (a.tipo === 'cambio-proyecto') {
      await this.recargarProyecto();
      return;
    }
    // Antes de cualquier await: un guardado programado no debe pisar la versión de la otra pestaña.
    const enConflicto = this.abiertos.includes(a.ruta) && this.sucios.has(a.ruta);
    if (enConflicto) {
      if (!this.conflictos.includes(a.ruta)) this.conflictos = [...this.conflictos, a.ruta];
      this.servicios.auto.descartar(this.id, a.ruta);
    }
    await this.refrescarArchivos();
    if (!this.abiertos.includes(a.ruta)) return;
    if (!this.conocidas.has(a.ruta)) {
      // Otra pestaña borró el archivo que aquí está abierto: se conserva el texto (el próximo guardado lo recrea).
      if (enConflicto) this.conservarMiVersion(a.ruta);
      this.avisar('aviso', plano(t('editor.borrado_en_otra', { ruta: a.ruta })));
      return;
    }
    if (enConflicto || this.sucios.has(a.ruta)) {
      if (!this.conflictos.includes(a.ruta)) this.conflictos = [...this.conflictos, a.ruta];
      this.servicios.auto.descartar(this.id, a.ruta);
      return;
    }
    await this.recargarDesdeAlmacen(a.ruta);
  }

  /** Reemplaza el texto abierto por el del almacén (sin tocar el historial ni disparar un guardado). */
  async recargarDesdeAlmacen(ruta: string): Promise<void> {
    const archivo = await this.servicios.almacen.leer(this.id, ruta);
    if (!archivo || archivo.tipo !== 'texto') return;
    const texto = aTexto(archivo.contenido);
    const vista = this.vistas.get(ruta);
    const previo = vista?.state ?? this.estadosEditor.get(ruta);
    if (!previo) return;
    const tr = reemplazarTextoExterno(previo, texto);
    if (vista) vista.dispatch(tr);
    else this.estadosEditor.set(ruta, tr.state);
  }

  /** Conflicto: descarta lo que había aquí y carga la versión que dejó la otra pestaña. */
  async usarVersionDeOtraPestana(ruta: string): Promise<void> {
    this.servicios.auto.descartar(this.id, ruta);
    this.sucios.delete(ruta);
    this.quitarConflicto(ruta);
    await this.recargarDesdeAlmacen(ruta);
  }

  /** Conflicto: se queda lo de esta pestaña y se vuelve a guardar encima. */
  conservarMiVersion(ruta: string): void {
    this.quitarConflicto(ruta);
    const vista = this.vistas.get(ruta);
    const doc = (vista?.state ?? this.estadosEditor.get(ruta))?.doc.toString();
    if (doc !== undefined) this.servicios.auto.programar(this.id, ruta, doc);
  }

  private quitarConflicto(ruta: string): void {
    if (this.conflictos.includes(ruta)) this.conflictos = this.conflictos.filter((r) => r !== ruta);
  }

  // ---------- PDF, problemas y salida (la compilación los llena en la sesión 09) ----------

  mostrarPdf(bytes: Uint8Array, nombre: string): void {
    this.pdf = { bytes, nombre, version: ++this.contadorPdf };
  }

  // ---------- mensajes ----------

  avisar(tipo: Mensaje['tipo'], texto: string, accion?: Mensaje['accion']): number {
    const id = ++this.contadorMensajes;
    this.mensajes = [...this.mensajes, { id, tipo, texto, accion }];
    if (tipo === 'info' && !accion && typeof setTimeout !== 'undefined')
      setTimeout(() => this.quitarMensaje(id), SEGUNDOS_MENSAJE * 1000);
    return id;
  }

  avisarError(e: unknown): void {
    this.avisar('error', plano(textoDeError(e)));
  }

  quitarMensaje(id: number): void {
    this.mensajes = this.mensajes.filter((m) => m.id !== id);
  }

  /** Nombre del archivo para mostrar en una pestaña o fila. */
  static nombre(ruta: string): string {
    return nombreDe(ruta);
  }
}
