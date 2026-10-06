// SPDX-License-Identifier: AGPL-3.0-or-later
// Modo compacto (teléfono, 390×844 táctil): un panel a la vez, pestañas abajo y sin descargar dockview.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { abrirProyectoDeEjemplo, editorActivo, esperarEditor, textoDelEditor } from './ayudas';

test.describe('modo compacto', () => {
  test.skip(({ isMobile }) => !isMobile, 'solo en el perfil móvil');

  test('un panel a la vez, pestañas de al menos 44 px y sin desplazamiento horizontal', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    const pestanas = page.getByRole('tablist', { name: 'Paneles del proyecto' }).getByRole('tab');
    await expect(pestanas).toHaveText(['Editor', 'PDF', 'Archivos', 'Qué revisar']);
    for (const pestana of await pestanas.all()) {
      const caja = await pestana.boundingBox();
      expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(caja?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
    // Solo el panel del editor está a la vista.
    await expect(page.getByRole('tabpanel', { name: 'Editor' })).toBeVisible();
    for (const otro of ['PDF', 'Archivos', 'Qué revisar']) {
      await expect(page.getByRole('tabpanel', { name: otro, exact: true })).toBeHidden();
    }
    const sobra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra).toBeLessThanOrEqual(0);
  });

  test('no se descarga dockview en el teléfono', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    await page.waitForLoadState('networkidle');
    const recursos = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name));
    // Los fragmentos de dockview se llaman «main.esm» (dockview-core) y «dockview» (estilos).
    expect(recursos.filter((r) => /main\.esm|dockview/i.test(r))).toEqual([]);
    // Prueba de que el filtro sirve: el JS de la pantalla de proyecto sí se cargó.
    expect(recursos.some((r) => /Proyecto-.*\.js/.test(r))).toBe(true);
    await expect(page.locator('.dv-dockview, .dv-groupview')).toHaveCount(0);
  });

  test('escribir, pasar a PDF y volver no pierde el cursor', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    await editorActivo(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('AAA');
    await page.getByRole('tab', { name: 'PDF', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Páginas del PDF' })).toBeVisible();
    await page.getByRole('tab', { name: 'Editor', exact: true }).click();
    await esperarEditor(page);
    // El cursor sigue donde se quedó: lo que se escribe ahora va justo después de «AAA».
    await page.keyboard.type('BBB');
    expect(await textoDelEditor(page)).toMatch(/AAABBB$/);
  });

  test('la pestaña elegida se recuerda al recargar', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    await page.getByRole('tab', { name: 'Archivos', exact: true }).click();
    await expect(page.getByRole('treeitem', { name: /main\.tex/ })).toBeVisible();
    await page.waitForTimeout(300);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Archivos', exact: true })).toHaveAttribute('aria-selected', 'true');
  });

  test('desde Archivos se abre un archivo, se vuelve al Editor y se escribe', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    await page.getByRole('tab', { name: 'Archivos', exact: true }).click();
    await page.getByRole('treeitem', { name: /referencias\.bib/ }).click();
    await page.getByRole('tab', { name: 'Editor', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'referencias.bib', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await esperarEditor(page);
  });

  for (const esquema of ['light', 'dark'] as const) {
    test(`axe no reporta violaciones graves en compacto (${esquema})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: esquema });
      await abrirProyectoDeEjemplo(page);
      const { violations } = await new AxeBuilder({ page }).analyze();
      const graves = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(graves, JSON.stringify(graves, null, 2)).toEqual([]);
    });
  }
});
