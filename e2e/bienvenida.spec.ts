// SPDX-License-Identifier: AGPL-3.0-or-later
// Bienvenida de primer uso, instalación por herramientas y regla de red (sesión 07).
import { existsSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { TAMANOS } from './config';

const hayActivos = existsSync('public/busytex/busytex.wasm');
const TITULO = 'Te damos la bienvenida. ¿Qué vas a usar?';

/** Simula `navigator.connection` (Chromium de escritorio no informa `type`; los teléfonos Android sí). */
async function simularRed(page: Page, conexion: { type?: string; saveData?: boolean }): Promise<void> {
  await page.addInitScript((c) => {
    Object.defineProperty(navigator, 'connection', { value: c, configurable: true });
  }, conexion);
}

function vigilarBusytex(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (p) => {
    if (p.url().includes('/busytex/')) urls.push(p.url());
  });
  return urls;
}

test.describe('bienvenida', () => {
  test('(a) primera visita: bienvenida, tamaño con {megas}, «Descargar después» y la app abre sin bajar nada', async ({
    page,
  }) => {
    const busytex = vigilarBusytex(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: TITULO })).toBeVisible();
    // El tamaño sale del manifiesto medido y coincide con la suma de activos.json (criterio 4).
    await expect(page.locator('[data-total]')).toHaveText(`Unos ${TAMANOS.latex.megas} MB`);
    await expect(page.getByRole('checkbox', { name: /Documentos LaTeX/ })).toBeChecked();
    await expect(page.getByText('Próximamente').first()).toBeVisible();
    await expect(page.getByText('App de escritorio').first()).toBeVisible();
    // La unidad académica sale de los datos comunes y se puede elegir.
    await page.getByLabel('Unidad académica').selectOption({ label: 'UPIITA' });
    await page.getByRole('checkbox', { name: /Doy clases/ }).check();

    await page.getByRole('button', { name: 'Descargar después' }).click();
    await expect(page.getByRole('button', { name: 'Usar Proyecto de ejemplo' })).toBeVisible();
    // Criterio 3: nada de BusyTeX hasta que se elige y se confirma.
    expect(busytex).toEqual([]);
    expect(
      await page.evaluate(() => caches.keys().then((k) => k.filter((n) => n.startsWith('folio-busytex-')))),
    ).toEqual([]);

    // No vuelve a salir.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Usar Proyecto de ejemplo' })).toBeVisible();
    await expect(page.getByLabel('Plantillas por unidad académica')).toHaveValue('upiita');
    await expect(page.getByRole('heading', { name: TITULO })).toHaveCount(0);
    expect(busytex).toEqual([]);
  });

  test('ninguna clave de localStorage de Folio sale de los prefijos registrados', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Descargar después' }).click();
    const claves = await page.evaluate(() => Object.keys(localStorage));
    // ipn-comun/datos/almacen.json: `folio.` es el único prefijo de Folio; `ipn.` va en sessionStorage.
    for (const clave of claves) expect(clave.startsWith('folio.'), clave).toBe(true);
    const cachesFolio = await page.evaluate(() => caches.keys());
    for (const n of cachesFolio) expect(/^folio-/.test(n), n).toBe(true);
  });

  for (const esquema of ['light', 'dark'] as const) {
    test(`axe no reporta violaciones graves en la bienvenida (${esquema})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: esquema });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: TITULO })).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).analyze();
      const graves = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(graves, JSON.stringify(graves, null, 2)).toEqual([]);
    });
  }

  for (const esquema of ['light', 'dark'] as const) {
    test(`axe no reporta violaciones graves en el inicio con el aviso de descarga y en Ajustes (${esquema})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: esquema });
      await page.goto('/');
      await page.getByRole('button', { name: 'Descargar después' }).click();
      await expect(page.getByRole('heading', { name: 'Antes de crear tu primer PDF' })).toBeVisible();
      for (const pantalla of ['inicio', 'ajustes']) {
        if (pantalla === 'ajustes') {
          await page.getByRole('link', { name: 'Ajustes' }).click();
          await expect(page.getByRole('heading', { name: 'Herramientas' })).toBeVisible();
        }
        const { violations } = await new AxeBuilder({ page }).analyze();
        const graves = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        expect(graves, `${pantalla}: ${JSON.stringify(graves, null, 2)}`).toEqual([]);
      }
    });
  }

  test('sin desplazamiento horizontal, botones táctiles de al menos 44 px y navegable con teclado', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: TITULO })).toBeVisible();
    const sobra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra).toBeLessThanOrEqual(0);
    for (const nombre of ['Descargar ahora', 'Descargar después']) {
      const caja = await page.getByRole('button', { name: nombre }).boundingBox();
      expect(caja?.height ?? 0, nombre).toBeGreaterThanOrEqual(44);
    }
    // Con solo el teclado se llega a «Descargar después» y se activa con Enter.
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      if (
        await page
          .getByRole('button', { name: 'Descargar después' })
          .evaluate((e) => e === document.activeElement)
      )
        break;
    }
    await expect(page.getByRole('button', { name: 'Descargar después' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Usar Proyecto de ejemplo' })).toBeVisible();
  });

  test('(criterio 6) con datos móviles simulados y «Solo con Wi-Fi» activo, «Descargar ahora» pregunta y no descarga', async ({
    page,
  }) => {
    await simularRed(page, { type: 'cellular' });
    const busytex = vigilarBusytex(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Descargar ahora' }).click();
    const pregunta = page.getByRole('alertdialog');
    await expect(pregunta).toContainText('datos móviles');
    await expect(pregunta).toContainText(`${TAMANOS.latex.megas} MB`);
    await page.waitForTimeout(500);
    expect(busytex).toEqual([]);
    await pregunta.getByRole('button', { name: 'Ahora no' }).click();
    await expect(pregunta).toHaveCount(0);
    expect(busytex).toEqual([]);
  });

  test('tipo de red desconocido: se pregunta antes de descargar', async ({ page }) => {
    await simularRed(page, {});
    const busytex = vigilarBusytex(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Descargar ahora' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('no dice si usas Wi-Fi');
    expect(busytex).toEqual([]);
  });

  test('16: pregunta de red enfoca el botón y devuelve el foco al cerrar', async ({ page }) => {
    await simularRed(page, { type: 'cellular' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Descargar después' }).click();
    const abrir = page.getByRole('button', { name: 'Descargar', exact: true });
    await abrir.click();
    await expect(page.getByRole('button', { name: 'Descargar de todos modos' })).toBeFocused();
    await page.getByRole('button', { name: 'Ahora no' }).click();
    await expect(abrir).toBeFocused();
  });

  test('17: un guardado fallido permite reintentar la bienvenida', async ({ page }) => {
    await page.addInitScript(() => {
      const original = IDBObjectStore.prototype.put;
      let fallar = true;
      IDBObjectStore.prototype.put = function (valor, clave) {
        if (this.name === 'ajustes' && clave === 'unidad' && fallar) {
          fallar = false;
          throw new DOMException('prueba de cuota', 'QuotaExceededError');
        }
        return original.call(this, valor, clave!);
      };
    });
    await page.goto('/');
    const despues = page.getByRole('button', { name: 'Descargar después' });
    await despues.click();
    await expect(page.getByRole('alert')).toContainText('No se pudo guardar');
    await expect(despues).toBeEnabled();
    await despues.click();
    await expect(page.getByRole('button', { name: 'Usar Proyecto de ejemplo' })).toBeVisible();
  });

  test('7: abrir el proyecto sin LaTeX no arranca ni descarga el Motor', async ({ page }) => {
    const pedidos = vigilarBusytex(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Descargar después' }).click();
    await page.getByRole('button', { name: 'Usar Proyecto de ejemplo' }).click();
    await expect(page.locator('.vista:not([hidden]) .cm-content')).toBeVisible();
    expect(pedidos).toEqual([]);
    await expect(page.getByRole('button', { name: /^Compilar$/ })).toHaveCount(0);
  });

  test('Ajustes › Herramientas: «Solo con Wi-Fi» viene activado, se puede apagar y se recuerda', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Descargar después' }).click();
    await page.getByRole('link', { name: 'Ajustes' }).click();
    const casilla = page.getByRole('checkbox', { name: /Descargar solo con Wi-Fi/ });
    await expect(casilla).toBeChecked();
    await casilla.uncheck();
    await page.reload();
    await expect(page.getByRole('checkbox', { name: /Descargar solo con Wi-Fi/ })).not.toBeChecked();
    // Python, R y Octave: próximamente; C++ y Java: app de escritorio; sin botón de instalar.
    for (const nombre of ['Cuadernos con Python', 'Cuadernos con R', 'Cuadernos con Octave']) {
      const fila = page.locator('li', { hasText: nombre });
      await expect(fila).toContainText('Próximamente');
      await expect(fila.getByRole('button')).toHaveCount(0);
    }
    for (const nombre of ['C y C++', 'Java']) {
      const fila = page.locator('li', { hasText: nombre });
      await expect(fila).toContainText('App de escritorio');
      await expect(fila.getByRole('button')).toHaveCount(0);
    }
  });
});

test.describe('instalación de LaTeX en la aplicación', () => {
  test.skip(!hayActivos, 'No hay activos de BusyTeX en public/busytex/ (corre npm run activos).');
  test.describe.configure({ timeout: 240_000 });

  test('2: datos incompatibles con su cargador muestran error de versión', async ({ page }, info) => {
    test.skip(info.project.name !== 'escritorio', 'Solo escritorio.');
    await simularRed(page, { type: 'wifi' });
    await page.route('**/busytex/texlive-basic.data', (ruta) =>
      ruta.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        body: Buffer.from([0]),
      }),
    );
    await page.goto('/');
    await page.getByRole('button', { name: 'Descargar ahora' }).click();
    await expect(page.getByRole('alert')).toContainText('La versión del compilador cambió', {
      timeout: 60_000,
    });
    await expect(page.getByRole('alert')).not.toContainText('Se perdió la conexión');
  });

  test('(b) instalar con Wi-Fi: progreso real, espacio usado, sin conexión la app abre y quitar libera todo', async ({
    page,
    context,
  }, info) => {
    test.skip(info.project.name !== 'escritorio', 'El motor pesa ~128 MB: solo escritorio.');
    await simularRed(page, { type: 'wifi' });
    await page.goto('/');
    const anuncios = page.locator('p.anuncio[role="status"]');
    await expect(anuncios).toHaveText('');
    await anuncios.evaluate((nodo) => nodo.setAttribute('data-misma-region', 'si'));
    await page.getByRole('button', { name: 'Descargar ahora' }).click();

    // Aparece el panel con la barra de avance (Pausar disponible) y termina en «Compilador listo».
    const panel = page.locator('[data-descarga]');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('progressbar', { name: 'Avance de la descarga' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible();
    await expect(anuncios).toHaveText('Se inició la descarga del compilador de LaTeX.');
    await expect(
      page.getByText('Compilador listo. Ya puedes compilar en este equipo sin conexión.'),
    ).toBeVisible({
      timeout: 200_000,
    });
    await expect(anuncios).toHaveText('Terminó la descarga del compilador de LaTeX.');
    await expect(anuncios).toHaveAttribute('data-misma-region', 'si');

    const cachesFolio = await page.evaluate(async () => {
      const salida: Record<string, string[]> = {};
      for (const n of await caches.keys())
        salida[n] = (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname);
      return salida;
    });
    const busytex = Object.entries(cachesFolio).filter(([n]) => n.startsWith('folio-busytex-'));
    expect(busytex).toHaveLength(1);
    expect(busytex[0]?.[1]).toHaveLength(5);
    for (const rutas of Object.values(cachesFolio))
      expect(rutas.filter((r) => r.endsWith('.data'))).toEqual([]);

    // Sin conexión: recargar y abrir; Ajustes dice «Instalada» y muestra el espacio usado.
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Usar Proyecto de ejemplo' })).toBeVisible();
    await page.getByRole('link', { name: 'Ajustes' }).click();
    const fila = page.locator('li[data-herramienta="latex"]');
    await expect(fila).toContainText('Instalada');
    await expect(fila).toContainText(`Unos ${TAMANOS.latex.megas} MB`);
    await expect(page.locator('[data-espacio]')).toContainText(/Folio usa \d+ MB en este equipo/);
    await context.setOffline(false);

    // Quitar: confirma, libera cachés y IndexedDB; los proyectos no se tocan.
    await page.getByRole('link', { name: 'Volver al inicio' }).click();
    await page.getByRole('button', { name: 'Usar Proyecto de ejemplo' }).click();
    await page.waitForURL(/#\/proyecto\//);
    await page.goto('/#/ajustes');
    await page.evaluate(
      () =>
        new Promise<void>((resolver) => {
          const abrir = indexedDB.open('folio-EM_PRELOAD_CACHE');
          abrir.onsuccess = () => {
            (window as Window & { bloqueo07?: IDBDatabase }).bloqueo07 = abrir.result;
            resolver();
          };
        }),
    );
    await page.getByRole('button', { name: 'Quitar' }).click();
    await expect(page.getByRole('alertdialog')).toContainText(`libera unos ${TAMANOS.latex.megas} MB`);
    await expect(page.getByRole('alertdialog').getByRole('button', { name: 'Quitar' })).toBeFocused();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Quitar' }).click();
    await expect(page.getByRole('alert')).toContainText('Cierra las otras pestañas');
    await expect(fila).toContainText('Instalada');
    await page.evaluate(() => (window as Window & { bloqueo07?: IDBDatabase }).bloqueo07?.close());
    await page.getByRole('button', { name: 'Quitar' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Quitar' }).click();
    await expect(fila).toContainText('No instalada');
    expect(
      await page.evaluate(() => caches.keys().then((k) => k.filter((n) => n.startsWith('folio-busytex-')))),
    ).toEqual([]);
    expect(await page.evaluate(() => indexedDB.databases().then((b) => b.map((x) => x.name)))).not.toContain(
      'folio-EM_PRELOAD_CACHE',
    );
    await page.goto('/#/');
    await expect(page.getByRole('link', { name: 'Proyecto de ejemplo' })).toBeVisible();
  });
});
