// SPDX-License-Identifier: AGPL-3.0-or-later
// Implementación sobre IndexedDB (biblioteca `idb`): proyectos, archivos, ajustes, distribuciones y herramientas.
// Cada operación que toca varios registros (crear proyecto, renombrar carpeta, escribir) es UNA transacción.
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import { ErrorAlmacen, traducirErrorNativo } from './errores';
import {
  ajustarContenido,
  ancestros,
  Emisor,
  estaBajo,
  normalizarRuta,
  nuevoId,
  planearRenombrado,
  sinContenido,
  validarArbol,
} from './rutas';
import type {
  Almacen,
  ArchivoInicial,
  ArchivoProyecto,
  DatosProyecto,
  EventoAlmacen,
  FiltroProyectos,
  InfoArchivo,
  OpcionesAlmacen,
  Proyecto,
} from './tipos';

export const NOMBRE_BD = 'ipn-folio';
export const VERSION_BD = 1;

interface EsquemaFolio extends DBSchema {
  proyectos: { key: string; value: Proyecto };
  archivos: {
    key: [string, string];
    value: ArchivoProyecto;
    indexes: { porProyecto: string };
  };
  ajustes: { key: string; value: unknown };
  distribuciones: { key: string; value: unknown };
  herramientas: { key: string; value: unknown };
}

type Almacenes = StoreNames<EsquemaFolio>;
type Tx<A extends Almacenes[]> = IDBPTransaction<EsquemaFolio, A, 'readwrite'>;

/** Rango de claves de todos los archivos de un proyecto (las rutas nunca llevan U+FFFF). */
const rangoProyecto = (id: string) => IDBKeyRange.bound([id, ''], [id, '￿']);
const rangoCarpeta = (id: string, ruta: string) => IDBKeyRange.bound([id, ruta + '/'], [id, ruta + '/￿']);

export async function crearAlmacenIdb(opciones: OpcionesAlmacen = {}): Promise<Almacen> {
  if (typeof indexedDB === 'undefined') throw new ErrorAlmacen('almacen_no_disponible');
  const ahora = opciones.ahora ?? Date.now;
  const emisor = new Emisor<EventoAlmacen>();

  let db: IDBPDatabase<EsquemaFolio>;
  try {
    db = await openDB<EsquemaFolio>(opciones.nombreBD ?? NOMBRE_BD, VERSION_BD, {
      upgrade(base) {
        base.createObjectStore('proyectos', { keyPath: 'id' });
        const archivos = base.createObjectStore('archivos', { keyPath: ['proyectoId', 'ruta'] });
        archivos.createIndex('porProyecto', 'proyectoId');
        base.createObjectStore('ajustes');
        base.createObjectStore('distribuciones');
        base.createObjectStore('herramientas');
      },
      // Otra pestaña con una versión más nueva quiere actualizar la base: soltarla para no bloquearla.
      blocking() {
        db.close();
      },
    });
  } catch (e) {
    throw e instanceof ErrorAlmacen ? e : new ErrorAlmacen('almacen_no_disponible');
  }

  /** Ejecuta `fn` en una transacción de escritura; ante cualquier error la deshace por completo. */
  async function transaccion<A extends Almacenes[], R>(
    almacenes: [...A],
    fn: (tx: Tx<A>) => Promise<R>,
  ): Promise<R> {
    const tx = db.transaction(almacenes, 'readwrite');
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

  return {
    async listarProyectos(filtro: FiltroProyectos = 'activos') {
      const todos = await db.getAll('proyectos');
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

    obtenerProyecto: (id) => db.get('proyectos', id),

    async renombrarProyecto(id, nombre) {
      const limpio = nombreValido(nombre);
      await transaccion(['proyectos'], async (tx) => {
        const p = await proyectoActivo(tx.objectStore('proyectos'), id);
        await tx.objectStore('proyectos').put({ ...p, nombre: limpio, modificado: ahora() });
      });
      emisor.emitir({ tipo: 'cambio-proyecto', proyectoId: id });
    },

    async moverAPapelera(id) {
      await transaccion(['proyectos'], async (tx) => {
        const p = await tx.objectStore('proyectos').get(id);
        if (!p) throw new ErrorAlmacen('proyecto_inexistente');
        await tx.objectStore('proyectos').put({ ...p, enPapelera: ahora() });
      });
      emisor.emitir({ tipo: 'cambio-proyecto', proyectoId: id });
    },

    async restaurar(id) {
      await transaccion(['proyectos'], async (tx) => {
        const p = await tx.objectStore('proyectos').get(id);
        if (!p) throw new ErrorAlmacen('proyecto_inexistente');
        const activo: Proyecto = { ...p };
        delete activo.enPapelera;
        await tx.objectStore('proyectos').put(activo);
      });
      emisor.emitir({ tipo: 'cambio-proyecto', proyectoId: id });
    },

    async listarArchivos(id) {
      if (!(await db.get('proyectos', id))) throw new ErrorAlmacen('proyecto_inexistente');
      const info: InfoArchivo[] = [];
      // Cursor: se descarta el contenido de cada archivo en cuanto se lee, para no acumular imágenes en memoria.
      let cursor = await db.transaction('archivos').store.index('porProyecto').openCursor(id);
      while (cursor) {
        info.push(sinContenido(cursor.value));
        cursor = await cursor.continue();
      }
      return info.sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : 0));
    },

    async leer(id, ruta) {
      const r = normalizarRuta(ruta);
      if (!(await db.get('proyectos', id))) throw new ErrorAlmacen('proyecto_inexistente');
      return db.get('archivos', [id, r]);
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

    async borrar(id, ruta) {
      const r = normalizarRuta(ruta);
      const quitados = await transaccion(['proyectos', 'archivos'], async (tx) => {
        const p = await proyectoActivo(tx.objectStore('proyectos'), id);
        const archivos = tx.objectStore('archivos');
        const claves = (await archivos.getAllKeys(rangoProyecto(id))).filter((c) => estaBajo(c[1], r));
        if (claves.length === 0) throw new ErrorAlmacen('archivo_inexistente', { ruta: r });
        for (const c of claves) await archivos.delete(c);
        await tx.objectStore('proyectos').put({ ...p, modificado: ahora() });
        return claves.map((c) => c[1]);
      });
      for (const k of quitados) emisor.emitir({ tipo: 'cambio-archivo', proyectoId: id, ruta: k });
    },

    leerAjuste: <T>(clave: string) => db.get('ajustes', clave) as Promise<T | undefined>,
    async guardarAjuste(clave, valor) {
      await transaccion(['ajustes'], (tx) => tx.objectStore('ajustes').put(valor, clave));
    },
    leerDistribucion: <T>(clave: string) => db.get('distribuciones', clave) as Promise<T | undefined>,
    async guardarDistribucion(clave, json) {
      await transaccion(['distribuciones'], (tx) => tx.objectStore('distribuciones').put(json, clave));
    },
    leerHerramienta: <T>(id: string) => db.get('herramientas', id) as Promise<T | undefined>,
    async guardarHerramienta(id, estado) {
      await transaccion(['herramientas'], (tx) => tx.objectStore('herramientas').put(estado, id));
    },

    al: (evento, fn) => emisor.al(evento, fn),
    cerrar() {
      emisor.limpiar();
      db.close();
    },
  };
}
