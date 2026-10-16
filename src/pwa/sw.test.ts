// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, it, vi } from 'vitest';

const wb = vi.hoisted(() => ({
  nombres: vi.fn(),
  rutas: [] as Array<{ opciones?: { allowlist?: RegExp[] } }>,
  registrar: vi.fn(),
}));
vi.mock('workbox-core', () => ({ clientsClaim: vi.fn(), setCacheNameDetails: wb.nombres }));
vi.mock('workbox-precaching', () => ({
  cleanupOutdatedCaches: vi.fn(),
  createHandlerBoundToURL: vi.fn(),
  getCacheKeyForURL: () => 'index.html',
  precacheAndRoute: vi.fn(),
}));
vi.mock('workbox-routing', () => ({
  registerRoute: wb.registrar,
  NavigationRoute: class {
    constructor(_handler: unknown, opciones: object) {
      wb.rutas.push({ opciones });
    }
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  wb.rutas.length = 0;
  wb.nombres.mockClear();
  wb.registrar.mockClear();
});

async function cargar() {
  const sw = Object.assign(new EventTarget(), {
    location: new URL('http://localhost/folio/sw.js'),
    __WB_MANIFEST: [],
  });
  const borrar = vi.fn();
  vi.stubGlobal('self', sw);
  vi.stubGlobal('caches', { keys: async () => ['folio-busytex-anterior'], delete: borrar });
  const ruta = './sw';
  await import(ruta);
  return { sw, borrar };
}

it('2: activar el SW conserva BusyTeX anterior para uso sin conexión', async () => {
  const { sw, borrar } = await cargar();
  const pendientes: Promise<unknown>[] = [];
  sw.dispatchEvent(
    Object.assign(new Event('activate'), { waitUntil: (p: Promise<unknown>) => pendientes.push(p) }),
  );
  await Promise.all(pendientes);
  expect(borrar).not.toHaveBeenCalled();
});

it('4: el precaché usa el prefijo de Folio', async () => {
  await cargar();
  expect(wb.nombres).toHaveBeenCalledWith({ prefix: 'folio' });
});

it('5: la navegación solo respalda la raíz y su index, nunca licencias', async () => {
  await cargar();
  const admite = (ruta: string) => wb.rutas[0]?.opciones?.allowlist?.some((r) => r.test(ruta)) ?? false;
  expect(admite('/folio/')).toBe(true);
  expect(admite('/folio/index.html')).toBe(true);
  expect(admite('/folio/licencias/OFL.txt')).toBe(false);
  expect(admite('/folio/archivo.pdf')).toBe(false);
});

it('15: sin variable de entorno, registra el espejo local al despliegue', async () => {
  await cargar();
  const ultima = wb.registrar.mock.calls.at(-1)!;
  expect(typeof ultima[0]).toBe('function');
  expect(
    ultima[0]({ url: new URL('http://localhost/folio/espejo/0/archivo.sty'), request: { method: 'GET' } }),
  ).toBe(true);
});
