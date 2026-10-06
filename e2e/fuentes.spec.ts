// SPDX-License-Identifier: AGPL-3.0-or-later
// Fuentes autoalojadas (D24): sin conexión a terceros, Noto Sans en la interfaz y JetBrains Mono en el editor.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { abrirProyectoDeEjemplo, esperarEditor } from './ayudas';

test.describe('fuentes y accesibilidad de la pantalla de proyecto', () => {
  test.skip(({ isMobile }) => isMobile, 'el compacto tiene su propia prueba de axe');

  test('todo carga del mismo origen y las fuentes del editor y de la interfaz son las correctas, sin conexión a terceros', async ({
    page,
    context,
    browserName,
  }) => {
    const origen = new URL(test.info().project.use.baseURL ?? 'http://localhost:4173').origin;
    const externas: string[] = [];
    // Cualquier petición a otro origen se bloquea y se anota: la prueba falla si hubo alguna.
    await context.route('**/*', (ruta) => {
      const url = ruta.request().url();
      if (url.startsWith(origen) || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) {
        return ruta.continue();
      }
      externas.push(url);
      return ruta.abort();
    });
    await abrirProyectoDeEjemplo(page);
    await esperarEditor(page);
    await page.waitForLoadState('networkidle');

    const fuentes = await page.evaluate(async () => {
      // Las caras se descargan al usarse: se espera (hasta 8 s) a que estén las dos familias. `fonts.ready` no sirve
      // aquí porque WebKit a veces lo deja pendiente.
      const cargadasAhora = () =>
        [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replaceAll('"', ''));
      for (let i = 0; i < 80; i++) {
        const ahora = cargadasAhora();
        if (ahora.includes('JetBrains Mono') && ahora.includes('Noto Sans')) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const cargadas = cargadasAhora();
      const editor = getComputedStyle(document.querySelector('.cm-scroller') as Element);
      const interfaz = getComputedStyle(document.body);
      return {
        cargadas,
        editorFamilia: editor.fontFamily,
        editorLigaduras: editor.fontVariantLigatures,
        interfazFamilia: interfaz.fontFamily,
      };
    });
    expect(externas).toEqual([]);
    // El estado «loaded» de `document.fonts` es fiable en Chromium; WebKit, bajo carga, a veces lo informa vacío aunque
    // los archivos se descargaron: ahí basta con las familias calculadas y los archivos .woff2 de abajo.
    if (browserName === 'chromium') {
      expect(fuentes.cargadas).toContain('JetBrains Mono');
      expect(fuentes.cargadas).toContain('Noto Sans');
    }
    expect(fuentes.editorFamilia).toMatch(/^"?JetBrains Mono"?/);
    expect(fuentes.editorLigaduras).toBe('none');
    expect(fuentes.interfazFamilia).toMatch(/^"?Noto Sans"?/);

    // Los archivos de fuente salieron de la propia aplicación (sin @fontsource ni CDN).
    const woff = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .filter((n) => n.endsWith('.woff2')),
    );
    expect(woff.some((n) => /JetBrainsMono-latin-regular/.test(n))).toBe(true);
    expect(woff.some((n) => /NotoSans-latin-regular/.test(n))).toBe(true);
    expect(woff.every((n) => n.startsWith(origen))).toBe(true);
  });

  test('los símbolos matemáticos caen en Noto Sans Math solo cuando aparecen', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    await esperarEditor(page);
    const antes = await page.evaluate(() => performance.getEntriesByType('resource').some((r) => /NotoSansMath/.test(r.name)));
    expect(antes).toBe(false);
    await page.locator('.vista:not([hidden]) .cm-content').click();
    await page.keyboard.insertText('∑ ∫ ≤ ≥ ≠ ∞ √ ∂ ∇');
    await expect
      .poll(() => page.evaluate(() => performance.getEntriesByType('resource').some((r) => /NotoSansMath/.test(r.name))))
      .toBe(true);
  });

  for (const esquema of ['light', 'dark'] as const) {
    test(`axe no reporta violaciones graves en la pantalla de proyecto (${esquema})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: esquema });
      await abrirProyectoDeEjemplo(page);
      await esperarEditor(page);
      const { violations } = await new AxeBuilder({ page }).analyze();
      const graves = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(graves, JSON.stringify(graves, null, 2)).toEqual([]);
    });
  }
});
