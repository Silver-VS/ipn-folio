// SPDX-License-Identifier: AGPL-3.0-or-later
// Service worker del producto con BusyTeX real, en el banco de compilación (sesión 07):
//  - riesgo del plan: ¿el XHR SÍNCRONO de un worker pasa por el service worker? (plan A / plan B del espejo)
//  - instalación de «Documentos LaTeX» con el instalador real, cachés resultantes y tamaños medidos
//  - sin conexión: recargar el banco y compilar «hola»
//  - quitar LaTeX libera cachés e IndexedDB sin tocar proyectos
// Se salta sin los activos de BusyTeX (`npm run activos`). Solo escritorio: el motor pesa ~128 MB.
import { get } from 'node:http';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { crearServidor } from '../scripts/espejo/servir.mjs';
import type { ResumenCompilacion } from './banco/banco';
import { PUERTO_ESPEJO, TAMANOS, URL_ESPEJO, urlBanco } from './config';

const hayActivos = existsSync('public/busytex/busytex.wasm');
const hayEspejo = existsSync('espejo-local');
const BANCO = urlBanco();

/** Pide el archivo aceptando gzip/br y cuenta los bytes tal como llegan por la red (antes de descomprimir). */
function descargarContandoBytes(
  url: string,
): Promise<{ cuerpo: number; enRed: number; codificacion: string }> {
  return new Promise((resolver, rechazar) => {
    get(url, { headers: { 'Accept-Encoding': 'gzip, br' } }, (res) => {
      const trozos: Buffer[] = [];
      res.on('data', (t: Buffer) => trozos.push(t));
      res.on('error', rechazar);
      res.on('end', () => {
        const crudo = Buffer.concat(trozos);
        const codificacion = String(res.headers['content-encoding'] ?? 'ninguna');
        const cuerpo =
          codificacion === 'gzip'
            ? gunzipSync(crudo).byteLength
            : codificacion === 'br'
              ? brotliDecompressSync(crudo).byteLength
              : crudo.byteLength;
        resolver({ cuerpo, enRed: crudo.byteLength, codificacion });
      });
    }).on('error', rechazar);
  });
}

test.describe('service worker con BusyTeX real', () => {
  test.skip(!hayActivos, 'No hay activos de BusyTeX en public/busytex/ (corre npm run activos).');
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let contexto: BrowserContext;
  let pagina: Page;
  let espejoPropio: Server | undefined;
  let carpetaEspejo: string | undefined;
  const medidas: Record<string, unknown> = {};

  test.beforeAll(async ({ browser }, info) => {
    test.skip(info.project.name !== 'escritorio', 'Solo escritorio.');
    if (!hayEspejo) {
      // Espejo mínimo, con la misma implementación del espejo real (CORS abierto, 404 verdaderos).
      carpetaEspejo = mkdtempSync(join(tmpdir(), 'folio-espejo-'));
      mkdirSync(join(carpetaEspejo, '0'), { recursive: true });
      writeFileSync(join(carpetaEspejo, '0', 'prueba-sw.txt'), 'hola desde el espejo de prueba\n');
      espejoPropio = crearServidor(carpetaEspejo);
      await new Promise<void>((resolver, rechazar) => {
        espejoPropio?.once('error', rechazar);
        espejoPropio?.listen(PUERTO_ESPEJO, '127.0.0.1', () => resolver());
      });
    }
    contexto = await browser.newContext();
    pagina = await contexto.newPage();
    await pagina.goto(BANCO);
    await pagina.waitForFunction(() => 'banco' in window);
    await pagina.evaluate(() => window.banco.registrarSW());
  });

  test.afterAll(async () => {
    if (contexto) {
      mkdirSync('test-results', { recursive: true });
      writeFileSync('test-results/medidas-pwa.json', JSON.stringify(medidas, null, 2));
      console.log('Medidas PWA:', JSON.stringify(medidas));
      await contexto.close();
    }
    await new Promise<void>((resolver) => (espejoPropio ? espejoPropio.close(() => resolver()) : resolver()));
    if (carpetaEspejo) rmSync(carpetaEspejo, { recursive: true, force: true });
  });

  const xhr = (url: string) => pagina.evaluate((u) => window.banco.xhrSincronoDesdeWorker(u), url);
  const cachesFolio = () => pagina.evaluate(() => window.banco.cachesFolio());

  test('plan A: el XHR síncrono de un worker pasa por el service worker (y se guardan 200 y 404)', async () => {
    test.skip(
      hayEspejo,
      'Con el espejo real, el archivo de prueba no existe; el caso 200 lo cubre «espanol».',
    );
    const ok = `${URL_ESPEJO}/0/prueba-sw.txt`;
    const falta = `${URL_ESPEJO}/0/no-existe-sw.txt`;
    expect(await xhr(ok)).toEqual({ estado: 200, tamano: 'hola desde el espejo de prueba\n'.length });
    expect((await xhr(falta)).estado).toBe(404);

    // Prueba de que pasó por el SW: sus respuestas quedaron en folio-espejo-v1.
    const guardado = (await cachesFolio())['folio-espejo-v1'] ?? [];
    expect(guardado).toContain('/0/prueba-sw.txt');
    expect(guardado).toContain('/0/no-existe-sw.txt');
    medidas['espejoXhrSincronoPasaPorSW'] = true;

    // Sin la red del espejo (servidor cerrado y navegador sin conexión) responde la caché del service worker.
    await new Promise<void>((resolver) => espejoPropio?.close(() => resolver()));
    espejoPropio = undefined;
    await contexto.setOffline(true);
    expect((await xhr(ok)).estado).toBe(200);
    expect((await xhr(falta)).estado).toBe(404);
    await contexto.setOffline(false);
  });

  test('instalar «Documentos LaTeX»: cachés, tamaños y nada de texlive-basic.data en el service worker', async () => {
    const antes = await cachesFolio();
    expect(Object.keys(antes).filter((n) => n.startsWith('folio-busytex-'))).toEqual([]);

    const r = await pagina.evaluate(() => window.banco.instalarLatex());
    medidas['instalacionMs'] = r.ms;
    medidas['fases'] = r.fases;
    expect(r.estado.estado).toBe('instalada');
    expect(r.fases).toEqual(['archivos', 'paquetes']);
    expect(r.ultimo?.cargados).toBe(r.ultimo?.total);

    const despues = await cachesFolio();
    const busytex = despues['folio-busytex-1.4.0'] ?? [];
    expect([...busytex].sort()).toEqual(
      ['busytex.js', 'busytex.wasm', 'busytex_pipeline.js', 'texlive-basic.js', 'texmf.cnf']
        .map((n) => `/busytex/${n}`)
        .sort(),
    );
    // Criterio 8: el paquete de datos no está en ninguna caché del service worker; Emscripten lo guarda en IndexedDB.
    for (const [nombre, rutas] of Object.entries(despues)) {
      expect(
        rutas.filter((u) => u.endsWith('.data')),
        nombre,
      ).toEqual([]);
    }
    expect(await pagina.evaluate(() => window.banco.basesIndexedDb())).toContain('EM_PRELOAD_CACHE');

    medidas['usoBytesTrasInstalar'] = r.usoBytes;
    medidas['persistente'] = r.persistente;
  });

  test('tamaños medidos de cada archivo: sin comprimir y lo que viaja con compresión', async () => {
    // Bytes tal como llegan por la red a un cliente que acepta gzip/br. `vite preview` solo comprime los tipos de
    // texto (no .wasm ni .data); el hospedaje real puede variar, así que son una referencia.
    const raiz = new URL(BANCO).origin;
    const archivos = [
      'busytex.js',
      'busytex.wasm',
      'busytex_pipeline.js',
      'texmf.cnf',
      'texlive-basic.js',
      'texlive-basic.data',
    ];
    let sinComprimir = 0;
    let viaja = 0;
    const detalle: Record<string, { sinComprimir: number; viaja: number; codificacion: string }> = {};
    for (const nombre of archivos) {
      const { cuerpo, enRed, codificacion } = await descargarContandoBytes(`${raiz}/busytex/${nombre}`);
      detalle[nombre] = { sinComprimir: cuerpo, viaja: enRed, codificacion };
      sinComprimir += cuerpo;
      viaja += enRed;
    }
    medidas['tamanosPorArchivo'] = detalle;
    medidas['sinComprimirBytes'] = sinComprimir;
    medidas['viajaConCompresionBytes'] = viaja;
    // Coincide con el manifiesto que alimenta {megas} (criterio 4: ±1 MB).
    expect(Math.abs(sinComprimir / 1e6 - TAMANOS.latex.bytes / 1e6)).toBeLessThan(1);
    expect(TAMANOS.latex.megas).toBe(Math.round(sinComprimir / 1e6));
  });

  test('sin conexión: se recarga el banco y se compila «hola» con lo instalado', async () => {
    await pagina.evaluate(() => window.banco.proyectos('Proyecto de prueba'));
    await contexto.setOffline(true);
    await pagina.reload();
    await pagina.waitForFunction(() => 'banco' in window);
    const t0 = Date.now();
    const r = (await pagina.evaluate(() => window.banco.compilarFixture('hola'))) as ResumenCompilacion;
    medidas['holaSinConexionMs'] = Date.now() - t0;
    expect(r.exito, JSON.stringify(r)).toBe(true);
    expect(r.inicioPdf).toBe('%PDF-');
    await contexto.setOffline(false);
  });

  test('quitar LaTeX borra las cachés y el IndexedDB de paquetes; los proyectos siguen intactos', async () => {
    const estado = await pagina.evaluate(() => window.banco.quitarLatex());
    expect(estado.estado).toBe('no-instalada');
    const nombres = Object.keys(await cachesFolio());
    expect(nombres.filter((n) => n.startsWith('folio-busytex-') || n === 'folio-espejo-v1')).toEqual([]);
    expect(await pagina.evaluate(() => window.banco.basesIndexedDb())).not.toContain('EM_PRELOAD_CACHE');
    expect(await pagina.evaluate(() => window.banco.proyectos())).toContain('Proyecto de prueba');
  });
});
