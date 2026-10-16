// SPDX-License-Identifier: AGPL-3.0-or-later
// Implementación sobre IndexedDB (biblioteca `idb`): proyectos, archivos, papelera, ajustes, distribuciones y herramientas.
// Cada operación que toca varios registros (crear proyecto, renombrar carpeta, escribir, mandar a la papelera) es UNA transacción.
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import { ErrorAlmacen, traducirErrorNativo } from './errores';
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
  ancestros,
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
  DatosProyecto,
  ElementoPapelera,
  EventoAlmacen,
  FiltroProyectos,
  InfoArchivo,
  OpcionesAlmacen,
  Proyecto,
  ResultadoRestaurar,
} from './tipos';

export const NOMBRE_BD = 'ipn-folio';
/**
 * Versión de la base. 1: proyectos, archivos, ajustes, distribuciones, herramientas. 2: papelera (sesión 11).
 * Quien llegue segundo a `main` entre las sesiones que migran la base renumera su paso a la versión siguiente.
 */
export const VERSION_BD = 2;

/** Un archivo guardado en la papelera: el mismo registro que tenía, más el elemento al que pertenece. */
export interface ArchivoPapelera extends ArchivoProyecto {
  elementoId: string;
}

export interface EsquemaFolio extends DBSchema {
  proyectos: { key: string; value: Proyecto };
  archivos: {
    key: [string, string];
    value: ArchivoProyecto;
    indexes: { porProyecto: string };
  };
  ajustes: { key: string; value: unknown };
  distribuciones: { key: string; value: unknown };
  herramientas: { key: string; value: unknown };
  papelera: { key: string; value: RegistroPapelera; indexes: { porProyecto: string } };
  papeleraArchivos: { key: [string, string]; value: ArchivoPapelera };
}

type Almacenes = StoreNames<EsquemaFolio>;
type Tx<A extends Almacenes[]> = IDBPTransaction<EsquemaFolio, A, 'readwrite'>;

const ALMACENES_PAPELERA = [
  'proyectos',
  'archivos',
  'papelera',
  'papeleraArchivos',
  'ajustes',
  'distribuciones',
] satisfies Almacenes[];
type TxPapelera = IDBPTransaction<EsquemaFolio, typeof ALMACENES_PAPELERA, IDBTransactionMode>;
type TxPapeleraEscritura = IDBPTransaction<EsquemaFolio, typeof ALMACENES_PAPELERA, 'readwrite'>;

/** Rango de claves de todos los archivos de un proyecto (las rutas nunca llevan U+FFFF). */
const rangoProyecto = (id: string) => IDBKeyRange.bound([id, ''], [id, '￿']);
const rangoCarpeta = (id: string, ruta: string) => IDBKeyRange.bound([id, ruta + '/'], [id, ruta + '/￿']);
/** Rango de los archivos de un elemento de la papelera. */
const rangoElemento = rangoProyecto;

/**
 * Pasos de migración, uno por versión y en orden. Cada paso solo conoce la versión anterior: una base nueva los
 * recorre todos; una base v1 solo el 2 y sus datos no se tocan.
 */
export function migrar(base: IDBPDatabase<EsquemaFolio>, anterior: number): void {
  if (anterior < 1) {
    base.createObjectStore('proyectos', { keyPath: 'id' });
    const archivos = base.createObjectStore('archivos', { keyPath: ['proyectoId', 'ruta'] });
    archivos.createIndex('porProyecto', 'proyectoId');
    base.createObjectStore('ajustes');
    base.createObjectStore('distribuciones');
    base.createObjectStore('herramientas');
  }
  if (anterior < 2) {
    const papelera = base.createObjectStore('papelera', { keyPath: 'id' });
    papelera.createIndex('porProyecto', 'proyectoId');
    base.createObjectStore('papeleraArchivos', { keyPath: ['elementoId', 'ruta'] });
  }
}

/** Espera máxima (ms) a que quien escucha `version-nueva` guarde y suelte la base antes de soltarla a la fuerza. */
const ESPERA_BLOQUEO = 2500;

export async function crearAlmacenIdb(opciones: OpcionesAlmacen = {}): Promise<Almacen> {
  if (typeof indexedDB === 'undefined') throw new ErrorAlmacen('almacen_no_disponible');
  const ahora = opciones.ahora ?? Date.now;
  const margenDias = opciones.margenDias ?? 1;
  const emisor = new Emisor<EventoAlmacen>();

  let db: IDBPDatabase<EsquemaFolio>;
  let cerrada = false;
  let cerradaPorVersion = false;
  let temporizadorBloqueo: ReturnType<typeof setTimeout> | undefined;
  let estuvoBloqueada = false;

  function soltarConexion(): void {
    if (cerrada) return;
    cerrada = true;
    if (temporizadorBloqueo !== undefined) clearTimeout(temporizadorBloqueo);
    db.close();
  }

  try {
    db = await openDB<EsquemaFolio>(opciones.nombreBD ?? NOMBRE_BD, VERSION_BD, {
      upgrade(base, anterior) {
        migrar(base, anterior);
      },
      // Esta pestaña quiere actualizar la base y otra no la suelta: se avisa y se sigue esperando.
      blocked() {
        estuvoBloqueada = true;
        opciones.alAbrir?.({ tipo: 'almacen-bloqueado' });
      },
      // Otra pestaña con una versión más nueva quiere actualizar: quien escucha `version-nueva` guarda y cierra; si
      // nadie lo hace a tiempo, se suelta a la fuerza para no bloquear a la otra pestaña.
      blocking() {
        if (cerrada) return;
        cerradaPorVersion = true;
        emisor.emitir({ tipo: 'version-nueva' });
        if (!cerrada) temporizadorBloqueo = setTimeout(soltarConexion, ESPERA_BLOQUEO);
      },
      // El navegador cerró la conexión (p. ej. por falta de espacio o al borrar los datos del sitio).
      terminated() {
        cerrada = true;
        emisor.emitir({ tipo: 'almacen-cerrado' });
      },
    });
  } catch (e) {
    if (e instanceof ErrorAlmacen) throw e;
    // La base ya es más nueva que este código (una pestaña vieja que se recarga desde caché): NO se cae a memoria.
    const nombreError = (e as { name?: string } | null)?.name;
    if (nombreError === 'VersionError') throw new ErrorAlmacen('version_nueva');
    // Ventana privada o permisos: no hay dónde guardar y se trabaja en memoria. Cualquier otro fallo (p. ej. al
    // migrar) NO: la lista saldría vacía y lo que se haga se perdería; se avisa de forma persistente.
    if (nombreError === 'SecurityError' || nombreError === 'InvalidStateError')
      throw new ErrorAlmacen('almacen_no_disponible');
    throw new ErrorAlmacen('apertura_fallida');
  }
  if (estuvoBloqueada) opciones.alAbrir?.({ tipo: 'almacen-liberado' });

  /** La conexión, o el error con la acción a seguir si ya se soltó porque hay una versión más nueva. */
  const conexion = (): IDBPDatabase<EsquemaFolio> => {
    if (cerrada) throw new ErrorAlmacen(cerradaPorVersion ? 'version_nueva' : 'almacen_cerrado');
    return db;
  };

  /** Ejecuta `fn` en una transacción de escritura; ante cualquier error la deshace por completo. */
  async function transaccion<A extends Almacenes[], R>(
    almacenes: [...A],
    fn: (tx: Tx<A>) => Promise<R>,
  ): Promise<R> {
    const tx = conexion().transaction(almacenes, 'readwrite');
    try {
      const resultado = await fn(tx);
      await tx.done;
      return resultado;
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* ya terminada */
      }
      await tx.done.catch(() => undefined);
      throw traducirErrorNativo(e);
    }
  }

  const nombreValido = (nombre: string): string => {
    const limpio = typeof nombre === 'string' ? nombre.trim() : '';
    if (!limpio) throw new ErrorAlmacen('nombre_invalido');
    return limpio;
  };

  async function proyectoActivo(
    almacenProyectos: { get(id: string): Promise<Proyecto | undefined> },
    id: string,
  ): Promise<Proyecto> {
    const p = await almacenProyectos.get(id);
    if (!p) throw new ErrorAlmacen('proyecto_inexistente');
    if (p.enPapelera !== undefined) throw new ErrorAlmacen('proyecto_en_papelera');
    return p;
  }

  const sello = () => sellar(opciones.horaConfiable?.(), ahora);

  // ---------- papelera ----------

  /** El proyecto como elemento de la papelera: tamaño y cantidad suman sus archivos y su papelera interna. */
  async function elementoDeProyecto(tx: TxPapelera, p: Proyecto): Promise<ElementoPapelera> {
    let tamano = 0;
    let cuantos = 0;
    let cursor = await tx.objectStore('archivos').index('porProyecto').openCursor(p.id);
    while (cursor) {
      tamano += cursor.value.tamano;
      cuantos++;
      cursor = await cursor.continue();
    }
    const internos = await tx.objectStore('papelera').index('porProyecto').getAll(p.id);
    for (const r of internos) {
      tamano += r.tamano;
      cuantos += r.cuantos;
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
      incluye: internos.length,
    };
  }

  async function listarEn(tx: TxPapelera): Promise<ElementoPapelera[]> {
    const proyectos = new Map((await tx.objectStore('proyectos').getAll()).map((p) => [p.id, p]));
    const lista: ElementoPapelera[] = [];
    for (const p of proyectos.values())
      if (p.enPapelera !== undefined) lista.push(await elementoDeProyecto(tx, p));
    // Los elementos de un proyecto en la papelera viajan con su proyecto.
    for (const r of await tx.objectStore('papelera').getAll()) {
      const p = proyectos.get(r.proyectoId);
      if (p && p.enPapelera === undefined) lista.push(elementoDeRegistro(r, p.nombre));
    }
    return ordenarPapelera(lista);
  }

  /** Borra el proyecto y todo lo suyo, o un registro con sus archivos. `undefined` si ya no existía. */
  async function quitarDefinitivo(
    tx: TxPapeleraEscritura,
    elementoId: string,
  ): Promise<ElementoPapelera | undefined> {
    const papelera = tx.objectStore('papelera');
    const guardados = tx.objectStore('papeleraArchivos');
    const idProyecto = proyectoDeId(elementoId);
    if (idProyecto !== undefined) {
      const p = await tx.objectStore('proyectos').get(idProyecto);
      if (!p || p.enPapelera === undefined) return undefined;
      const elemento = await elementoDeProyecto(tx, p);
      for (const r of await papelera.index('porProyecto').getAll(idProyecto)) {
        await guardados.delete(rangoElemento(r.id));
        await papelera.delete(r.id);
      }
      await tx.objectStore('archivos').delete(rangoProyecto(idProyecto));
      await tx.objectStore('proyectos').delete(idProyecto);
      await tx.objectStore('distribuciones').delete(idProyecto);
      await tx.objectStore('ajustes').delete(`folio.pestanas.${idProyecto}`);
      return elemento;
    }
    const r = await papelera.get(elementoId);
    if (!r) return undefined;
    const p = await tx.objectStore('proyectos').get(r.proyectoId);
    const elemento = elementoDeRegistro(r, p?.nombre ?? '');
    await guardados.delete(rangoElemento(elementoId));
    await papelera.delete(elementoId);
    return elemento;
  }

  const avisarBorrado = (elementos: ElementoPapelera[]) => {
    for (const elemento of elementos)
      emisor.emitir({ tipo: 'cambio-papelera', accion: 'borrado-definitivo', elemento });
  };

  const api: Almacen = {
    async listarProyectos(filtro: FiltroProyectos = 'activos') {
      const todos = await conexion().getAll('proyectos');
      return todos
        .filter((p) => filtro === 'todos' || (filtro === 'papelera') === (p.enPapelera !== undefined))
        .sort((a, b) => b.modificado - a.modificado || a.id.localeCompare(b.id));
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
      await transaccion(['proyectos', 'archivos'], async (tx) => {
        const almacenArchivos = tx.objectStore('archivos');
        await Promise.all([
          tx.objectStore('proyectos').put(p),
          ...iniciales.map((a, i) =>
            almacenArchivos.put({
              proyectoId: p.id,
              ruta: rutas[i]!,
              ...ajustarContenido(rutas[i]!, a.contenido),
              modificado: t,
            }),
          ),
        ]);
      });
      emisor.emitir({ tipo: 'cambio-proyecto', proyectoId: p.id });
      return p;
    },

    obtenerProyecto: (id) => conexion().get('proyectos', id),

    async renombrarProyecto(id, nombre) {
      const limpio = nombreValido(nombre);
      await transaccion(['proyectos'], async (tx) => {
        const p = await proyectoActivo(tx.objectStore('proyectos'), id);
        await tx.objectStore('proyectos').put({ ...p, nombre: limpio, modificado: ahora() });
      });
      emisor.emitir({ tipo: 'cambio-proyecto', proyectoId: id });
    },

    async moverAPapelera(id) {
      const elemento = await transaccion([...ALMACENES_PAPELERA], async (tx) => {
        const p = await tx.objectStore('proyectos').get(id);
        if (!p) throw new ErrorAlmacen('proyecto_inexistente');
        if (p.enPapelera !== undefined) return undefined;
        const { fecha, fechaConfiable } = sello();
        const nuevo: Proyecto = { ...p, enPapelera: fecha, enPapeleraConfiable: fechaConfiable };
        await tx.objectStore('proyectos').put(nuevo);
        return elementoDeProyecto(tx, nuevo);
      });
      if (!elemento) return;
      emisor.emitir({ tipo: 'cambio-proyecto', proyectoId: id });
      emisor.emitir({ tipo: 'cambio-papelera', accion: 'entra', elemento });
    },

    async restaurar(id) {
      await api.restaurarDePapelera(idDeProyecto(id));
    },

    async listarArchivos(id) {
      const base = conexion();
      if (!(await base.get('proyectos', id))) throw new ErrorAlmacen('proyecto_inexistente');
      const info: InfoArchivo[] = [];
      // Cursor: se descarta el contenido de cada archivo en cuanto se lee, para no acumular imágenes en memoria.
      let cursor = await base.transaction('archivos').store.index('porProyecto').openCursor(id);
      while (cursor) {
        info.push(sinContenido(cursor.value));
        cursor = await cursor.continue();
      }
      return info.sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : 0));
    },

    async leer(id, ruta) {
      const r = normalizarRuta(ruta);
      const base = conexion();
      if (!(await base.get('proyectos', id))) throw new ErrorAlmacen('proyecto_inexistente');
      return base.get('archivos', [id, r]);
    },

    async escribir(id, ruta, contenido) {
      const r = normalizarRuta(ruta);
      await transaccion(['proyectos', 'archivos'], async (tx) => {
        const p = await proyectoActivo(tx.objectStore('proyectos'), id);
        const archivos = tx.objectStore('archivos');
        // Un archivo no puede llamarse como una carpeta existente ni colgar de un archivo.
        for (const a of ancestros(r)) {
          if (await archivos.getKey([id, a])) throw new ErrorAlmacen('destino_ocupado', { ruta: a });
        }
        if (await archivos.getKey(rangoCarpeta(id, r)))
          throw new ErrorAlmacen('destino_ocupado', { ruta: r });
        const t = ahora();
        await Promise.all([
          archivos.put({ proyectoId: id, ruta: r, ...ajustarContenido(r, contenido), modificado: t }),
          tx.objectStore('proyectos').put({ ...p, modificado: t }),
        ]);
      });
      emisor.emitir({ tipo: 'cambio-archivo', proyectoId: id, ruta: r });
    },

    async renombrar(id, rutaVieja, rutaNueva) {
      const vieja = normalizarRuta(rutaVieja);
      const nueva = normalizarRuta(rutaNueva);
      const plan = await transaccion(['proyectos', 'archivos'], async (tx) => {
        const p = await proyectoActivo(tx.objectStore('proyectos'), id);
        const archivos = tx.objectStore('archivos');
        const claves = await archivos.getAllKeys(rangoProyecto(id));
        const plan = planearRenombrado(
          claves.map((c) => c[1]),
          vieja,
          nueva,
        );
        if (plan.size === 0) return plan;
        const t = ahora();
        const valores: ArchivoProyecto[] = [];
        for (const desde of plan.keys()) valores.push((await archivos.get([id, desde]))!);
        for (const desde of plan.keys()) await archivos.delete([id, desde]);
        let i = 0;
        for (const v of valores) {
          opciones.inyectarFallo?.('renombrar', i++);
          const hasta = plan.get(v.ruta)!;
          await archivos.put({ ...v, ...ajustarContenido(hasta, v.contenido), ruta: hasta, modificado: t });
        }
        await tx.objectStore('proyectos').put({
          ...p,
          modificado: t,
          principal: estaBajo(p.principal, vieja) ? nueva + p.principal.slice(vieja.length) : p.principal,
        });
        return plan;
      });
      for (const [desde, hasta] of plan) {
        emisor.emitir({ tipo: 'cambio-archivo', proyectoId: id, ruta: desde });
        emisor.emitir({ tipo: 'cambio-archivo', proyectoId: id, ruta: hasta });
      }
    },

    async moverArchivosAPapelera(id, ruta) {
      const r = normalizarRuta(ruta);
      const { quitados, elemento } = await transaccion(
        ['proyectos', 'archivos', 'papelera', 'papeleraArchivos'],
        async (tx) => {
          const p = await proyectoActivo(tx.objectStore('proyectos'), id);
          const archivos = tx.objectStore('archivos');
          const claves = (await archivos.getAllKeys(rangoProyecto(id))).filter((c) => estaBajo(c[1], r));
          if (claves.length === 0) throw new ErrorAlmacen('archivo_inexistente', { ruta: r });
          const registro: RegistroPapelera = {
            id: nuevoId(),
            proyectoId: id,
            clase: claves.some((c) => c[1] === r) ? 'archivo' : 'carpeta',
            ruta: r,
            ...sello(),
            tamano: 0,
            cuantos: claves.length,
          };
          let i = 0;
          for (const c of claves) {
            opciones.inyectarFallo?.('papelera', i++);
            const archivo = (await archivos.get(c))!;
            registro.tamano += archivo.tamano;
            await tx.objectStore('papeleraArchivos').put({ ...archivo, elementoId: registro.id });
            await archivos.delete(c);
          }
          await tx.objectStore('papelera').put(registro);
          await tx.objectStore('proyectos').put({ ...p, modificado: ahora() });
          return { quitados: claves.map((c) => c[1]), elemento: elementoDeRegistro(registro, p.nombre) };
        },
      );
      for (const k of quitados) emisor.emitir({ tipo: 'cambio-archivo', proyectoId: id, ruta: k });
      emisor.emitir({ tipo: 'cambio-papelera', accion: 'entra', elemento });
      return elemento;
    },

    async listarPapelera() {
      const tx = conexion().transaction([...ALMACENES_PAPELERA], 'readonly');
      const lista = await listarEn(tx);
      await tx.done;
      return lista;
    },

    async restaurarDePapelera(elementoId): Promise<ResultadoRestaurar> {
      const idProyecto = proyectoDeId(elementoId);
      if (idProyecto !== undefined) {
        const elemento = await transaccion([...ALMACENES_PAPELERA], async (tx) => {
          const p = await tx.objectStore('proyectos').get(idProyecto);
          if (!p || p.enPapelera === undefined) throw new ErrorAlmacen('elemento_inexistente');
          const elemento = await elementoDeProyecto(tx, p);
          const activo: Proyecto = { ...p };
          delete activo.enPapelera;
          delete activo.enPapeleraConfiable;
          await tx.objectStore('proyectos').put(activo);
          return elemento;
        });
        emisor.emitir({ tipo: 'cambio-proyecto', proyectoId: idProyecto });
        emisor.emitir({ tipo: 'cambio-papelera', accion: 'restaurado', elemento });
        return { proyectoId: idProyecto, rutas: [] };
      }
      const { proyectoId, mapa, elemento } = await transaccion(
        ['proyectos', 'archivos', 'papelera', 'papeleraArchivos'],
        async (tx) => {
          const registro = await tx.objectStore('papelera').get(elementoId);
          const p = registro && (await tx.objectStore('proyectos').get(registro.proyectoId));
          if (!registro || !p) throw new ErrorAlmacen('elemento_inexistente');
          if (p.enPapelera !== undefined) throw new ErrorAlmacen('proyecto_en_papelera');
          const guardados = await tx.objectStore('papeleraArchivos').getAll(rangoElemento(elementoId));
          const actuales = await tx.objectStore('archivos').getAllKeys(rangoProyecto(p.id));
          const { mapa } = planearRestauracion(
            actuales.map((c) => c[1]),
            registro.ruta,
            guardados.map((g) => g.ruta),
          );
          let i = 0;
          for (const g of guardados) {
            opciones.inyectarFallo?.('restaurar', i++);
            const { elementoId: _quitado, ...archivo } = g;
            void _quitado;
            // `add` y no `put`: si algo ocupara la ruta, la transacción falla en vez de pisarlo.
            await tx.objectStore('archivos').add({ ...archivo, ruta: mapa.get(g.ruta)! });
          }
          await tx.objectStore('papeleraArchivos').delete(rangoElemento(elementoId));
          await tx.objectStore('papelera').delete(elementoId);
          await tx.objectStore('proyectos').put({ ...p, modificado: ahora() });
          return { proyectoId: p.id, mapa, elemento: elementoDeRegistro(registro, p.nombre) };
        },
      );
      for (const hasta of mapa.values()) emisor.emitir({ tipo: 'cambio-archivo', proyectoId, ruta: hasta });
      emisor.emitir({ tipo: 'cambio-papelera', accion: 'restaurado', elemento });
      return { proyectoId, rutas: [...mapa].map(([original, final]) => ({ original, final })) };
    },

    async borrarDefinitivo(elementoId) {
      const elemento = await transaccion([...ALMACENES_PAPELERA], (tx) => quitarDefinitivo(tx, elementoId));
      if (!elemento) throw new ErrorAlmacen('elemento_inexistente');
      avisarBorrado([elemento]);
    },

    async vaciarPapelera() {
      const borrados = await transaccion([...ALMACENES_PAPELERA], async (tx) => {
        const quitados: ElementoPapelera[] = [];
        for (const e of await listarEn(tx)) {
          const quitado = await quitarDefinitivo(tx, e.id);
          if (quitado) quitados.push(quitado);
        }
        return quitados;
      });
      avisarBorrado(borrados);
      return borrados.length;
    },

    async purgarCaducados(dias) {
      const hora = opciones.horaConfiable?.();
      if (hora === undefined) return [];
      const borrados = await transaccion([...ALMACENES_PAPELERA], async (tx) => {
        // Se vuelven a sellar los elementos con fecha sin confirmar o en el futuro: su plazo cuenta desde ahora.
        for (const p of await tx.objectStore('proyectos').getAll()) {
          if (
            p.enPapelera !== undefined &&
            requiereResello(p.enPapelera, p.enPapeleraConfiable === true, hora)
          ) {
            await tx.objectStore('proyectos').put({ ...p, enPapelera: hora, enPapeleraConfiable: true });
          }
        }
        for (const r of await tx.objectStore('papelera').getAll()) {
          if (requiereResello(r.fecha, r.fechaConfiable, hora)) {
            await tx.objectStore('papelera').put({ ...r, fecha: hora, fechaConfiable: true });
          }
        }
        const quitados: ElementoPapelera[] = [];
        for (const e of await listarEn(tx)) {
          if (!e.fechaConfiable || !estaCaducado(e.fecha, dias, margenDias, hora)) continue;
          const quitado = await quitarDefinitivo(tx, e.id);
          if (quitado) quitados.push(quitado);
        }
        return quitados;
      });
      avisarBorrado(borrados);
      return borrados;
    },

    leerAjuste: <T>(clave: string) => conexion().get('ajustes', clave) as Promise<T | undefined>,
    async guardarAjuste(clave, valor) {
      await transaccion(['ajustes'], (tx) => tx.objectStore('ajustes').put(valor, clave));
    },
    leerDistribucion: <T>(clave: string) => conexion().get('distribuciones', clave) as Promise<T | undefined>,
    async guardarDistribucion(clave, json) {
      await transaccion(['distribuciones'], (tx) => tx.objectStore('distribuciones').put(json, clave));
    },
    leerHerramienta: <T>(id: string) => conexion().get('herramientas', id) as Promise<T | undefined>,
    async guardarHerramienta(id, estado) {
      await transaccion(['herramientas'], (tx) => tx.objectStore('herramientas').put(estado, id));
    },

    al: (evento, fn) => emisor.al(evento, fn),
    cerrar() {
      emisor.limpiar();
      soltarConexion();
    },
  };
  return api;
}
