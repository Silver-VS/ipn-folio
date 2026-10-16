// SPDX-License-Identifier: AGPL-3.0-or-later
// Fuentes autoalojadas (D24): sin conexión a terceros, Noto Sans en la interfaz y JetBrains Mono en el editor.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { abrirProyectoDeEjemplo, esperarEditor } from './ayudas';

test.describe('fuentes y accesibilidad de la pantalla de proyecto', () => {
  test.skip(({ isMobile }) => isMobile, 'el compacto tiene su propia prueba de axe');

  test('el build publica las cuatro licencias OFL junto con las fuentes', async ({ request }) => {
    const respuesta = await request.get('/licencias/OFL.txt');
    expect(respuesta.ok()).toBe(true);
    const licencia = await respuesta.text();
    for (const familia of ['jetbrains-mono', 'noto-sans (', 'noto-sans-mono', 'noto-sans-math'])
      expect(licencia).toContain(familia);
    expect(licencia).toContain('SIL OPEN FONT LICENSE');
  });

  for (const tema of ['claro', 'oscuro']) {
    test(`toda la sintaxis conserva contraste de al menos 4,5:1 sobre la selección (${tema})`, async ({
      page,
    }) => {
      await abrirProyectoDeEjemplo(page);
      const contrastes = await page.evaluate((tema) => {
        document.documentElement.dataset.tema = tema;
        const muestra = document.createElement('span');
        document.body.append(muestra);
        const luminancia = (color: string) => {
          const canales = color
            .match(/\d+(?:\.\d+)?/g)!
            .slice(0, 3)
            .map((n) => {
              const c = Number(n) / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
          return canales[0]! * 0.2126 + canales[1]! * 0.7152 + canales[2]! * 0.0722;
        };
        const contrastes = [];
        for (const sintaxis of ['comando', 'entorno', 'argumento', 'matematicas', 'comentario', 'llave']) {
          for (const fondo of ['superficie', 'hundido', 'acento-suave']) {
            muestra.style.color = `var(--ipn-sintaxis-${sintaxis})`;
            muestra.style.backgroundColor = `var(--ipn-${fondo})`;
            const estilo = getComputedStyle(muestra);
            const a = luminancia(estilo.color),
              b = luminancia(estilo.backgroundColor);
            contrastes.push({ sintaxis, fondo, razon: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) });
          }
        }
        muestra.remove();
        return contrastes;
      }, tema);
      for (const contraste of contrastes)
        expect(contraste.razon, JSON.stringify(contraste)).toBeGreaterThanOrEqual(4.5);
    });
  }

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
      if (
        url.startsWith(origen) ||
        url.startsWith('data:') ||
        url.startsWith('blob:') ||
        url.startsWith('about:')
      ) {
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
    const antes = await page.evaluate(() =>
      performance.getEntriesByType('resource').some((r) => /NotoSansMath/.test(r.name)),
    );
    expect(antes).toBe(false);
    await page.locator('.vista:not([hidden]) .cm-content').click();
    await page.keyboard.insertText('∑ ∫ ≤ ≥ ≠ ∞ √ ∂ ∇');
    await expect
      .poll(() =>
        page.evaluate(() =>
          performance.getEntriesByType('resource').some((r) => /NotoSansMath/.test(r.name)),
        ),
      )
      .toBe(true);
  });

  for (const esquema of ['light', 'dark'] as const) {
    test(`axe no reporta violaciones graves en la pantalla de proyecto (${esquema})`, async ({ page }) => {
      // Abrir el proyecto y analizar con axe en WebKit puede pasar de 30 s en CI.
      test.slow();
      await page.emulateMedia({ colorScheme: esquema });
      await abrirProyectoDeEjemplo(page);
      await esperarEditor(page);
      const { violations } = await new AxeBuilder({ page }).analyze();
      const graves = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(graves, JSON.stringify(graves, null, 2)).toEqual([]);
    });
  }
});
