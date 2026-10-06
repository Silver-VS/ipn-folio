// SPDX-License-Identifier: AGPL-3.0-or-later
// Prueba MANUAL con una plantilla grande que vive FUERA del repositorio (p. ej. UpiiTeXis, plantillas-locales/).
// Solo corre si se definen variables de entorno; la plantilla y su PDF nunca se suben.
//
//   FOLIO_PLANTILLA=<carpeta>            carpeta del proyecto (obligatoria; si falta, se salta)
//   FOLIO_PRINCIPAL=Principal.tex        archivo principal (por omisión Principal.tex)
//   FOLIO_PAGINAS=58                     páginas esperadas (opcional)
//   FOLIO_ESPEJO=<URL>                   espejo de TeX Live con CORS (opcional; sin él faltan paquetes fuera de «basic»)
//
//   npx playwright test e2e/manual-plantilla.spec.ts --project=escritorio
import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { urlBanco } from './config';
import type { ResumenCompilacion } from './banco/banco';

const plantilla = process.env['FOLIO_PLANTILLA'];
const principal = process.env['FOLIO_PRINCIPAL'] ?? 'Principal.tex';
const espejo = process.env['FOLIO_ESPEJO'];
const paginas = process.env['FOLIO_PAGINAS'];

test.describe('plantilla grande (manual)', () => {
  test.skip(
    !plantilla || !existsSync(plantilla) || !existsSync('public/busytex/busytex.wasm'),
    'Define FOLIO_PLANTILLA y corre npm run activos.',
  );
  test.describe.configure({ timeout: 600_000 });

  test('compila dos veces y mide tiempos', async ({ browser }, info) => {
    test.skip(info.project.name !== 'escritorio', 'Solo escritorio.');
    const contexto = await browser.newContext();
    const pagina = await contexto.newPage();
    const peticiones: string[] = [];
    pagina.on('request', (p) => peticiones.push(p.url()));
    await pagina.goto(urlBanco(espejo));
    await pagina.waitForFunction(() => 'banco' in window);
    await pagina.setInputFiles('#carpeta', plantilla!);

    const inicio = await pagina.evaluate(() => window.banco.iniciar());
    const compilar = (clave = 'carpeta') =>
      pagina.evaluate(
        ([p, c]) => window.banco.compilarCarpeta(p as string, ['Principal.nls', 'Principal.ind'], c),
        [principal, clave],
      ) as Promise<ResumenCompilacion>;
    const primera = await compilar();
    const segunda = await compilar();
    // Sin caché (otra clave) pero con los archivos del espejo ya pedidos: separa el costo de las pasadas del de la red.
    const sinCache = await compilar('sin-cache');
    const resumen = {
      inicioEnFrioMs: inicio.ms,
      primeraMs: Math.round(primera.msTotal),
      segundaMs: Math.round(segunda.msTotal),
      segundaPasos: segunda.pasos,
      segundaSaltadas: segunda.saltadas,
      sinCacheMs: Math.round(sinCache.msTotal),
      sinCacheMsPorPaso: sinCache.msPorPaso,
      codigosDeProblemas: primera.problemas.map((p) => p.codigo),
      paginas: primera.paginas,
      pasos: primera.pasos,
      msPorPaso: primera.msPorPaso,
      bytesPdf: primera.bytesPdf,
      existe: primera.existe,
      errores: primera.errores,
      datosPedidos: [...new Set(peticiones.filter((u) => /texlive-[a-z]+\.data$/.test(u)))],
      peticionesAlEspejo: espejo ? peticiones.filter((u) => u.startsWith(espejo)).length : 0,
    };
    console.log('Resumen de la plantilla:', JSON.stringify(resumen));
    expect(primera.exito, JSON.stringify(resumen)).toBe(true);
    expect(primera.inicioPdf).toBe('%PDF-');
    if (paginas) expect(primera.paginas).toBe(Number(paginas));
    expect(segunda.exito).toBe(true);
    await contexto.close();
  });
});
