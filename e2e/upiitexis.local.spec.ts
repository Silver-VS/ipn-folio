// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PUERTO_DESARROLLO } from './config';
import { editorActivo, esperarEditor, omitirBienvenida } from './ayudas';

test('UpiiTeXis local: tarjeta solo en dev, 58 páginas y campos por llenar', async ({ page }, info) => {
  test.skip(
    info.project.name !== 'escritorio' ||
      !existsSync('plantillas-locales/TT_UPIITA_2023') ||
      !existsSync('espejo-local') ||
      !existsSync('public/busytex/busytex.wasm'),
    'Solo local con plantilla, activos y espejo.',
  );
  test.setTimeout(240000);
  await page.goto(`http://localhost:${PUERTO_DESARROLLO}/`);
  await omitirBienvenida(page);
  await page.getByLabel('Plantillas por unidad académica').selectOption('upiita');
  await page.getByRole('button', { name: 'Usar Trabajo Terminal UPIITA' }).click();
  await esperarEditor(page);
  await page.getByRole('button', { name: 'Actualizar PDF', exact: true }).click();
  await page.getByRole('button', { name: 'Descargar de todos modos' }).click();
  await expect(page.locator('[data-descarga="en-curso"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toHaveCount(0, {
    timeout: 120000,
  });
  await editorActivo(page).focus();
  await page.keyboard.press('Control+s');
  await expect(page.locator('[data-compilacion]')).toHaveAttribute('data-compilacion', /listo|avisos/, {
    timeout: 90000,
  });
  await expect(page.getByText(/de 58/, { exact: false }).first()).toBeVisible();
  await page.locator('.pildora > summary').click();
  await expect(page.locator('.pildora')).toContainText('XBiblioteca.bib');
  await expect(page.locator('.pildora')).toContainText(/por llenar|incompleta/);
});
