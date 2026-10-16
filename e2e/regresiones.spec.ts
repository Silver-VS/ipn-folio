// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from '@playwright/test';
import { PUERTO_DESARROLLO } from './config';
import { editorActivo } from './ayudas';

test.beforeEach(async ({ page }) => {
  await page.goto(`http://localhost:${PUERTO_DESARROLLO}/e2e/regresiones.html`);
  await expect(editorActivo(page)).toBeVisible();
});

test('el salto se consume y remontar conserva el cursor posterior', async ({ page }) => {
  await page.evaluate(() => {
    const { estado } = window.regresion;
    estado.irALinea({ ruta: 'main.tex', linea: 2, severidad: 'error', texto: 'Prueba' });
  });
  await expect(editorActivo(page)).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.regresion.estado.salto)).toBeUndefined();
  await page.keyboard.press('Control+End');
  await page.evaluate(() => window.regresion.remontar());
  await expect(editorActivo(page)).toBeVisible();
  await editorActivo(page).focus();
  await page.keyboard.insertText(' final');
  await expect(editorActivo(page)).toContainText('cuatro final');
});

test('la píldora anuncia estados y Escape cierra y devuelve el foco', async ({ page }) => {
  const anuncio = page.getByRole('status');
  await expect(anuncio).toHaveText('PDF sin generar');
  await page.evaluate(() => {
    const { estado } = window.regresion;
    estado.compilacion = 'compilando';
    estado.progresoCompilacion = 'Paso 1 de 2';
  });
  await expect(anuncio).toHaveText('Paso 1 de 2');
  const summary = page.locator('.pildora > summary');
  await summary.click();
  await expect(page.locator('.pildora')).toHaveAttribute('open', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('.pildora')).not.toHaveAttribute('open');
  await expect(summary).toBeFocused();
});
