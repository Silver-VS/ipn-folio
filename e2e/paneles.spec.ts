// SPDX-License-Identifier: AGPL-3.0-or-later
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { abrirProyectoDeEjemplo, editorActivo, elegirEnMenu, esperarEditor, textoDelEditor } from './ayudas';

const PDF_EJEMPLO = fileURLToPath(new URL('./fixtures/ejemplo.pdf', import.meta.url));

test.describe('paneles acomodables y visor de PDF', () => {
  test.skip(({ isMobile }) => isMobile, 'modo compacto: ver compacto.spec.ts');

  /** Caja de un panel por su pestaña de dockview (el grupo completo). */
  const grupo = (page: Page, titulo: string) =>
    page.locator('.dv-groupview').filter({ has: page.getByRole('tab', { name: titulo, exact: true }) });

  test('por omisión hay Archivos, Editor, PDF y Qué revisar con Salida; Editor y PDF van lado a lado', async ({
    page,
  }) => {
    await abrirProyectoDeEjemplo(page);
    for (const titulo of ['Archivos', 'Editor', 'PDF', 'Qué revisar', 'Salida']) {
      await expect(page.getByRole('tab', { name: titulo, exact: true }).first()).toBeVisible();
    }
    const editor = await grupo(page, 'Editor').boundingBox();
    const pdf = await grupo(page, 'PDF').boundingBox();
    expect(editor && pdf && pdf.x > editor.x + editor.width - 2).toBe(true);
  });

  test('la distribución elegida se conserva tras recargar y «Restablecer distribución» vuelve a la inicial', async ({
    page,
  }) => {
    await abrirProyectoDeEjemplo(page);
    await elegirEnMenu(page, 'Distribución', 'Editor arriba, PDF abajo');
    const antes = {
      editor: await grupo(page, 'Editor').boundingBox(),
      pdf: await grupo(page, 'PDF').boundingBox(),
    };
    expect(antes.editor && antes.pdf && antes.pdf.y > antes.editor.y + antes.editor.height - 2).toBe(true);

    // El guardado de la distribución espera 400 ms de calma.
    await page.waitForTimeout(900);
    await page.reload();
    await esperarEditor(page);
    const despues = {
      editor: await grupo(page, 'Editor').boundingBox(),
      pdf: await grupo(page, 'PDF').boundingBox(),
    };
    expect(
      despues.editor && despues.pdf && despues.pdf.y > despues.editor.y + despues.editor.height - 2,
    ).toBe(true);
    expect(Math.abs((despues.pdf?.height ?? 0) - (antes.pdf?.height ?? 0))).toBeLessThan(4);

    await elegirEnMenu(page, 'Distribución', 'Restablecer distribución');
    const inicial = {
      editor: await grupo(page, 'Editor').boundingBox(),
      pdf: await grupo(page, 'PDF').boundingBox(),
    };
    expect(inicial.editor && inicial.pdf && inicial.pdf.x > inicial.editor.x + inicial.editor.width - 2).toBe(
      true,
    );
  });

  test('arrastrar la pestaña PDF debajo del editor mueve el panel y la posición se recuerda', async ({
    page,
    browserName,
  }) => {
    // En el WebKit de Linux (CI) el arrastre con el ratón de Playwright no llega a soltar en dockview (falló en todas las
    // corridas); en Chromium y en el WebKit de Windows sí se prueba.
    test.skip(
      browserName === 'webkit' && process.platform === 'linux',
      'arrastre no fiable en WebKit de Linux',
    );
    await abrirProyectoDeEjemplo(page);
    const editor = await grupo(page, 'Editor').boundingBox();
    const pestana = page.getByRole('tab', { name: 'PDF', exact: true });
    const origen = await pestana.boundingBox();
    expect(editor && origen).toBeTruthy();
    // Se suelta en el borde inferior del editor (zona de «dividir hacia abajo» de dockview).
    await page.mouse.move(origen!.x + origen!.width / 2, origen!.y + origen!.height / 2);
    await page.mouse.down();
    await page.mouse.move(editor!.x + editor!.width / 2, editor!.y + editor!.height * 0.9, { steps: 12 });
    await page.mouse.move(editor!.x + editor!.width / 2, editor!.y + editor!.height * 0.95, { steps: 4 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const e = await grupo(page, 'Editor').boundingBox();
        const p = await grupo(page, 'PDF').boundingBox();
        return !!(e && p && p.y > e.y + e.height - 2);
      })
      .toBe(true);
    await page.waitForTimeout(900);
    await page.reload();
    await esperarEditor(page);
    const e = await grupo(page, 'Editor').boundingBox();
    const p = await grupo(page, 'PDF').boundingBox();
    expect(e && p && p.y > e.y + e.height - 2).toBe(true);
  });

  test('un panel oculto desde el menú «Distribución» sigue oculto tras recargar y se puede volver a mostrar', async ({
    page,
  }) => {
    await abrirProyectoDeEjemplo(page);
    await elegirEnMenu(page, 'Distribución', 'Qué revisar');
    await expect(page.getByRole('tab', { name: 'Qué revisar', exact: true })).toHaveCount(0);
    await page.waitForTimeout(900);
    await page.reload();
    await esperarEditor(page);
    await expect(page.getByRole('tab', { name: 'Qué revisar', exact: true })).toHaveCount(0);
    await elegirEnMenu(page, 'Distribución', 'Qué revisar');
    await expect(page.getByRole('tab', { name: 'Qué revisar', exact: true })).toBeVisible();
  });

  test('un panel se oculta con la × o con Supr, y vuelve desde el menú', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    // Con el ratón: la × de la pestaña.
    await page.getByRole('tab', { name: 'Archivos', exact: true }).locator('.dv-default-tab-action').click();
    await expect(page.getByRole('tab', { name: 'Archivos', exact: true })).toHaveCount(0);
    // Con el teclado: la pestaña enfocada y Supr (Ctrl+W es del navegador).
    await page.getByRole('tab', { name: 'PDF', exact: true }).focus();
    await page.keyboard.press('Delete');
    await expect(page.getByRole('tab', { name: 'PDF', exact: true })).toHaveCount(0);
    await elegirEnMenu(page, 'Distribución', 'PDF');
    await expect(page.getByRole('tab', { name: 'PDF', exact: true })).toBeVisible();
  });

  test('el visor muestra el PDF de ejemplo y conserva página y zoom al recibir el mismo PDF otra vez', async ({
    page,
  }) => {
    await abrirProyectoDeEjemplo(page);
    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles(PDF_EJEMPLO);
    await expect(page.locator('.visor-pagina canvas').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('de 2', { exact: true })).toBeVisible();

    // Se va a la página 2 y se acerca.
    const pagina = page.getByRole('spinbutton', { name: 'Página' });
    await pagina.fill('2');
    await pagina.press('Enter');
    await page.getByRole('button', { name: 'Acercar' }).click();
    await expect(page.locator('.visor-pagina canvas').nth(1)).toBeVisible();
    const zoomAntes = await page.locator('.zoom').innerText();
    await expect(pagina).toHaveValue('2');

    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles(PDF_EJEMPLO);
    await expect(page.locator('.visor-pagina canvas').nth(1)).toBeVisible();
    await page.waitForTimeout(500);
    await expect(pagina).toHaveValue('2');
    expect(await page.locator('.zoom').innerText()).toBe(zoomAntes);
    // Sigue habiendo dibujo (no quedó en blanco tras el cambio).
    const pintado = await page
      .locator('.visor-pagina canvas')
      .nth(1)
      .evaluate((c: HTMLCanvasElement) => {
        const datos = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < datos.length; i += 4) if (datos[i]! < 200) return true;
        return false;
      });
    expect(pintado).toBe(true);
  });

  test('el panel PDF se puede sacar a otra ventana y sigue mostrando el PDF', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'ventanas emergentes: se prueba en Chromium');
    await abrirProyectoDeEjemplo(page);
    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles(PDF_EJEMPLO);
    await expect(page.locator('.visor-pagina canvas').first()).toBeVisible({ timeout: 15_000 });

    const nueva = context.waitForEvent('page');
    await grupo(page, 'PDF').getByRole('button', { name: 'Abrir este panel en otra ventana' }).click();
    const ventana = await nueva;
    await ventana.waitForLoadState();
    // El PDF se volvió a dibujar en la ventana nueva.
    await expect(ventana.locator('.visor-pagina canvas').first()).toBeVisible({ timeout: 15_000 });
    await expect(ventana.getByText('de 2', { exact: true })).toBeVisible();
    await ventana.getByRole('button', { name: 'Acercar' }).click();
    await expect(ventana.locator('.visor-pagina canvas').first()).toBeVisible();
    await ventana.close();
    // Al cerrar la ventana el panel vuelve a la ventana principal.
    await expect(page.getByRole('tab', { name: 'PDF', exact: true })).toBeVisible();
  });

  test('el editor se puede sacar a otra ventana y se puede seguir escribiendo', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'ventanas emergentes: se prueba en Chromium');
    await abrirProyectoDeEjemplo(page);
    const nueva = context.waitForEvent('page');
    await grupo(page, 'Editor').getByRole('button', { name: 'Abrir este panel en otra ventana' }).click();
    const ventana = await nueva;
    await ventana.waitForLoadState();
    await expect(ventana.locator('.cm-content').first()).toBeVisible({ timeout: 15_000 });
    // El editor es más alto que la ventana pequeña: se enfoca sin buscar un punto del elemento al que hacer clic.
    await ventana.locator('.cm-content').first().focus();
    await ventana.keyboard.press('Control+End');
    await ventana.keyboard.type('% escrito en la ventana emergente');
    await expect
      .poll(() =>
        ventana
          .locator('.cm-content')
          .first()
          .evaluate(
            (el) =>
              (
                el as unknown as { cmTile?: { view?: { state: { doc: { toString(): string } } } } }
              ).cmTile?.view?.state.doc.toString() ?? '',
          ),
      )
      .toContain('% escrito en la ventana emergente');
    await ventana.close();
    // De vuelta en la principal el texto sigue ahí.
    await expect.poll(() => textoDelEditor(page)).toContain('% escrito en la ventana emergente');
    await expect(editorActivo(page)).toBeVisible();
  });
});
