// SPDX-License-Identifier: AGPL-3.0-or-later
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { omitirBienvenida, esperarEditor } from './ayudas';

for (const ancho of [1440, 1024, 768, 375, 320]) {
  for (const esquema of ['light', 'dark'] as const) {
    test(`Inicio: jerarquía, toque y accesibilidad a ${ancho}px (${esquema})`, async ({ page }, info) => {
      await page.setViewportSize({ width: ancho, height: 1000 });
      await page.emulateMedia({ colorScheme: esquema });
      await page.goto('/');
      await omitirBienvenida(page);
      await page.getByLabel('Plantillas por unidad académica').selectOption('upibi');
      await expect(page.getByRole('button', { name: 'Usar Reporte de práctica' })).toBeVisible();
      // Esperamos las dos fuentes que usa Inicio; FontFaceSet.ready también espera fuentes ajenas a esta vista.
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.fonts.check('16px "Noto Sans"', 'Práctica') &&
              document.fonts.check('700 24px "Noto Sans"', 'Tus proyectos'),
          ),
        )
        .toBe(true);

      const medir = async () => {
        const medidas = await page.evaluate(() => {
          const visibles = [...document.querySelectorAll<HTMLElement>('body *')].filter(
            (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden',
          );
          const controles = visibles.filter((el) => el.matches('button, a, select, summary, input'));
          return {
            ancho: innerWidth,
            documento: document.documentElement.scrollWidth,
            controles: controles.map((el) => ({
              nombre: el.getAttribute('aria-label') || el.textContent?.trim(),
              ancho: el.getBoundingClientRect().width,
              alto: el.getBoundingClientRect().height,
            })),
            fuentes: [
              ...new Set(
                visibles
                  .filter((el) =>
                    [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()),
                  )
                  .map((el) => getComputedStyle(el).fontSize),
              ),
            ],
            archivosVisibles: visibles.filter((el) => el.matches('input[type="file"]')).length,
            texto: document.body.innerText,
          };
        });
        expect(medidas.documento, JSON.stringify(medidas)).toBeLessThanOrEqual(medidas.ancho);
        for (const control of medidas.controles) {
          expect(control.alto, JSON.stringify(control)).toBeGreaterThanOrEqual(44);
          expect(control.ancho, JSON.stringify(control)).toBeGreaterThanOrEqual(44);
        }
        expect(medidas.fuentes, JSON.stringify(medidas)).toHaveLength(4);
        expect(medidas.archivosVisibles).toBe(0);
        expect(medidas.texto).not.toMatch(/Choose File|No file chosen|Browse/i);
        return medidas;
      };

      const titulos = page.locator('.inicio h2');
      await expect(titulos).toHaveText([
        'Antes de crear tu primer PDF',
        'Tus proyectos',
        'Importar',
        'Plantillas',
      ]);
      await expect(page.locator('.inicio .boton-primario')).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Usar Proyecto de ejemplo' })).toHaveText('Usar');
      await expect(page.locator('.tarjetas')).not.toContainText('CC0-1.0');
      const columnas = await page.locator('.tarjetas').evaluate(
        (el) =>
          getComputedStyle(el)
            .gridTemplateColumns.split(' ')
            .filter((c) => parseFloat(c) > 0).length,
      );
      expect(columnas).toBe(ancho >= 768 ? 2 : 1);
      await expect(page.getByRole('button', { name: 'Usar Reporte de práctica' })).toHaveText('Usar');
      if (ancho <= 375) {
        await expect(page.locator('.importar p')).toBeHidden();
        expect(await page.locator('.importar').evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe(
          'none',
        );
      }
      for (const enlace of [
        page.locator('.inicio a.enlace'),
        page.locator('.filtros .enlace'),
        page.locator('.inicio summary'),
      ]) {
        await expect(enlace).toHaveCSS('text-decoration-line', 'underline');
      }
      const vacio = await medir();
      if (info.project.name === 'escritorio' && [1440, 375].includes(ancho)) {
        await page.screenshot({
          path: `test-results/inicio-despues-${ancho}${esquema === 'dark' ? '-oscuro' : ''}.png`,
          fullPage: true,
        });
      }
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(
        violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
        JSON.stringify(violations, null, 2),
      ).toEqual([]);

      await page.getByRole('button', { name: 'Importar .tex, .zip o carpeta', exact: true }).click();
      const dialogo = page.getByRole('dialog');
      await expect(dialogo).toBeVisible();
      await medir();
      const elegir = page.waitForEvent('filechooser');
      await dialogo.getByRole('button', { name: 'Importar .tex o .zip', exact: true }).click();
      await (
        await elegir
      ).setFiles({ name: 'práctica.tex', mimeType: 'text/plain', buffer: Buffer.from('Práctica biónica') });
      await esperarEditor(page);
      await page.getByRole('link', { name: 'Inicio', exact: true }).click();
      await expect(page.getByRole('link', { name: 'práctica', exact: true })).toBeVisible();
      const conProyecto = await medir();
      await info.attach('medidas-inicio', {
        body: JSON.stringify({ vacio, conProyecto }, null, 2),
        contentType: 'application/json',
      });
    });
  }
}
