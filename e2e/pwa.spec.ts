// SPDX-License-Identifier: AGPL-3.0-or-later
// PWA de la aplicación (sesión 07): manifiesto, service worker, petición de hora de la papelera y apertura sin conexión.
// Se prueba contra el build de producción (`vite preview`), que es el único donde se registra el service worker.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { omitirBienvenida } from './ayudas';

/** Espera a que el service worker esté activo y controle la página. */
async function esperarControl(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolver) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolver(), { once: true }),
      );
    }
  });
}

const nombresDeCaches = (page: Page) => page.evaluate(() => caches.keys());

test.describe('PWA', () => {
  test('el manifiesto es instalable: nombre, es-MX, standalone e íconos (con maskable)', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const respuesta = await request.get(new URL(href ?? '', page.url()).href);
    expect(respuesta.ok()).toBe(true);
    const manifiesto = (await respuesta.json()) as {
      name: string;
      lang: string;
      display: string;
      start_url: string;
      icons: Array<{ src: string; sizes: string; purpose?: string }>;
    };
    expect(manifiesto.name).toBe('IPN Folio');
    expect(manifiesto.lang).toBe('es-MX');
    expect(manifiesto.display).toBe('standalone');
    expect(manifiesto.icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(manifiesto.icons.some((i) => i.sizes === '512x512' && !i.purpose)).toBe(true);
    expect(manifiesto.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icono of manifiesto.icons) {
      const r = await request.get(new URL(icono.src, respuesta.url()).href);
      expect(r.ok(), icono.src).toBe(true);
    }
  });

  test('el service worker se activa y la primera visita no descarga nada de BusyTeX', async ({ page }) => {
    const peticiones: string[] = [];
    page.on('request', (p) => peticiones.push(p.url()));
    await page.goto('/');
    await esperarControl(page);
    await omitirBienvenida(page);
    const nombres = await nombresDeCaches(page);
    expect(nombres.some((n) => n.startsWith('workbox-precache'))).toBe(true);
    // Criterio 3: hasta que se elige «Documentos LaTeX» no se pide ni se guarda ningún archivo de BusyTeX.
    expect(nombres.filter((n) => n.startsWith('folio-busytex-'))).toEqual([]);
    expect(peticiones.filter((u) => u.includes('/busytex/'))).toEqual([]);
    // Todas las cachés de Folio usan el prefijo registrado (criterio 4b); las de Workbox son del precaché.
    for (const n of nombres) expect(/^(folio-|workbox-)/.test(n), n).toBe(true);
  });

  test('con el service worker activo, la hora de la papelera (HEAD ./version.json) va a la red y trae Date', async ({
    page,
  }) => {
    await page.goto('/');
    await esperarControl(page);
    const pedir = () =>
      page.evaluate(async () => {
        const antes = Date.now();
        const r = await fetch('./version.json', { method: 'HEAD', cache: 'no-store' });
        return { ok: r.ok, fecha: r.headers.get('Date'), antes, despues: Date.now() };
      });
    const primera = await pedir();
    await page.waitForTimeout(1500);
    const segunda = await pedir();
    for (const r of [primera, segunda]) {
      expect(r.ok).toBe(true);
      expect(r.fecha).toBeTruthy();
      // El servidor y el navegador comparten reloj: la cabecera debe caer entre el envío y la llegada (±2 s de redondeo).
      const hora = Date.parse(r.fecha ?? '');
      expect(hora).toBeGreaterThan(r.antes - 2000);
      expect(hora).toBeLessThan(r.despues + 2000);
    }
    // Una respuesta guardada repetiría la misma cabecera: las dos deben ser distintas (cada una vino de la red).
    expect(Date.parse(segunda.fecha ?? '') - Date.parse(primera.fecha ?? '')).toBeGreaterThanOrEqual(1000);
    // Y ninguna caché lo contiene.
    const guardado = await page.evaluate(async () => {
      for (const nombre of await caches.keys()) {
        const cache = await caches.open(nombre);
        for (const r of await cache.keys()) if (r.url.includes('version.json')) return r.url;
      }
      return null;
    });
    expect(guardado).toBeNull();
  });

  test('sin conexión, tras una visita, la app abre y muestra los proyectos guardados', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await esperarControl(page);
    await omitirBienvenida(page);
    await page.getByRole('button', { name: 'Crear un proyecto de ejemplo' }).click();
    await page.waitForURL(/#\/proyecto\//);
    await page.goto('/#/');
    await expect(page.getByRole('link', { name: 'Proyecto de ejemplo' })).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('IPN Folio');
    // Ya vio la bienvenida: no vuelve a salir, y el proyecto sigue ahí.
    await expect(page.getByRole('link', { name: 'Proyecto de ejemplo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Descargar después' })).toHaveCount(0);
    // El proyecto abre sin red (el editor viene del precaché).
    await page.getByRole('link', { name: 'Proyecto de ejemplo' }).click();
    await expect(page.locator('.vista:not([hidden]) .cm-content')).toBeVisible();
    await context.setOffline(false);
  });
});
