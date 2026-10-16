// SPDX-License-Identifier: AGPL-3.0-or-later
// Papelera única (D29): borrar manda a la papelera, restaurar sin pisar, caducidad con hora confiable, diálogos y axe.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { abrirProyectoDeEjemplo, omitirBienvenida } from './ayudas';

const DIA = 86_400_000;

/** Lleva el árbol de archivos a la vista (en el teléfono es una pestaña). */
async function verArchivos(page: Page, esMovil: boolean): Promise<void> {
  if (esMovil) await page.getByRole('tab', { name: 'Archivos', exact: true }).click();
  await expect(page.getByRole('tree', { name: 'Árbol de archivos' })).toBeVisible();
}

async function borrarDelArbol(page: Page, esMovil: boolean, nombre: string | RegExp): Promise<void> {
  await verArchivos(page, esMovil);
  await page.getByRole('treeitem', { name: nombre }).first().click();
  await page.getByRole('button', { name: 'Borrar', exact: true }).click();
}

function idDeProyecto(page: Page): string {
  return decodeURIComponent(new URL(page.url()).hash.split('/')[2]!);
}

/** Contenido guardado de un archivo del proyecto, leído directo de IndexedDB (`undefined` si no existe). */
async function contenidoGuardado(page: Page, id: string, ruta: string): Promise<string | undefined> {
  return page.evaluate(
    ({ id, ruta }) =>
      new Promise<string | undefined>((resolver, rechazar) => {
        const abrir = indexedDB.open('ipn-folio');
        abrir.onerror = () => rechazar(abrir.error);
        abrir.onsuccess = () => {
          const db = abrir.result;
          const leer = db.transaction('archivos').objectStore('archivos').get([id, ruta]);
          leer.onerror = () => rechazar(leer.error);
          leer.onsuccess = () => {
            db.close();
            const c = leer.result?.contenido as string | Uint8Array | undefined;
            resolver(c === undefined ? undefined : typeof c === 'string' ? c : new TextDecoder().decode(c));
          };
        };
      }),
    { id, ruta },
  );
}

async function subirTexto(page: Page, nombre: string, texto: string): Promise<void> {
  await page.locator('input[type="file"][multiple]').setInputFiles({
    name: nombre,
    mimeType: 'text/plain',
    buffer: Buffer.from(texto),
  });
}

async function irAPapelera(page: Page): Promise<void> {
  await page.evaluate(() => (location.hash = '#/papelera'));
  await expect(page.getByRole('heading', { name: 'Papelera', level: 2 })).toBeVisible();
}

/** Responde la petición de hora del sitio con la cabecera `Date` que tenga `sitio.hora`, o la aborta. */
async function simularHoraDelSitio(
  page: Page,
  sitio: { hora: number | 'sin-red'; respondidas?: number },
): Promise<void> {
  await page.route('**/version.json', async (ruta) => {
    if (sitio.hora === 'sin-red') return ruta.abort('failed');
    sitio.respondidas = (sitio.respondidas ?? 0) + 1;
    return ruta.fulfill({
      status: 200,
      headers: { date: new Date(sitio.hora).toUTCString(), 'content-type': 'application/json' },
      body: '{}',
    });
  });
}

/**
 * Espera a que la app ya tenga la hora del sitio. Si se borra antes, el elemento queda con fecha no confiable y se
 * vuelve a sellar con la primera hora confiable (D29): la prueba mediría otro plazo.
 */
async function esperarHoraDelSitio(page: Page, sitio: { hora: number | 'sin-red' }): Promise<void> {
  // Esta marca se escribe después de medir Y purgar; recibir HEAD no prueba que terminó ninguna de las dos.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<number | undefined>((resolver, rechazar) => {
            const abrir = indexedDB.open('ipn-folio');
            abrir.onerror = () => rechazar(abrir.error);
            abrir.onsuccess = () => {
              const db = abrir.result;
              const leer = db.transaction('ajustes').objectStore('ajustes').get('papelera.ultimaPurga');
              leer.onerror = () => {
                db.close();
                rechazar(leer.error);
              };
              leer.onsuccess = () => {
                db.close();
                resolver(leer.result);
              };
            };
          }),
      ),
    )
    .toBeGreaterThanOrEqual(sitio.hora as number);
}

test.describe('papelera', () => {
  test('borrar un archivo, recargar, abrir la papelera y restaurar: vuelve con su contenido', async ({
    page,
    isMobile,
  }) => {
    await abrirProyectoDeEjemplo(page);
    const id = idDeProyecto(page);
    const original = await contenidoGuardado(page, id, 'referencias.bib');
    expect(original).toBeTruthy();
    await borrarDelArbol(page, isMobile, /referencias\.bib/);
    await expect(page.getByRole('treeitem', { name: /referencias\.bib/ })).toHaveCount(0);
    expect(await contenidoGuardado(page, id, 'referencias.bib')).toBeUndefined();

    await page.reload();
    await irAPapelera(page);
    const fila = page.getByRole('listitem').filter({ hasText: 'referencias.bib' });
    await expect(fila).toBeVisible();
    await fila.getByRole('button', { name: 'Restaurar referencias.bib' }).click();
    await expect(page.getByText('Se restauró referencias.bib.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Papelera (0)' })).toHaveCount(0);
    expect(await contenidoGuardado(page, id, 'referencias.bib')).toBe(original);
    await page.getByRole('link', { name: 'Abrir proyecto' }).click();
    await verArchivos(page, isMobile);
    await expect(page.getByRole('treeitem', { name: /referencias\.bib/ })).toBeVisible();
  });

  test('borrar una carpeta y usar Deshacer la devuelve completa y deja el foco en el árbol', async ({
    page,
    isMobile,
  }) => {
    await abrirProyectoDeEjemplo(page);
    await borrarDelArbol(page, isMobile, 'capitulos');
    await expect(page.getByRole('treeitem', { name: /desarrollo\.tex/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Deshacer' }).click();
    const archivo = page.getByRole('treeitem', { name: /desarrollo\.tex/ });
    await expect(archivo).toBeVisible();
    await expect(archivo).toBeFocused();
  });

  test('restaurar un archivo cuyo nombre ya se ocupó usa «(2)» y no pisa el nuevo', async ({
    page,
    isMobile,
  }) => {
    await abrirProyectoDeEjemplo(page);
    const id = idDeProyecto(page);
    await verArchivos(page, isMobile);
    await subirTexto(page, 'x.tex', 'primero');
    await expect(page.getByRole('treeitem', { name: /x\.tex/ })).toBeVisible();
    await borrarDelArbol(page, isMobile, /x\.tex/);
    await expect(page.getByRole('treeitem', { name: /x\.tex/ })).toHaveCount(0);
    await subirTexto(page, 'x.tex', 'segundo');
    await expect(page.getByRole('treeitem', { name: /x\.tex/ })).toBeVisible();

    await irAPapelera(page);
    await page.getByRole('button', { name: 'Restaurar x.tex' }).click();
    await expect(page.getByText('Se restauró como x (2).tex porque x.tex ya existía.')).toBeVisible();
    expect(await contenidoGuardado(page, id, 'x.tex')).toBe('segundo');
    expect(await contenidoGuardado(page, id, 'x (2).tex')).toBe('primero');
  });

  test('la papelera del proyecto lista lo borrado y permite restaurarlo desde el árbol', async ({
    page,
    isMobile,
  }) => {
    await abrirProyectoDeEjemplo(page);
    await borrarDelArbol(page, isMobile, /referencias\.bib/);
    await page.getByRole('button', { name: 'Papelera de este proyecto (1)' }).click();
    await page.getByRole('button', { name: 'Restaurar referencias.bib' }).click();
    await expect(page.getByRole('treeitem', { name: /referencias\.bib/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Papelera de este proyecto (0)' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver toda la papelera' })).toHaveAttribute(
      'href',
      '#/papelera',
    );
  });

  test.describe('caducidad con hora confiable', () => {
    const T = new Date('2027-03-01T12:00:00Z').getTime();
    // Con carga (tres perfiles en paralelo) estos escenarios tardan ~30 s: margen amplio.
    test.describe.configure({ timeout: 60_000 });
    // La hora del sitio se simula con page.route; en WebKit esa ruta no ve lo que pide el service worker (sesión 07).
    test.use({ serviceWorkers: 'block' });

    test('a los 32 días con hora del sitio y reloj adelantados, el elemento ya no está y no hay aviso', async ({
      page,
      isMobile,
    }) => {
      const sitio: { hora: number | 'sin-red'; respondidas?: number } = { hora: T };
      await simularHoraDelSitio(page, sitio);
      await page.clock.install({ time: T });
      await abrirProyectoDeEjemplo(page);
      await esperarHoraDelSitio(page, sitio);
      await borrarDelArbol(page, isMobile, /referencias\.bib/);
      await expect(page.getByRole('treeitem', { name: /referencias\.bib/ })).toHaveCount(0);
      await irAPapelera(page);
      await expect(page.getByRole('listitem').filter({ hasText: 'referencias.bib' })).toBeVisible();
      // «Se borrará…» es un dato de cada elemento, no un recordatorio.
      await expect(page.getByText(/Se borrará dentro de (30|31) días/)).toBeVisible();

      sitio.hora = T + 32 * DIA;
      await page.clock.setSystemTime(T + 32 * DIA);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Papelera', level: 2 })).toBeVisible();
      await expect(page.getByText(/La papelera está vacía/)).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByText(/se borraron|se borrarán/i)).toHaveCount(0);
    });

    test('sin la petición de hora, aunque pasen 60 días el elemento sigue en la papelera', async ({
      page,
      isMobile,
    }) => {
      const sitio = { hora: 'sin-red' as number | 'sin-red' };
      await simularHoraDelSitio(page, sitio);
      await page.clock.install({ time: T });
      await abrirProyectoDeEjemplo(page);
      await borrarDelArbol(page, isMobile, /referencias\.bib/);
      await expect(page.getByRole('treeitem', { name: /referencias\.bib/ })).toHaveCount(0);

      await page.clock.setSystemTime(T + 60 * DIA);
      await page.reload();
      await irAPapelera(page);
      await expect(page.getByRole('listitem').filter({ hasText: 'referencias.bib' })).toBeVisible();

      // Cuando vuelve la conexión el plazo empieza a contar desde la primera hora confiable: ese mismo día no se borra.
      sitio.hora = T + 60 * DIA;
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Papelera', level: 2 })).toBeVisible();
      await expect(page.getByRole('listitem').filter({ hasText: 'referencias.bib' })).toBeVisible();
    });

    test('cambiar a menos días muestra cuántos elementos se borrarían y pide confirmación', async ({
      page,
      isMobile,
    }) => {
      const sitio: { hora: number | 'sin-red'; respondidas?: number } = { hora: T };
      await simularHoraDelSitio(page, sitio);
      await page.clock.install({ time: T });
      await abrirProyectoDeEjemplo(page);
      await irAPapelera(page);
      await page.getByLabel('Borrar automáticamente después de').selectOption('90');
      await page.evaluate(() => (location.hash = '#/'));
      await page.getByRole('link', { name: 'Proyecto de ejemplo' }).click();
      await esperarHoraDelSitio(page, sitio);
      await borrarDelArbol(page, isMobile, /referencias\.bib/);
      // No avanzar a T+20 hasta comprobar el sello que realmente quedó persistido en T.
      await expect(page.getByRole('treeitem', { name: /referencias\.bib/ })).toHaveCount(0);
      const sello = await page.evaluate(
        () =>
          new Promise<{ fecha: number; fechaConfiable: boolean }>((resolver, rechazar) => {
            const abrir = indexedDB.open('ipn-folio');
            abrir.onerror = () => rechazar(abrir.error);
            abrir.onsuccess = () => {
              const db = abrir.result;
              const leer = db.transaction('papelera').objectStore('papelera').getAll();
              leer.onerror = () => {
                db.close();
                rechazar(leer.error);
              };
              leer.onsuccess = () => {
                db.close();
                resolver(leer.result[0]);
              };
            };
          }),
      );
      expect(sello.fechaConfiable).toBe(true);
      expect(sello.fecha).toBeGreaterThanOrEqual(T);
      expect(sello.fecha).toBeLessThan(T + DIA);
      await irAPapelera(page);
      await expect(page.getByRole('listitem').filter({ hasText: 'referencias.bib' })).toBeVisible();
      sitio.hora = T + 20 * DIA;
      await page.clock.setSystemTime(T + 20 * DIA);
      await page.reload();
      await irAPapelera(page);
      await expect(page.getByRole('listitem').filter({ hasText: 'referencias.bib' })).toBeVisible();
      await page.getByLabel('Borrar automáticamente después de').selectOption('7');
      const dialogo = page.getByRole('dialog');
      await expect(dialogo).toContainText('Con 7 días, se borraría ahora 1 elemento de la papelera.');
      await dialogo.getByRole('button', { name: 'Cancelar' }).click();
      await expect(page.getByLabel('Borrar automáticamente después de')).toHaveValue('90');
      await expect(page.getByRole('listitem').filter({ hasText: 'referencias.bib' })).toBeVisible();
      await page.getByLabel('Borrar automáticamente después de').selectOption('7');
      await page.getByRole('dialog').getByRole('button', { name: 'Cambiar y borrar' }).click();
      await expect(page.getByText(/La papelera está vacía/)).toBeVisible();
    });

    test('sin conexión, bajar los días también pide confirmación (se mide la hora antes de decidir)', async ({
      page,
      isMobile,
    }) => {
      const sitio = { hora: 'sin-red' as number | 'sin-red' };
      await simularHoraDelSitio(page, sitio);
      await page.clock.install({ time: T });
      await abrirProyectoDeEjemplo(page);
      await irAPapelera(page);
      await page.getByLabel('Borrar automáticamente después de').selectOption('90');
      await page.evaluate(() => (location.hash = '#/'));
      await page.getByRole('link', { name: 'Proyecto de ejemplo' }).click();
      await borrarDelArbol(page, isMobile, /referencias.bib/);
      await expect(page.getByRole('treeitem', { name: /referencias.bib/ })).toHaveCount(0);
      await page.clock.setSystemTime(T + 20 * DIA);
      await page.reload();
      await irAPapelera(page);
      await expect(page.getByRole('listitem').filter({ hasText: 'referencias.bib' })).toBeVisible();
      await page.getByLabel('Borrar automáticamente después de').selectOption('7');
      await expect(page.getByRole('dialog')).toContainText('se borraría ahora 1 elemento');
    });
  });

  test('«Borrar definitivamente» y «Vaciar papelera» piden confirmación; cancelar no borra nada', async ({
    page,
    isMobile,
  }) => {
    await abrirProyectoDeEjemplo(page);
    await borrarDelArbol(page, isMobile, /referencias\.bib/);
    await borrarDelArbol(page, isMobile, /main\.tex/);
    await irAPapelera(page);
    const filas = page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3 }) });
    await expect(filas).toHaveCount(2);

    const abrir = page.getByRole('button', { name: 'Borrar definitivamente referencias.bib' });
    await abrir.click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('¿Borrar definitivamente referencias.bib? No se puede deshacer.');
    await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialogo).toHaveCount(0);
    await expect(abrir).toBeFocused();
    await expect(filas).toHaveCount(2);

    await abrir.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar definitivamente' }).click();
    await expect(filas).toHaveCount(1);

    await page.getByRole('button', { name: 'Vaciar papelera' }).click();
    await expect(page.getByRole('dialog')).toContainText(
      '¿Vaciar la papelera? Se borrará definitivamente 1 elemento.',
    );
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    await expect(filas).toHaveCount(1);
    await page.getByRole('button', { name: 'Vaciar papelera' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Vaciar papelera' }).click();
    await expect(page.getByText(/La papelera está vacía/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Vaciar papelera' })).toBeDisabled();
  });

  test('un proyecto en la papelera se restaura desde #/papelera y se abre', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    await page.getByRole('button', { name: 'Proyecto', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Mover el proyecto a la papelera' }).click();
    await page.getByRole('link', { name: 'Papelera (1)' }).click();
    await expect(page).toHaveURL(/#\/papelera$/);
    const fila = page.getByRole('listitem').filter({ hasText: 'Proyecto de ejemplo' });
    await expect(fila.getByText('Proyecto', { exact: true })).toBeVisible();
    await fila.getByRole('button', { name: 'Restaurar Proyecto de ejemplo' }).click();
    await expect(page.getByText('Se restauró el proyecto Proyecto de ejemplo.')).toBeVisible();
    await page.getByRole('link', { name: 'Abrir proyecto' }).click();
    await expect(page).toHaveURL(/#\/proyecto\//);
    await expect(page.getByRole('heading', { name: 'Proyecto de ejemplo', level: 1 })).toBeVisible();
  });

  test('con dos pestañas, borrar en una actualiza la vista Papelera de la otra', async ({
    page,
    context,
    isMobile,
    browserName,
  }) => {
    test.skip(isMobile || browserName !== 'chromium', 'solo Chromium de escritorio');
    await abrirProyectoDeEjemplo(page);
    const hash = new URL(page.url()).hash;
    const otra = await context.newPage();
    await otra.goto('/#/papelera');
    await expect(otra.getByText(/La papelera está vacía/)).toBeVisible();
    await borrarDelArbol(page, false, /referencias\.bib/);
    await expect(otra.getByRole('listitem').filter({ hasText: 'referencias.bib' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(hash.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')));
    await otra.close();
  });

  test.describe('accesibilidad y responsividad', () => {
    for (const esquema of ['light', 'dark'] as const) {
      test(`axe no reporta violaciones graves en #/papelera: vacía, con elementos y con el diálogo (${esquema})`, async ({
        page,
        isMobile,
      }) => {
        await page.emulateMedia({ colorScheme: esquema });
        const revisar = async () => {
          const { violations } = await new AxeBuilder({ page }).analyze();
          const graves = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
          expect(graves, JSON.stringify(graves, null, 2)).toEqual([]);
        };
        await page.goto('/');
        await omitirBienvenida(page);
        await page.goto('/#/papelera');
        await expect(page.getByText(/La papelera está vacía/)).toBeVisible();
        await revisar();

        await page.goto('/');
        await abrirProyectoDeEjemplo(page);
        await borrarDelArbol(page, isMobile, /referencias\.bib/);
        await irAPapelera(page);
        await expect(page.getByRole('listitem').filter({ hasText: 'referencias.bib' })).toBeVisible();
        await revisar();

        await page.getByRole('button', { name: 'Borrar definitivamente referencias.bib' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await revisar();
      });
    }

    test('a 390×844 no hay desplazamiento horizontal y los botones miden al menos 44 px', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await abrirProyectoDeEjemplo(page);
      // A 390 px de ancho la pantalla de proyecto es compacta (pestañas) aunque el perfil no sea el móvil.
      await borrarDelArbol(page, true, /referencias.bib/);
      await irAPapelera(page);
      await expect(page.getByRole('listitem').filter({ hasText: 'referencias.bib' })).toBeVisible();
      const sobra = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(sobra).toBeLessThanOrEqual(0);
      for (const boton of await page.getByRole('main').getByRole('button').all()) {
        const caja = await boton.boundingBox();
        expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await page.setViewportSize({ width: 320, height: 640 });
      const sobra320 = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(sobra320).toBeLessThanOrEqual(0);
    });
  });
});
