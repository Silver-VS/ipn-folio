// SPDX-License-Identifier: AGPL-3.0-or-later
// Compilación real con BusyTeX en Chromium. Se salta si no existen los activos (`npm run activos`),
// por ejemplo en la CI. Usa el banco `e2e/banco` empaquetado con e2e/banco/vite.config.ts (puerto en e2e/config.ts).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { urlBanco } from './config';
import type { ResumenCompilacion } from './banco/banco';

const hayActivos = existsSync('public/busytex/busytex.wasm');
const BANCO = urlBanco();

test.describe('compilación con BusyTeX', () => {
  test.skip(!hayActivos, 'No hay activos de BusyTeX en public/busytex/ (corre npm run activos).');
  // Un solo perfil: el motor pesa ~128 MB y las pruebas comparten la misma página (caché de IndexedDB).
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  let contexto: BrowserContext;
  let pagina: Page;
  const peticiones: string[] = [];
  const tiempos: Record<string, unknown> = {};

  test.beforeAll(async ({ browser }, info) => {
    test.skip(info.project.name !== 'escritorio', 'Solo escritorio.');
    contexto = await browser.newContext();
    pagina = await contexto.newPage();
    pagina.on('request', (p) => peticiones.push(p.url()));
    await pagina.goto(BANCO);
    await pagina.waitForFunction(() => 'banco' in window);
  });

  test.afterAll(async () => {
    if (!contexto) return;
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/tiempos-compilacion.json', JSON.stringify(tiempos, null, 2));
    console.log('Tiempos de compilación:', JSON.stringify(tiempos));
    await contexto.close();
  });

  const compilar = (nombre: string, existentes: string[] = []) =>
    pagina.evaluate(
      ([n, e]) => window.banco.compilarFixture(n as string, e as string[]),
      [nombre, existentes],
    ) as Promise<ResumenCompilacion>;

  test('inicio en frío y compilación de «hola»: PDF válido', async () => {
    const inicio = await pagina.evaluate(() => window.banco.iniciar());
    tiempos['inicioEnFrioMs'] = inicio.ms;
    expect(inicio.applets).toContain('pdftex');

    const r = await compilar('hola');
    tiempos['hola1Ms'] = Math.round(r.msTotal);
    expect(r.exito, JSON.stringify(r)).toBe(true);
    expect(r.inicioPdf).toBe('%PDF-');
    expect(r.bytesPdf).toBeGreaterThan(1024);
    expect(r.pasos[0]).toBe('pdflatex→0');
  });

  test('progreso de la primera descarga: eventos crecientes hasta el total (wasm + datos)', async () => {
    const eventos = await pagina.evaluate(() => window.banco.progreso());
    expect(eventos.length).toBeGreaterThan(10);
    for (let i = 1; i < eventos.length; i++) {
      expect(eventos[i]![0]).toBeGreaterThanOrEqual(eventos[i - 1]![0]);
      expect(eventos[i]![0]).toBeLessThanOrEqual(eventos[i]![1]);
    }
    // El total cubre busytex.wasm y texlive-basic.data, no solo uno de los dos.
    const activos = JSON.parse(readFileSync('public/busytex/activos.json', 'utf8')) as {
      archivos: Array<{ nombre: string; bytes: number }>;
    };
    const bytes = (n: string) => activos.archivos.find((a) => a.nombre === n)!.bytes;
    const esperado = bytes('busytex.wasm') + bytes('texlive-basic.data');
    const ultimo = eventos.at(-1)!;
    expect(ultimo[0]).toBe(ultimo[1]);
    expect(ultimo[1]).toBe(esperado);
    // Hubo avance durante la descarga del wasm (antes de empezar los datos) y después.
    const bytesWasm = bytes('busytex.wasm');
    expect(eventos.some(([c]) => c > 0 && c < bytesWasm)).toBe(true);
    expect(eventos.some(([c]) => c > bytesWasm && c < esperado)).toBe(true);
    tiempos['eventosProgreso'] = eventos.length;
  });

  test('segunda compilación de «hola» en menos de 15 s', async () => {
    const r = await compilar('hola');
    tiempos['hola2Ms'] = Math.round(r.msTotal);
    expect(r.exito, JSON.stringify(r)).toBe(true);
    expect(r.msTotal).toBeLessThan(15_000);
  });

  test('«con-indice»: PDF, índice y nomenclatura (.nls)', async () => {
    const r1 = await compilar('con-indice', ['main.idx', 'main.ind', 'main.nlo', 'main.nls']);
    tiempos['conIndice1Ms'] = Math.round(r1.msTotal);
    tiempos['conIndicePasos'] = r1.pasos;
    expect(r1.exito, JSON.stringify(r1)).toBe(true);
    expect(r1.inicioPdf).toBe('%PDF-');
    expect(r1.bytesPdf).toBeGreaterThan(1024);
    expect(r1.existe['main.ind']).toBe(true);
    expect(r1.existe['main.nls']).toBe(true);
    expect(r1.pasos.map((p) => p.split('→')[0])).toEqual([
      'pdflatex',
      'makeindex',
      'makeindex',
      'pdflatex',
      'pdflatex',
    ]);

    const r2 = await compilar('con-indice');
    tiempos['conIndice2Ms'] = Math.round(r2.msTotal);
    expect(r2.exito, JSON.stringify(r2)).toBe(true);
    expect(r2.msTotal).toBeLessThan(15_000);
  });

  test('solo se piden los paquetes de datos «basic»', async () => {
    const datos = peticiones
      .filter((u) => /texlive-[a-z]+\.(js|data)$/.test(u))
      .map((u) => u.split('/').pop());
    expect(new Set(datos)).toEqual(new Set(['texlive-basic.js', 'texlive-basic.data']));
    expect(peticiones.filter((u) => /texlive-(recommended|extra)/.test(u))).toEqual([]);
    // Sin aislamiento entre orígenes (D5): la página no debe necesitar COOP/COEP.
    expect(await pagina.evaluate(() => crossOriginIsolated)).toBe(false);
  });

  test('la interfaz no se congela durante la compilación (temporizador de 50 ms)', async () => {
    const { resumen, mayorRetraso } = await pagina.evaluate(() =>
      window.banco.compilarMidiendoBloqueo('con-indice'),
    );
    tiempos['mayorRetrasoDelTemporizadorMs'] = mayorRetraso;
    expect(resumen.exito).toBe(true);
    expect(mayorRetraso).toBeLessThan(200);
  });

  test('cancelar detiene el worker en menos de 1 s y la siguiente compilación funciona', async () => {
    const cancelacion = await pagina.evaluate(() => window.banco.cancelarEnCurso('con-indice', 150));
    tiempos['cancelacionMs'] = cancelacion.ms;
    expect(cancelacion.cancelada).toBe(true);
    expect(cancelacion.ms).toBeLessThan(1000);

    const t0 = Date.now();
    const r = await compilar('hola');
    tiempos['hola1DespuesDeCancelarMs'] = Date.now() - t0;
    expect(r.exito, JSON.stringify(r)).toBe(true);
    expect(r.inicioPdf).toBe('%PDF-');
  });
});
