// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { editorActivo, esperarEditor, omitirBienvenida, textoDelEditor } from './ayudas';

test('Inicio renombra en línea y otra pestaña recibe el nombre', async ({ page, context }) => {
  await page.goto('/');
  await omitirBienvenida(page);
  await page.getByRole('button', { name: 'Crear un proyecto de ejemplo' }).click();
  await esperarEditor(page);
  const otra = await context.newPage();
  await otra.goto(page.url());
  await esperarEditor(otra);
  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  page.on('dialog', (dialogo) => dialogo.dismiss());
  await page.getByRole('button', { name: 'Renombrar', exact: true }).click();
  const campo = page.getByRole('textbox', { name: 'Nuevo nombre para Proyecto de ejemplo' });
  await expect(campo).toBeFocused();
  await campo.fill('Práctica biónica');
  await campo.press('Enter');
  await expect(page.getByRole('link', { name: 'Práctica biónica', exact: true })).toBeVisible();
  await expect(otra.getByRole('heading', { name: 'Práctica biónica', exact: true })).toBeVisible();
});

test('Inicio crea una plantilla, exporta, importa y mueve a la papelera con Deshacer', async ({ page }) => {
  await page.goto('/');
  await omitirBienvenida(page);
  await page.getByLabel('Plantillas por unidad académica').selectOption('upibi');
  await expect(page.getByRole('button', { name: 'Usar Reporte de práctica' })).toBeVisible();
  await page.getByRole('button', { name: 'Usar Reporte de práctica' }).click();
  await esperarEditor(page);
  expect(await textoDelEditor(page)).toContain('\\input{desarrollo}');
  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar .zip' }).click();
  const archivo = await descarga;
  const ruta = await archivo.path();
  await page.getByLabel('Importar .tex o .zip', { exact: true }).setInputFiles({
    name: archivo.suggestedFilename(),
    mimeType: 'application/zip',
    buffer: readFileSync(ruta!),
  });
  await esperarEditor(page);
  expect(await textoDelEditor(page)).toContain('\\input{desarrollo}');
  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('button', { name: 'Mover a la papelera', exact: true }).first().click();
  await expect(page.getByRole('link', { name: 'Papelera (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByRole('link', { name: 'Papelera (0)' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Ctrl+S pide permiso mediante la tienda y no descarga BusyTeX al rechazarlo', async ({ page }) => {
  const peticiones: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/busytex/')) peticiones.push(r.url());
  });
  await page.goto('/');
  await omitirBienvenida(page);
  await page.getByRole('button', { name: 'Usar Reporte de práctica' }).click();
  await esperarEditor(page);
  await editorActivo(page).focus();
  await page.keyboard.press('Control+s');
  await expect(page.getByRole('alertdialog')).toContainText('MB');
  expect(peticiones).toEqual([]);
  await page.getByRole('button', { name: 'Ahora no' }).click();
  await expect(page.locator('[data-compilacion]')).toHaveAttribute('data-compilacion', 'sin-compilar');
  const automatica = page.getByRole('checkbox', { name: 'Actualizar PDF al dejar de escribir' });
  await expect(automatica).not.toBeChecked();
  await automatica.check();
  await page.reload();
  await expect(automatica).toBeChecked();
});

test('Inicio importa una carpeta con archivos incluidos y un .tex con acentos', async ({ page }, info) => {
  const carpeta = info.outputPath('carpeta-ejemplo');
  mkdirSync(join(carpeta, 'capitulos'), { recursive: true });
  writeFileSync(join(carpeta, 'main.tex'), '\\documentclass{article}\n\\input{capitulos/uno}\n', 'utf8');
  writeFileSync(join(carpeta, 'capitulos/uno.tex'), 'Práctica de integración', 'utf8');
  await page.goto('/');
  await omitirBienvenida(page);
  await page.getByLabel('Importar carpeta', { exact: true }).setInputFiles(carpeta);
  await esperarEditor(page);
  expect(await textoDelEditor(page)).toContain('\\input{capitulos/uno}');
  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByLabel('Importar .tex o .zip', { exact: true }).setInputFiles({
    name: 'práctica.tex',
    mimeType: 'text/plain',
    buffer: Buffer.from('\\documentclass{article}\nPráctica, ñ y acentos', 'utf8'),
  });
  await esperarEditor(page);
  expect(await textoDelEditor(page)).toContain('Práctica, ñ y acentos');
});

for (const idioma of ['basic', 'espanol']) {
  test(`plantilla → PDF → imagen faltante en archivo incluido → Ir a la línea → corregir (${idioma})`, async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== 'escritorio' ||
        !existsSync('public/busytex/busytex.wasm') ||
        (idioma === 'espanol' && !existsSync('espejo-local')),
      'Requiere escritorio y activos; español requiere espejo local.',
    );
    test.setTimeout(180000);
    await page.goto('/');
    await omitirBienvenida(page);
    const comienzo = Date.now();
    await page.getByRole('button', { name: 'Usar Reporte de práctica' }).click();
    await esperarEditor(page);
    if (idioma === 'basic') {
      // Sin espejo se prueba toda la integración con basic; español conserva su escenario independiente.
      const texto = await textoDelEditor(page);
      await editorActivo(page).focus();
      await page.keyboard.press('Control+a');
      await page.keyboard.insertText(texto.replace('\\usepackage[spanish]{babel}\n', ''));
    }
    await page.getByRole('button', { name: 'Actualizar PDF', exact: true }).click();
    await page.getByRole('button', { name: 'Descargar de todos modos' }).click();
    await expect(page.locator('[data-descarga="en-curso"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toHaveCount(0, {
      timeout: 120000,
    });
    await page.getByRole('button', { name: 'Actualizar PDF', exact: true }).click();
    await expect(page.locator('[data-compilacion]')).toHaveAttribute(
      'data-compilacion',
      /listo|avisos|error/,
      { timeout: 60000 },
    );
    if (await page.locator('[data-compilacion="error"]').count()) {
      await page.locator('.pildora > summary').click();
      console.log('Problemas del primer PDF:', await page.locator('.pildora').textContent());
      await page.locator('.pildora > summary').click();
      await page.getByRole('tab', { name: 'Salida', exact: true }).click();
      console.log('Salida del primer PDF:', await page.locator('.salida').textContent());
    }
    await expect(page.locator('[data-compilacion]')).toHaveAttribute('data-compilacion', /listo|avisos/, {
      timeout: 60000,
    });
    console.log('Plantilla → primer PDF, ms:', Date.now() - comienzo);
    await page.getByRole('treeitem', { name: /desarrollo\.tex/ }).click();
    const original = await textoDelEditor(page);
    await editorActivo(page).focus();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText('\n\\includegraphics{no-existe.png}\n');
    await page.keyboard.press('Control+s');
    await expect(page.locator('[data-compilacion]')).toHaveAttribute('data-compilacion', 'error', {
      timeout: 60000,
    });
    await expect(page.getByText('Estás viendo la última versión del PDF', { exact: false })).toBeVisible();
    await page.locator('.pildora > summary').click();
    const problema = page.locator('.pildora li').filter({ hasText: 'Falta la imagen no-existe.png' }).first();
    await expect(problema).toBeVisible();
    await problema.getByRole('button', { name: 'Ir a la línea' }).click();
    await expect(editorActivo(page)).toBeFocused();
    await expect(page.getByRole('tab', { name: 'desarrollo.tex' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.cm-lintRange-error').first()).toBeVisible();
    expect(
      await editorActivo(page).evaluate((el) => {
        const vista = (
          el as unknown as {
            cmTile: {
              view: {
                state: {
                  doc: { toString(): string; lineAt(pos: number): { number: number } };
                  selection: { main: { head: number } };
                };
              };
            };
          }
        ).cmTile.view;
        const documento = vista.state.doc.toString();
        return (
          vista.state.doc.lineAt(vista.state.selection.main.head).number ===
          documento.slice(0, documento.indexOf('\\includegraphics')).split('\n').length
        );
      }),
    ).toBe(true);
    await page.keyboard.press('Control+a');
    await page.keyboard.insertText(original);
    const cache = Date.now();
    await page.keyboard.press('Control+s');
    await expect(page.locator('[data-compilacion]')).toHaveAttribute('data-compilacion', /listo|avisos/, {
      timeout: 60000,
    });
    console.log('PDF corregido con caché, ms:', Date.now() - cache);
  });
}

test('dist excluye plantillas locales y el espejo ausente responde 404', async ({ request }) => {
  const respuesta = await request.get('/espejo/26/auxiliar-inexistente-de-prueba.aux');
  expect(respuesta.status()).toBe(404);
  const recorrer = (dir: string): void => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      expect(entrada.name).not.toMatch(/TT_UPIITA|Principal\.tex|upiitatesis|plantillas-locales/i);
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(ruta);
      else if (/\.(html|js|json|css|tex)$/.test(entrada.name))
        expect(readFileSync(ruta, 'utf8')).not.toMatch(/UpiiTeXis|TT_UPIITA_2023|plantillas-locales/);
    }
  };
  recorrer('dist');
});
