// SPDX-License-Identifier: AGPL-3.0-or-later
// Implementación en memoria: pruebas y respaldo si IndexedDB no está disponible (nada sobrevive a cerrar la pestaña).
import { ErrorAlmacen } from './errores';
import {
  elementoDeRegistro,
  estaCaducado,
  idDeProyecto,
  ordenarPapelera,
  proyectoDeId,
  requiereResello,
  sellar,
  type RegistroPapelera,
} from './papelera';
import {
  ajustarContenido,
  Emisor,
  estaBajo,
  normalizarRuta,
  nuevoId,
  planearRenombrado,
  planearRestauracion,
  sinContenido,
  validarArbol,
} from './rutas';
import type {
  Almacen,
  ArchivoInicial,
  ArchivoProyecto,
  Contenido,
  DatosProyecto,
  ElementoPapelera,
  EventoAlmacen,
  FiltroProyectos,
  OpcionesAlmacen,
  Proyecto,
  ResultadoRestaurar,
} from './tipos';

const copiar = <T>(v: T): T => structuredClone(v);

export function crearAlmacenMemoria(opciones: OpcionesAlmacen = {}): Almacen {
  const ahora = opciones.ahora ?? Date.now;
  const margenDias = opciones.margenDias ?? 1;
  const proyectos = new Map<string, Proyecto>();
  const archivos = new Map<string, Map<string, ArchivoProyecto>>();
  const ajustes = new Map<string, unknown>();
  const distribuciones = new Map<string, unknown>();
  const herramientas = new Map<string, unknown>();
  // Papelera de archivos y carpetas: un registro por elemento y, aparte, los archivos que contiene.
  const papelera = new Map<string, RegistroPapelera>();
  const papeleraArchivos = new Map<string, Map<string, ArchivoProyecto>>();
  const emisor = new Emisor<EventoAlmacen>();

  const sello = () => sellar(opciones.horaConfiable?.(), ahora);
  const proyecto = (id: string): Proyecto => {
    const p = proyectos.get(id);
    if (!p) throw new ErrorAlmacen('proyecto_inexistente');
    return p;
  };
  const activo = (id: string): Proyecto => {
    const p = proyecto(id);
    if (p.enPapelera !== undefined) throw new ErrorAlmacen('proyecto_en_papelera');
    return p;
  };
  const arbol = (id: string): Map<string, ArchivoProyecto> => {
    let a = archivos.get(id);
    if (!a) archivos.set(id, (a = new Map()));
    return a;
  };
  const nombreValido = (nombre: string): string => {
    const limpio = typeof nombre === 'string' ? nombre.trim() : '';
    if (!limpio) throw new ErrorAlmacen('nombre_invalido');
    return limpio;
  };
  const crearArchivo = (
    proyectoId: string,
    ruta: string,
    contenido: Contenido,
    t: number,
  ): ArchivoProyecto => ({
    proyectoId,
    ruta,
    ...ajustarContenido(ruta, copiar(contenido)),
    modificado: t,
  });

  // ---------- papelera ----------

  const elementoDeProyecto = (p: Proyecto): ElementoPapelera => {
    let tamano = 0;
    let cuantos = 0;
    let incluye = 0;
    for (const a of archivos.get(p.id)?.values() ?? []) {
      tamano += a.tamano;
      cuantos++;
    }
    for (const r of papelera.values()) {
      if (r.proyectoId !== p.id) continue;
      tamano += r.tamano;
      cuantos += r.cuantos;
      incluye++;
    }
    return {
      id: idDeProyecto(p.id),
      clase: 'proyecto',
      proyectoId: p.id,
      nombreProyecto: p.nombre,
      fecha: p.enPapelera ?? 0,
      fechaConfiable: p.enPapeleraConfiable === true,
      tamano,
      cuantos,
      incluye,
    };
  };

  const listar = (): ElementoPapelera[] => {
    const lista: ElementoPapelera[] = [];
    for (const p of proyectos.values()) if (p.enPapelera !== undefined) lista.push(elementoDeProyecto(p));
    // Los elementos de un proyecto en la papelera viajan con su proyecto.
    for (const r of papelera.values()) {
      const p = proyectos.get(r.proyectoId);
      if (p && p.enPapelera === undefined) lista.push(elementoDeRegistro(r, p.nombre));
    }
    return ordenarPapelera(lista);
  };

  /** Borra el proyecto y todo lo suyo, o un registro con sus archivos. `undefined` si ya no existía. */
  const quitarDefinitivo = (elementoId: string): ElementoPapelera | undefined => {
    const idProyecto = proyectoDeId(elementoId);
    if (idProyecto !== undefined) {
      const p = proyectos.get(idProyecto);
      if (!p || p.enPapelera === undefined) return undefined;
      const elemento = elementoDeProyecto(p);
      for (const [id, r] of [...papelera]) {
        if (r.proyectoId !== idProyecto) continue;
        papelera.delete(id);
        papeleraArchivos.delete(id);
      }
      proyectos.delete(idProyecto);
      archivos.delete(idProyecto);
      distribuciones.delete(idProyecto);
      ajustes.delete(`folio.pestanas.${idProyecto}`);
      return elemento;
    }
    const r = papelera.get(elementoId);
    if (!r) return undefined;
    const elemento = elementoDeRegistro(r, proyectos.get(r.proyectoId)?.nombre ?? '');
    papelera.delete(elementoId);
    papeleraArchivos.delete(elementoId);
    return elemento;
  };

  const avisarBorrado = (elemento: ElementoPapelera) =>
    emisor.emitir({ tipo: 'cambio-papelera', accion: 'borrado-definitivo', elemento });

  const api: Almacen = {
    async listarProyectos(filtro: FiltroProyectos = 'activos') {
      return [...proyectos.values()]
        .filter((p) => filtro === 'todos' || (filtro === 'papelera') === (p.enPapelera !== undefined))
        .sort((a, b) => b.modificado - a.modificado || a.id.localeCompare(b.id))
        .map(copiar);
    },

    async crearProyecto(datos: DatosProyecto, iniciales: ArchivoInicial[] = []) {
      const nombre = nombreValido(datos.nombre);
      const t = ahora();
      const rutas = iniciales.map((a) => normalizarRuta(a.ruta));
      validarArbol(rutas);
      const principal = datos.principal === undefined ? 'main.tex' : normalizarRuta(datos.principal);
      const p: Proyecto = {
        id: nuevoId(),
        nombre,
        creado: t,
        modificado: t,
        principal,
        motor: datos.motor ?? 'pdflatex',
      };
      if (datos.plantilla !== undefined) p.plantilla = datos.plantilla;
      const nuevos = new Map<string, ArchivoProyecto>();
      iniciales.forEach((a, i) => nuevos.set(rutas[i]!, crearArchivo(p.id, rutas[i]!, a.contenido, t)));
      proyectos.set(p.id, p);
      archivos.set(p.id, nuevos);
      emisor.emitir({ tipo: 'cambio-proyecto', proyectoId: p.id });
      return copiar(p);
    },

    async obtenerProyecto(id) {
      const p = proyectos.get(id);
      return p && copiar(p);
    },

    async renombrarProyecto(id, nombre) {
      const p = activo(id);
      p.nombre = nombreValido(nombre);
      p.modificado = ahora();
      emisor.emitir({ tipo: 'cambio-proyecto', proyectoId: id });
    },

    async moverAPapelera(id) {
      const p = proyecto(id);
      if (p.enPapelera !== undefined) return;
      const { fecha, fechaConfiable } = sello();
      p.enPapelera = fecha;
      p.enPapeleraConfiable = fechaConfiable;
      emisor.emitir({ tipo: 'cambio-proyecto', proyectoId: id });
      emisor.emitir({ tipo: 'cambio-papelera', accion: 'entra', elemento: elementoDeProyecto(p) });
    },

    async restaurar(id) {
      await api.restaurarDePapelera(idDeProyecto(id));
    },

    async listarArchivos(id) {
      proyecto(id);
      return [...arbol(id).values()]
        .map(sinContenido)
        .sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : 0));
    },

    async leer(id, ruta) {
      proyecto(id);
      const a = arbol(id).get(normalizarRuta(ruta));
      return a && copiar(a);
    },

    async escribir(id, ruta, contenido) {
      const p = activo(id);
      const r = normalizarRuta(ruta);
      const a = arbol(id);
      validarArbol([...[...a.keys()].filter((k) => k !== r), r]);
      const t = ahora();
      a.set(r, crearArchivo(id, r, contenido, t));
      p.modificado = t;
      emisor.emitir({ tipo: 'cambio-archivo', proyectoId: id, ruta: r });
    },

    async renombrar(id, rutaVieja, rutaNueva) {
      const p = activo(id);
      const vieja = normalizarRuta(rutaVieja);
      const nueva = normalizarRuta(rutaNueva);
      const a = arbol(id);
      const plan = planearRenombrado([...a.keys()], vieja, nueva);
      if (plan.size === 0) return;
      // Se trabaja sobre una copia y se confirma al final: si algo falla a la mitad, no cambia nada.
      const copia = new Map(a);
      const t = ahora();
      let i = 0;
      for (const [desde, hasta] of plan) {
        opciones.inyectarFallo?.('renombrar', i++);
        const archivo = copia.get(desde)!;
        copia.delete(desde);
        copia.set(hasta, {
          ...archivo,
          ...ajustarContenido(hasta, archivo.contenido),
          ruta: hasta,
          modificado: t,
        });
      }
      archivos.set(id, copia);
      p.modificado = t;
      if (estaBajo(p.principal, vieja)) p.principal = nueva + p.principal.slice(vieja.length);
      for (const [desde, hasta] of plan) {
        emisor.emitir({ tipo: 'cambio-archivo', proyectoId: id, ruta: desde });
        emisor.emitir({ tipo: 'cambio-archivo', proyectoId: id, ruta: hasta });
      }
    },

    async moverArchivosAPapelera(id, ruta) {
      const p = activo(id);
      const r = normalizarRuta(ruta);
      const a = arbol(id);
      const quitar = [...a.keys()].filter((k) => estaBajo(k, r));
      if (quitar.length === 0) throw new ErrorAlmacen('archivo_inexistente', { ruta: r });
      // Se prepara todo aparte y se confirma al final: si algo falla a la mitad, no cambia nada.
      const contenido = new Map<string, ArchivoProyecto>();
      let tamano = 0;
      quitar.forEach((k, i) => {
        opciones.inyectarFallo?.('papelera', i);
        const archivo = a.get(k)!;
        contenido.set(k, copiar(archivo));
        tamano += archivo.tamano;
      });
      const registro: RegistroPapelera = {
        id: nuevoId(),
        proyectoId: id,
        clase: a.has(r) ? 'archivo' : 'carpeta',
        ruta: r,
        ...sello(),
        tamano,
        cuantos: quitar.length,
      };
      papelera.set(registro.id, registro);
      papeleraArchivos.set(registro.id, contenido);
      for (const k of quitar) a.delete(k);
      p.modificado = ahora();
      const elemento = elementoDeRegistro(registro, p.nombre);
      for (const k of quitar) emisor.emitir({ tipo: 'cambio-archivo', proyectoId: id, ruta: k });
      emisor.emitir({ tipo: 'cambio-papelera', accion: 'entra', elemento });
      return copiar(elemento);
    },

    async listarPapelera() {
      return listar().map(copiar);
    },

    async restaurarDePapelera(elementoId): Promise<ResultadoRestaurar> {
      const idProyecto = proyectoDeId(elementoId);
      if (idProyecto !== undefined) {
        const p = proyectos.get(idProyecto);
        if (!p || p.enPapelera === undefined) throw new ErrorAlmacen('elemento_inexistente');
        const elemento = elementoDeProyecto(p);
        delete p.enPapelera;
        delete p.enPapeleraConfiable;
        emisor.emitir({ tipo: 'cambio-proyecto', proyectoId: idProyecto });
        emisor.emitir({ tipo: 'cambio-papelera', accion: 'restaurado', elemento });
        return { proyectoId: idProyecto, rutas: [] };
      }
      const registro = papelera.get(elementoId);
      const p = registro && proyectos.get(registro.proyectoId);
      if (!registro || !p) throw new ErrorAlmacen('elemento_inexistente');
      if (p.enPapelera !== undefined) throw new ErrorAlmacen('proyecto_en_papelera');
      const guardados = papeleraArchivos.get(elementoId) ?? new Map<string, ArchivoProyecto>();
      const a = arbol(p.id);
      const { mapa } = planearRestauracion([...a.keys()], registro.ruta, [...guardados.keys()]);
      const elemento = elementoDeRegistro(registro, p.nombre);
      // Se arma una copia del árbol y se confirma al final: un fallo a la mitad no deja nada restaurado.
      const copia = new Map(a);
      let i = 0;
      for (const [desde, hasta] of mapa) {
        opciones.inyectarFallo?.('restaurar', i++);
        copia.set(hasta, { ...copiar(guardados.get(desde)!), ruta: hasta });
      }
      archivos.set(p.id, copia);
      papelera.delete(elementoId);
      papeleraArchivos.delete(elementoId);
      p.modificado = ahora();
      for (const hasta of mapa.values())
        emisor.emitir({ tipo: 'cambio-archivo', proyectoId: p.id, ruta: hasta });
      emisor.emitir({ tipo: 'cambio-papelera', accion: 'restaurado', elemento });
      return { proyectoId: p.id, rutas: [...mapa].map(([original, final]) => ({ original, final })) };
    },

    async borrarDefinitivo(elementoId) {
      const elemento = quitarDefinitivo(elementoId);
      if (!elemento) throw new ErrorAlmacen('elemento_inexistente');
      avisarBorrado(elemento);
    },

    async vaciarPapelera() {
      const lista = listar();
      for (const e of lista) {
        const quitado = quitarDefinitivo(e.id);
        if (quitado) avisarBorrado(quitado);
      }
      return lista.length;
    },

    async purgarCaducados(dias) {
      const hora = opciones.horaConfiable?.();
      if (hora === undefined) return [];
      // Se vuelven a sellar los elementos con fecha sin confirmar o en el futuro: su plazo cuenta desde ahora.
      for (const p of proyectos.values()) {
        if (
          p.enPapelera !== undefined &&
          requiereResello(p.enPapelera, p.enPapeleraConfiable === true, hora)
        ) {
          p.enPapelera = hora;
          p.enPapeleraConfiable = true;
        }
      }
      for (const r of papelera.values()) {
        if (requiereResello(r.fecha, r.fechaConfiable, hora)) {
          r.fecha = hora;
          r.fechaConfiable = true;
        }
      }
      const borrados: ElementoPapelera[] = [];
      for (const e of listar()) {
        if (!e.fechaConfiable || !estaCaducado(e.fecha, dias, margenDias, hora)) continue;
        const quitado = quitarDefinitivo(e.id);
        if (!quitado) continue;
        borrados.push(quitado);
        avisarBorrado(quitado);
      }
      return borrados;
    },

    async leerAjuste<T>(clave: string) {
      return copiar(ajustes.get(clave)) as T | undefined;
    },
    async guardarAjuste(clave, valor) {
      ajustes.set(clave, copiar(valor));
    },
    async leerDistribucion<T>(clave: string) {
      return copiar(distribuciones.get(clave)) as T | undefined;
    },
    async guardarDistribucion(clave, json) {
      distribuciones.set(clave, copiar(json));
    },
    async leerHerramienta<T>(id: string) {
      return copiar(herramientas.get(id)) as T | undefined;
    },
    async guardarHerramienta(id, estado) {
      herramientas.set(id, copiar(estado));
    },

    al: (evento, fn) => emisor.al(evento, fn),
    cerrar() {
      emisor.limpiar();
    },
  };
  return api;
}
