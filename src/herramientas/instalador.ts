// SPDX-License-Identifier: AGPL-3.0-or-later
// Instalador de herramientas (D11): descarga los archivos de la herramienta con progreso real, los guarda en la caché
// `folio-busytex-<versión>` (el service worker los lee de ahí) y arranca el motor una vez para que Emscripten guarde
// `texlive-basic.data` en IndexedDB. Pausar y reanudar trabajan por archivo (lo ya guardado se conserva); cancelar
// y quitar borran lo guardado. Todo lo que toca el navegador entra por `DependenciasInstalador`, para probarlo con falsos.
import type { Almacen } from '../almacen';
import { BD_PAQUETES_EMSCRIPTEN, CACHE_ESPEJO, PREFIJO_BUSYTEX, cacheBusytex } from '../pwa/nombres';
import { herramienta as buscar, type Herramienta, type IdHerramienta } from './catalogo';
import {
  ESTADO_INICIAL,
  guardarEstado,
  leerEstado,
  type CodigoErrorInstalacion,
  type EstadoHerramienta,
} from './estado';

export type FaseInstalacion = 'archivos' | 'paquetes';

export interface ProgresoInstalacion {
  /** Bytes descargados de la herramienta completa (archivos de la caché más el paquete de datos). */
  cargados: number;
  total: number;
  fase: FaseInstalacion;
  /** Archivo que se descarga ahora (solo en la fase `archivos`). */
  archivo?: string;
}

export type CodigoErrorInstalador = CodigoErrorInstalacion | 'pausado' | 'cancelado';

/** `pausado` y `cancelado` no son fallos: son la forma de salir de `instalar` cuando el usuario lo pide. */
export class ErrorInstalacion extends Error {
  constructor(
    public readonly codigo: CodigoErrorInstalador,
    public readonly detalle = '',
  ) {
    super(`instalación: ${codigo}${detalle ? ` (${detalle})` : ''}`);
    this.name = 'ErrorInstalacion';
  }
}

type AlmacenCaches = Pick<CacheStorage, 'open' | 'delete' | 'keys' | 'match'>;

export interface DependenciasInstalador {
  almacen: Pick<Almacen, 'leerHerramienta' | 'guardarHerramienta'>;
  /** URL absoluta de la carpeta de los activos (la misma que usa el Motor), sin «/» final. */
  base: string;
  /** Versión de los activos: nombra la caché y queda en el estado. */
  version: string;
  fetch?: typeof fetch;
  caches?: AlmacenCaches;
  /** Arranca el motor una vez (descarga el paquete de datos a IndexedDB) y lo libera. Informa bytes cargados / total. */
  iniciarMotor(alProgreso: (cargados: number, total: number) => void): Promise<void>;
  /** Detiene el motor en curso (pausa o cancelación). */
  cancelarMotor(): void;
  /** Borra el paquete de datos que Emscripten guardó en IndexedDB. */
  borrarPaquetes(): Promise<void>;
  /** Pide almacenamiento persistente al terminar (D15/02); no se pide al cargar la página. */
  persistir?(): Promise<boolean | undefined>;
  /** Bytes libres aproximados (cuota menos uso); `undefined` si el navegador no lo informa. */
  espacioLibre?(): Promise<number | undefined>;
  /** Catálogo; por omisión, el real. */
  herramienta?: (id: IdHerramienta) => Herramienta;
}

const esAborto = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';
const esCuota = (e: unknown): boolean =>
  e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);

function razon(senal: AbortSignal): ErrorInstalacion {
  return senal.reason instanceof ErrorInstalacion ? senal.reason : new ErrorInstalacion('cancelado');
}

export class Instalador {
  private control: AbortController | null = null;

  constructor(private readonly d: DependenciasInstalador) {}

  private descriptor(id: IdHerramienta): Herramienta {
    return (this.d.herramienta ?? buscar)(id);
  }

  private get almacenCaches(): AlmacenCaches {
    return this.d.caches ?? globalThis.caches;
  }

  private url(nombre: string): string {
    return `${this.d.base}/${nombre}`;
  }

  private async cargadorVigente(nombre: string, respuesta: Response): Promise<boolean> {
    if (nombre !== 'texlive-basic.js') return true;
    const texto = await respuesta.text();
    // La versión de BusyTeX no cambia al adaptar el cargador: renovar también las instalaciones anteriores.
    return texto.includes(BD_PAQUETES_EMSCRIPTEN) && texto.includes('folio-version:');
  }

  /** ¿Hay una instalación en curso en esta instancia? */
  get ocupado(): boolean {
    return this.control !== null;
  }

  /** Estado guardado; si dice «instalada» pero la caché ya no tiene los archivos (el navegador la borró), lo corrige. */
  async estado(id: IdHerramienta): Promise<EstadoHerramienta> {
    const guardado = await leerEstado(this.d.almacen, id);
    if (guardado.estado !== 'instalada') return guardado;
    const h = this.descriptor(id);
    for (const a of h.archivos.filter((x) => x.destino === 'cache')) {
      const hay = await this.almacenCaches.match(this.url(a.nombre), {
        cacheName: cacheBusytex(this.d.version),
      });
      if (!hay || !(await this.cargadorVigente(a.nombre, hay))) {
        const perdido = { ...ESTADO_INICIAL };
        await guardarEstado(this.d.almacen, id, perdido);
        return perdido;
      }
    }
    return guardado;
  }

  /** Instala la herramienta. Resuelve al terminar; rechaza con `ErrorInstalacion` (también al pausar o cancelar). */
  async instalar(
    id: IdHerramienta,
    alProgreso: (p: ProgresoInstalacion) => void = () => undefined,
  ): Promise<void> {
    if (this.control) throw new ErrorInstalacion('otro', 'ya hay una instalación en curso');
    const h = this.descriptor(id);
    if (h.disponibilidad !== 'instalable') throw new ErrorInstalacion('otro', `${id} no es instalable`);
    const control = new AbortController();
    this.control = control;
    const senal = control.signal;
    const total = h.bytes;
    const enCache = h.archivos.filter((a) => a.destino === 'cache');
    const bytesCache = enCache.reduce((s, a) => s + a.bytes, 0);
    const bytesDatos = total - bytesCache;
    let guardados = 0;
    try {
      const libre = await this.d.espacioLibre?.();
      senal.throwIfAborted();
      if (libre !== undefined && libre < total * 1.05)
        throw new ErrorInstalacion('espacio', 'cuota insuficiente');
      await guardarEstado(this.d.almacen, id, { estado: 'descargando', bytes: 0, version: this.d.version });
      senal.throwIfAborted();

      const cache = await this.almacenCaches.open(cacheBusytex(this.d.version));
      senal.throwIfAborted();
      for (const a of enCache) {
        if (senal.aborted) throw razon(senal);
        const direccion = this.url(a.nombre);
        const guardada = await cache.match(direccion);
        senal.throwIfAborted();
        const vigente = guardada && (await this.cargadorVigente(a.nombre, guardada));
        senal.throwIfAborted();
        if (vigente) {
          guardados += a.bytes;
          alProgreso({ cargados: guardados, total, fase: 'archivos', archivo: a.nombre });
          continue;
        }
        await this.descargarAlCache(cache, direccion, a.bytes, senal, (bytes) =>
          alProgreso({ cargados: guardados + bytes, total, fase: 'archivos', archivo: a.nombre }),
        );
        senal.throwIfAborted();
        guardados += a.bytes;
        alProgreso({ cargados: guardados, total, fase: 'archivos', archivo: a.nombre });
      }
      await guardarEstado(this.d.almacen, id, {
        estado: 'descargando',
        bytes: guardados,
        version: this.d.version,
      });
      senal.throwIfAborted();

      if (bytesDatos > 0) {
        const alAbortar = () => this.d.cancelarMotor();
        senal.addEventListener('abort', alAbortar, { once: true });
        try {
          const salida = new Promise<never>((_, rechazar) =>
            senal.addEventListener('abort', () => rechazar(razon(senal)), { once: true }),
          );
          const arranque = this.d.iniciarMotor((cargados, totalMotor) => {
            const fraccion = totalMotor > 0 ? Math.min(1, cargados / totalMotor) : 0;
            alProgreso({ cargados: guardados + Math.round(fraccion * bytesDatos), total, fase: 'paquetes' });
          });
          salida.catch(() => undefined);
          arranque.catch(() => undefined);
          await Promise.race([arranque, salida]);
        } finally {
          senal.removeEventListener('abort', alAbortar);
        }
      }
      if (senal.aborted) throw razon(senal);
      await guardarEstado(this.d.almacen, id, { estado: 'instalada', bytes: total, version: this.d.version });
      senal.throwIfAborted();
      alProgreso({ cargados: total, total, fase: 'paquetes' });
      await this.d.persistir?.();
      senal.throwIfAborted();
    } catch (e) {
      const error = this.traducir(e, senal);
      if (error.codigo === 'cancelado') {
        await this.borrar(id);
      } else if (error.codigo === 'pausado') {
        await guardarEstado(this.d.almacen, id, {
          estado: 'descargando',
          bytes: guardados,
          version: this.d.version,
        });
      } else {
        await guardarEstado(this.d.almacen, id, {
          estado: 'error',
          bytes: guardados,
          version: this.d.version,
          error: error.codigo,
        });
      }
      throw error;
    } finally {
      this.control = null;
    }
  }

  /** Detiene la descarga; lo ya guardado se conserva y `instalar` continúa con el siguiente archivo. */
  pausar(): void {
    this.control?.abort(new ErrorInstalacion('pausado'));
  }

  /** Detiene la descarga y borra lo guardado. */
  cancelar(): void {
    this.control?.abort(new ErrorInstalacion('cancelado'));
  }

  /** Quita la herramienta: borra sus cachés y el paquete de IndexedDB. Los proyectos no se tocan. */
  async quitar(id: IdHerramienta): Promise<void> {
    this.control?.abort(new ErrorInstalacion('cancelado'));
    await this.borrar(id);
  }

  private async borrar(id: IdHerramienta): Promise<void> {
    this.d.cancelarMotor();
    // Si otra pestaña bloquea IndexedDB, conservar cachés y estado permite reintentar.
    await this.d.borrarPaquetes();
    const caches = this.almacenCaches;
    for (const nombre of await caches.keys()) {
      if (nombre.startsWith(PREFIJO_BUSYTEX) || nombre === CACHE_ESPEJO) await caches.delete(nombre);
    }
    await guardarEstado(this.d.almacen, id, { ...ESTADO_INICIAL });
  }

  private traducir(e: unknown, senal: AbortSignal): ErrorInstalacion {
    if (e instanceof ErrorInstalacion) return e;
    if (senal.aborted && (esAborto(e) || senal.reason instanceof ErrorInstalacion)) return razon(senal);
    if (esCuota(e)) return new ErrorInstalacion('espacio', String(e));
    if (e instanceof TypeError) return new ErrorInstalacion('red', e.message);
    return new ErrorInstalacion('otro', e instanceof Error ? e.message : String(e));
  }

  private async descargarAlCache(
    cache: Cache,
    direccion: string,
    esperados: number,
    senal: AbortSignal,
    alAvanzar: (bytes: number) => void,
  ): Promise<void> {
    const hacer = this.d.fetch ?? globalThis.fetch.bind(globalThis);
    const respuesta = await hacer(direccion, { signal: senal, cache: 'no-store' });
    senal.throwIfAborted();
    if (!respuesta.ok) throw new ErrorInstalacion('red', `${respuesta.status} ${direccion}`);
    let bytes = 0;
    let ultimo = 0;
    const comprobar = () => {
      senal.throwIfAborted();
      if (bytes !== esperados)
        throw new ErrorInstalacion(
          'version',
          `${direccion}: llegaron ${bytes} bytes y se esperaban ${esperados}`,
        );
    };
    const contador = new TransformStream<Uint8Array, Uint8Array>({
      transform(trozo, control) {
        senal.throwIfAborted();
        bytes += trozo.byteLength;
        if (bytes > esperados) comprobar();
        const ahora = performance.now();
        if (ahora - ultimo >= 250) {
          alAvanzar(bytes);
          ultimo = ahora;
        }
        control.enqueue(trozo);
      },
      flush() {
        comprobar();
        alAvanzar(bytes);
      },
    });
    if (!respuesta.body) throw new ErrorInstalacion('version', `${direccion}: respuesta sin cuerpo`);
    const tipo = respuesta.headers.get('Content-Type') ?? 'application/octet-stream';
    await cache.put(
      direccion,
      new Response(respuesta.body.pipeThrough(contador, { signal: senal }), {
        status: 200,
        headers: { 'Content-Type': tipo },
      }),
    );
    senal.throwIfAborted();
  }
}
