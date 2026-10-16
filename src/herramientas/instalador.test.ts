// SPDX-License-Identifier: AGPL-3.0-or-later
// El instalador con falsos: fetch, Cache API, motor y almacén en memoria. Sin red ni navegador.
import { describe, expect, it, vi } from 'vitest';
import { crearAlmacenMemoria } from '../almacen';
import { cacheBusytex } from '../pwa/nombres';
import type { Herramienta } from './catalogo';
import { ErrorInstalacion, Instalador, type ProgresoInstalacion } from './instalador';

const BASE = 'http://localhost/busytex';
const VERSION = 'prueba';

const HERRAMIENTA: Herramienta = {
  id: 'latex',
  disponibilidad: 'instalable',
  archivos: [
    { nombre: 'uno.js', bytes: 100, destino: 'cache' },
    { nombre: 'dos.wasm', bytes: 300, destino: 'cache' },
    { nombre: 'tres.cnf', bytes: 50, destino: 'cache' },
    { nombre: 'datos.data', bytes: 1000, destino: 'indexeddb' },
  ],
  bytes: 1450,
};

/** Cache API mínima en memoria. */
class CacheFalsa {
  entradas = new Map<string, Response>();
  put = vi.fn(async (clave: RequestInfo | URL, respuesta: Response) => {
    this.entradas.set(
      String(clave),
      new Response(await respuesta.arrayBuffer(), { headers: respuesta.headers }),
    );
  });
  async match(clave: RequestInfo | URL) {
    return this.entradas.get(String(clave))?.clone();
  }
}

class AlmacenCachesFalso {
  caches = new Map<string, CacheFalsa>();
  async open(nombre: string) {
    let c = this.caches.get(nombre);
    if (!c) this.caches.set(nombre, (c = new CacheFalsa()));
    return c as unknown as Cache;
  }
  async delete(nombre: string) {
    return this.caches.delete(nombre);
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async match(clave: RequestInfo | URL, opciones?: MultiCacheQueryOptions) {
    const cache = opciones?.cacheName ? this.caches.get(opciones.cacheName) : undefined;
    return cache?.match(clave);
  }
}

/** fetch falso: devuelve `bytes` en trozos de 40; `bloquearEn` espera a que se aborte esa descarga. */
function fetchFalso(
  opciones: {
    bloquearEn?: string;
    fallarEn?: string;
    tamano?: (nombre: string) => number;
    alLeer?: (nombre: string, bytes: number) => void;
  } = {},
) {
  const pedidos: string[] = [];
  const falso = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const nombre = url.slice(url.lastIndexOf('/') + 1);
    pedidos.push(nombre);
    if (opciones.fallarEn === nombre) throw new TypeError('Failed to fetch');
    const total =
      opciones.tamano?.(nombre) ?? HERRAMIENTA.archivos.find((a) => a.nombre === nombre)?.bytes ?? 0;
    let enviados = 0;
    const senal = init?.signal;
    const cuerpo = new ReadableStream<Uint8Array>({
      async pull(control) {
        if (senal?.aborted) return control.error(senal.reason);
        if (opciones.bloquearEn === nombre && enviados >= 40) {
          await new Promise<void>((_, rechazar) =>
            senal?.addEventListener('abort', () => rechazar(senal.reason)),
          );
        }
        const n = Math.min(40, total - enviados);
        if (n <= 0) return control.close();
        enviados += n;
        opciones.alLeer?.(nombre, enviados);
        control.enqueue(new Uint8Array(n));
      },
    });
    return new Response(cuerpo, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
  }) as typeof fetch;
  return { fetch: falso, pedidos };
}

function armar(opciones: Parameters<typeof fetchFalso>[0] = {}, extra: { espacioLibre?: number } = {}) {
  const almacen = crearAlmacenMemoria();
  const caches = new AlmacenCachesFalso();
  const red = fetchFalso(opciones);
  const motor = {
    iniciar: vi.fn(async (alProgreso: (c: number, t: number) => void) => {
      alProgreso(100, 400);
      alProgreso(400, 400);
    }),
    cancelar: vi.fn(),
    borrarPaquetes: vi.fn(async () => undefined),
    persistir: vi.fn(async () => true),
  };
  const instalador = new Instalador({
    almacen,
    base: BASE,
    version: VERSION,
    fetch: red.fetch,
    caches: caches as unknown as CacheStorage,
    iniciarMotor: motor.iniciar,
    cancelarMotor: motor.cancelar,
    borrarPaquetes: motor.borrarPaquetes,
    persistir: motor.persistir,
    espacioLibre: extra.espacioLibre === undefined ? undefined : async () => extra.espacioLibre,
    herramienta: () => HERRAMIENTA,
  });
  return { almacen, caches, red, motor, instalador };
}

describe('Instalador', () => {
  it('3: una instalación anterior con el cargador genérico necesita renovar el cargador', async () => {
    const { almacen, caches, motor } = armar();
    const herramienta = {
      ...HERRAMIENTA,
      archivos: [{ nombre: 'texlive-basic.js', bytes: 100, destino: 'cache' as const }],
      bytes: 100,
    };
    const cache = await caches.open(cacheBusytex(VERSION));
    await cache.put(`${BASE}/texlive-basic.js`, new Response('var DB_NAME = "EM_PRELOAD_CACHE";'));
    await almacen.guardarHerramienta('latex', { estado: 'instalada', bytes: 100, version: VERSION });
    const fetch = vi.fn(async () => new Response('folio-EM_PRELOAD_CACHE folio-version:'.padEnd(100)));
    const instalador = new Instalador({
      almacen,
      caches,
      base: BASE,
      version: VERSION,
      herramienta: () => herramienta,
      fetch,
      iniciarMotor: motor.iniciar,
      cancelarMotor: motor.cancelar,
      borrarPaquetes: motor.borrarPaquetes,
    });
    expect((await instalador.estado('latex')).estado).toBe('no-instalada');
    await instalador.instalar('latex');
    expect(fetch).toHaveBeenCalledOnce();
    expect((await instalador.estado('latex')).estado).toBe('instalada');
  });
  it('8: pausar durante el guardado anterior al motor impide arrancarlo', async () => {
    const { instalador, almacen, motor } = armar();
    const guardar = almacen.guardarHerramienta.bind(almacen);
    vi.spyOn(almacen, 'guardarHerramienta').mockImplementation(async (id, estado) => {
      await guardar(id, estado);
      if ((estado as { bytes: number }).bytes === 450) instalador.pausar();
    });
    await expect(instalador.instalar('latex')).rejects.toMatchObject({ codigo: 'pausado' });
    expect(motor.iniciar).not.toHaveBeenCalled();
  });

  it('9: entrega un flujo al caché antes de terminar de leer la respuesta', async () => {
    const leidos = new Map<string, number>();
    const { instalador, caches } = armar({
      alLeer: (nombre, bytes) => {
        leidos.set(nombre, bytes);
      },
    });
    const cache = (await caches.open(cacheBusytex(VERSION))) as unknown as CacheFalsa;
    cache.put.mockImplementation(async (clave, respuesta) => {
      const nombre = String(clave).split('/').at(-1)!;
      const esperados = HERRAMIENTA.archivos.find((a) => a.nombre === nombre)!.bytes;
      expect(leidos.get(nombre) ?? 0).toBeLessThan(esperados);
      const bytes = await respuesta.arrayBuffer();
      cache.entradas.set(String(clave), new Response(bytes));
    });
    await instalador.instalar('latex');
    expect(cache.entradas.size).toBe(3);
  });
  it('descarga los archivos a folio-busytex-<versión>, arranca el motor, avanza sin retroceder y termina en 100 %', async () => {
    const { instalador, caches, motor, red } = armar();
    const avances: ProgresoInstalacion[] = [];
    await instalador.instalar('latex', (p) => avances.push(p));

    const cache = caches.caches.get(cacheBusytex(VERSION));
    expect([...(cache?.entradas.keys() ?? [])].sort()).toEqual(
      ['uno.js', 'dos.wasm', 'tres.cnf'].map((n) => `${BASE}/${n}`).sort(),
    );
    // El paquete de datos NO va a la caché del service worker: lo baja el motor (Emscripten lo guarda en IndexedDB).
    expect(red.pedidos).not.toContain('datos.data');
    expect(motor.iniciar).toHaveBeenCalledOnce();
    expect(motor.persistir).toHaveBeenCalledOnce();

    expect(avances.length).toBeGreaterThan(5);
    for (let i = 1; i < avances.length; i++) {
      expect(avances[i]?.cargados, `avance ${i}`).toBeGreaterThanOrEqual(avances[i - 1]?.cargados ?? 0);
    }
    expect(avances[0]?.total).toBe(1450);
    expect(avances.at(-1)).toMatchObject({ cargados: 1450, total: 1450 });
    expect(avances.some((a) => a.fase === 'paquetes' && a.cargados > 450 && a.cargados < 1450)).toBe(true);
    expect(await instalador.estado('latex')).toEqual({ estado: 'instalada', bytes: 1450, version: VERSION });
  });

  it('pausa por archivo: lo descargado se conserva y al reanudar solo se piden los archivos que faltan', async () => {
    const { instalador, caches, almacen } = armar({ bloquearEn: 'dos.wasm' });
    const primera = instalador.instalar('latex');
    // Espera a que el segundo archivo esté en curso y pausa.
    await vi.waitFor(() => expect(caches.caches.get(cacheBusytex(VERSION))?.entradas.size).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
    instalador.pausar();
    await expect(primera).rejects.toMatchObject({ codigo: 'pausado' });
    expect(caches.caches.get(cacheBusytex(VERSION))?.entradas.size).toBe(1);
    expect(await almacen.leerHerramienta('latex')).toMatchObject({ estado: 'descargando', bytes: 100 });
    expect(instalador.ocupado).toBe(false);

    // Reanudar con una red que ya no bloquea.
    const nueva = armar();
    const reanudado = new Instalador({
      almacen,
      base: BASE,
      version: VERSION,
      fetch: nueva.red.fetch,
      caches: caches as unknown as CacheStorage,
      iniciarMotor: nueva.motor.iniciar,
      cancelarMotor: nueva.motor.cancelar,
      borrarPaquetes: nueva.motor.borrarPaquetes,
      herramienta: () => HERRAMIENTA,
    });
    await reanudado.instalar('latex');
    expect(nueva.red.pedidos).toEqual(['dos.wasm', 'tres.cnf']);
    expect((await reanudado.estado('latex')).estado).toBe('instalada');
  });

  it('pausar mientras el motor descarga el paquete detiene el motor', async () => {
    const { instalador, motor } = armar();
    motor.iniciar.mockImplementation(async () => new Promise<void>(() => undefined));
    const p = instalador.instalar('latex');
    await vi.waitFor(() => expect(motor.iniciar).toHaveBeenCalled());
    instalador.pausar();
    await expect(p).rejects.toMatchObject({ codigo: 'pausado' });
    expect(motor.cancelar).toHaveBeenCalled();
  });

  it('cancelar borra lo guardado y deja la herramienta como no instalada', async () => {
    const { instalador, caches, motor } = armar({ bloquearEn: 'dos.wasm' });
    const p = instalador.instalar('latex');
    await vi.waitFor(() => expect(caches.caches.get(cacheBusytex(VERSION))?.entradas.size).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
    instalador.cancelar();
    await expect(p).rejects.toMatchObject({ codigo: 'cancelado' });
    expect(caches.caches.size).toBe(0);
    expect(motor.borrarPaquetes).toHaveBeenCalled();
    expect(await instalador.estado('latex')).toEqual({ estado: 'no-instalada', bytes: 0, version: '' });
  });

  it('un fallo de red deja el estado «error» con el código «red», conserva lo ya descargado y se puede reintentar', async () => {
    const { instalador, caches, almacen } = armar({ fallarEn: 'dos.wasm' });
    await expect(instalador.instalar('latex')).rejects.toMatchObject({ codigo: 'red' });
    expect(await almacen.leerHerramienta('latex')).toMatchObject({
      estado: 'error',
      error: 'red',
      bytes: 100,
    });
    expect(caches.caches.get(cacheBusytex(VERSION))?.entradas.size).toBe(1);
    expect(instalador.ocupado).toBe(false);
  });

  it('2: un archivo que llega con otro tamaño se rechaza como error de versión y no se guarda', async () => {
    const { instalador, caches } = armar({ tamano: (n) => (n === 'uno.js' ? 99 : 0) });
    await expect(instalador.instalar('latex')).rejects.toMatchObject({ codigo: 'version' });
    expect(caches.caches.get(cacheBusytex(VERSION))?.entradas.size ?? 0).toBe(0);
  });

  it('sin espacio suficiente (cuota) no empieza a descargar', async () => {
    const { instalador, red } = armar({}, { espacioLibre: 500 });
    await expect(instalador.instalar('latex')).rejects.toMatchObject({ codigo: 'espacio' });
    expect(red.pedidos).toEqual([]);
  });

  it('QuotaExceededError al guardar se traduce a «espacio»', async () => {
    const { instalador, caches } = armar();
    const cache = (await caches.open(cacheBusytex(VERSION))) as unknown as CacheFalsa;
    cache.put.mockRejectedValueOnce(new DOMException('lleno', 'QuotaExceededError'));
    await expect(instalador.instalar('latex')).rejects.toMatchObject({ codigo: 'espacio' });
  });

  it('un error del motor es un fallo «otro» y no queda como instalada', async () => {
    const { instalador, motor, almacen } = armar();
    motor.iniciar.mockRejectedValueOnce(new Error('boom'));
    await expect(instalador.instalar('latex')).rejects.toBeInstanceOf(ErrorInstalacion);
    expect(await almacen.leerHerramienta('latex')).toMatchObject({ estado: 'error', error: 'otro' });
  });

  it('no deja instalar dos veces a la vez ni herramientas que no son instalables', async () => {
    const { instalador, motor } = armar({ bloquearEn: 'dos.wasm' });
    void motor;
    const p = instalador.instalar('latex');
    await expect(instalador.instalar('latex')).rejects.toMatchObject({ codigo: 'otro' });
    instalador.cancelar();
    await p.catch(() => undefined);
    const otra = new Instalador({
      almacen: crearAlmacenMemoria(),
      base: BASE,
      version: VERSION,
      iniciarMotor: async () => undefined,
      cancelarMotor: () => undefined,
      borrarPaquetes: async () => undefined,
      herramienta: (id) => ({ id, disponibilidad: 'proximamente', archivos: [], bytes: 0 }),
    });
    await expect(otra.instalar('python')).rejects.toMatchObject({ codigo: 'otro' });
  });

  it('quitar borra las cachés de BusyTeX y del espejo y el paquete de IndexedDB, sin tocar otras cachés', async () => {
    const { instalador, caches, motor } = armar();
    await instalador.instalar('latex');
    await caches.open('folio-espejo-v1');
    await caches.open('workbox-precache-v2');
    await instalador.quitar('latex');
    expect([...caches.caches.keys()]).toEqual(['workbox-precache-v2']);
    expect(motor.borrarPaquetes).toHaveBeenCalled();
    expect(await instalador.estado('latex')).toEqual({ estado: 'no-instalada', bytes: 0, version: '' });
  });

  it('si el navegador borró la caché, «instalada» se corrige a «no instalada»', async () => {
    const { instalador, caches } = armar();
    await instalador.instalar('latex');
    expect((await instalador.estado('latex')).estado).toBe('instalada');
    await caches.delete(cacheBusytex(VERSION));
    expect((await instalador.estado('latex')).estado).toBe('no-instalada');
  });
});
