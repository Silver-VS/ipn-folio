// SPDX-License-Identifier: AGPL-3.0-or-later
// Latencia del editor (INP aproximado): de la pulsación a la siguiente pintura, en un archivo de 3 000 líneas.
// Se mide con el Event Timing API del navegador (el mismo que usa INP). El resultado se anota en el reporte.
import { expect, test } from '@playwright/test';
import { abrirProyectoDeEjemplo, editorActivo, esperarEditor } from './ayudas';

const LINEAS = 3000;
// Límite del plan (< 100 ms en el equipo del dueño). En un equipo de pruebas compartido se deja holgura (200 ms)
// sobre el peor caso y se exige < 100 ms en el percentil 75; ambos valores se anotan en el reporte.
const LIMITE_P75_MS = 100;
const LIMITE_MAXIMO_MS = 200;

test.describe('rendimiento del editor', () => {
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'Event Timing: solo Chromium de escritorio');

  test(`escribir en un archivo de ${LINEAS} líneas responde en menos de ${LIMITE_P75_MS} ms`, async ({ page }, info) => {
    await abrirProyectoDeEjemplo(page);
    const cuerpo = Array.from(
      { length: LINEAS },
      (_, i) => `% línea ${i + 1}: \\section{Sección ${i}} texto de ejemplo con $x_{${i}} \\leq \\sum_i y_i$ y más palabras para rellenar`,
    ).join('\n');
    await page.locator('input[type="file"][multiple]').setInputFiles({
      name: 'largo.tex',
      mimeType: 'text/plain',
      buffer: Buffer.from(cuerpo, 'utf8'),
    });
    await expect(page.getByRole('tab', { name: 'largo.tex' })).toHaveAttribute('aria-selected', 'true');
    await esperarEditor(page);
    await editorActivo(page).click();
    await page.keyboard.press('Control+Home');
    // A media altura del documento, donde CodeMirror tiene que mover más estado.
    for (let i = 0; i < 20; i++) await page.keyboard.press('PageDown');
    await page.evaluate(() => {
      const w = window as unknown as { __duraciones: number[] };
      w.__duraciones = [];
      new PerformanceObserver((lista) => {
        for (const e of lista.getEntries()) {
          if (e.name === 'keydown' || e.name === 'keypress' || e.name === 'keyup' || e.name === 'input') {
            w.__duraciones.push(e.duration);
          }
        }
      }).observe({ type: 'event', durationThreshold: 16, buffered: false } as PerformanceObserverInit);
    });

    for (let i = 0; i < 60; i++) {
      await page.keyboard.type('abc ');
      await page.waitForTimeout(25);
    }
    await page.waitForTimeout(300);
    const duraciones = await page.evaluate(() => (window as unknown as { __duraciones: number[] }).__duraciones);
    // El Event Timing solo informa de lo que dura 16 ms o más; las pulsaciones que no aparecen fueron más rápidas.
    const ordenadas = [...duraciones].sort((a, b) => a - b);
    const maximo = ordenadas.at(-1) ?? 0;
    const p75 = duraciones.length >= 60 * 0.25 ? (ordenadas[Math.floor(ordenadas.length * 0.75)] ?? 0) : 0;
    const resumen = `60 ráfagas de 4 teclas ('abc ') = 240 pulsaciones; eventos de entrada que tardaron 16 ms o más: ${duraciones.length}; máximo ${Math.round(maximo)} ms; p75 de esos ${Math.round(p75)} ms (los demás tardaron menos de 16 ms)`;
    info.annotations.push({ type: 'latencia', description: resumen });
    console.log(`[latencia editor, ${LINEAS} líneas] ${resumen}`);
    expect(maximo).toBeLessThan(LIMITE_MAXIMO_MS);
    expect(p75).toBeLessThan(LIMITE_P75_MS);
  });
});
