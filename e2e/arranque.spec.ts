// SPDX-License-Identifier: AGPL-3.0-or-later
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('arranque', () => {
  test('la página carga con el nombre, el lema y el enlace al código fuente', async ({ page }) => {
    const respuesta = await page.goto('/');
    expect(respuesta?.ok()).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page).toHaveTitle('IPN Folio');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('IPN Folio');
    await expect(page.locator('#espacio-de-trabajo')).toBeAttached();
    const enlace = page.getByRole('link', { name: 'Código fuente' });
    await expect(enlace).toBeVisible();
    await expect(enlace).toHaveAttribute('href', /^https:\/\/github\.com\/Silver-VS\/ipn-folio$/);
  });

  test('no hay desplazamiento horizontal', async ({ page }) => {
    await page.goto('/');
    const sobra = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra).toBeLessThanOrEqual(0);
  });

  for (const esquema of ['light', 'dark'] as const) {
    test(`axe no reporta violaciones graves (${esquema})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: esquema });
      await page.goto('/');
      await expect(page.getByRole('link', { name: 'Código fuente' })).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).analyze();
      const graves = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(graves, JSON.stringify(graves, null, 2)).toEqual([]);
    });
  }
});
