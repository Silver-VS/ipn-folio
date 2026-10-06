// SPDX-License-Identifier: AGPL-3.0-or-later
// Orquestador de compilación (sesión 06) con BusyTeX real en Chromium. Se salta sin activos (`npm run activos`);
// las pruebas que necesitan paquetes fuera de «basic» (español, glosarios, índices con nombre, nomencl) se saltan
// sin el espejo local (`npm run espejo:generar` y `npm run espejo:servir`).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { URL_ESPEJO, urlBanco } from './config';
import type { ResumenCompilacion } from './banco/banco';

const hayActivos = existsSync('public/busytex/busytex.wasm');
const hayEspejo = existsSync('espejo-local');

test.describe('orquestador de compilación', () => {
  test.skip(!hayActivos, 'No hay activos de BusyTeX en public/busytex/ (corre npm run activos).');
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  let contexto: BrowserContext;
  let pagina: Page;
  const peticiones: string[] = [];
  const medidas: Record<string, unknown> = {};

  test.beforeAll(async ({ browser }, info) => {
    test.skip(info.project.name !== 'escritorio', 'Solo escritorio.');
    contexto = await browser.newContext();
    pagina = await contexto.newPage();
    pagina.on('request', (p) => peticiones.push(p.url()));
    await pagina.goto(urlBanco(hayEspejo ? URL_ESPEJO : undefined));
    await pagina.waitForFunction(() => 'banco' in window);
    await pagina.evaluate(() => window.banco.iniciar());
  });

  test.afterAll(async () => {
    if (!contexto) return;
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/tiempos-orquestador.json', JSON.stringify(medidas, null, 2));
    console.log('Medidas del orquestador:', JSON.stringify(medidas));
    await contexto.close();
  });

  const compilar = (
    nombre: string,
    existentes: string[] = [],
    opciones: { reemplazos?: Record<string, string>; clave?: string } = {},
  ) =>
    pagina.evaluate(
      ([n, e, o]) =>
        window.banco.compilarFixture(
          n as string,
          e as string[],
          o as { reemplazos?: Record<string, string>; clave?: string },
        ),
      [nombre, existentes, opciones],
    ) as Promise<ResumenCompilacion>;

  const programas = (r: ResumenCompilacion) => r.pasos.map((p) => p.split('→')[0]);

  test('«con-indice» (propio): índice y nomenclatura, con el plan por archivos generados', async () => {
    const r = await compilar('con-indice', ['main.ind', 'main.nls']);
    medidas['conIndice1Ms'] = Math.round(r.msTotal);
    expect(r.exito, JSON.stringify(r)).toBe(true);
    expect(r.existe['main.ind']).toBe(true);
    expect(r.existe['main.nls']).toBe(true);
    expect(programas(r)).toEqual(['pdflatex', 'makeindex', 'makeindex', 'pdflatex']);
    expect(r.nombresPasos).toEqual(['primera', 'indice', 'nomenclatura', 'pasada']);
  });

  test('los eventos de paso dan «Paso n de m» en español', async () => {
    const r = await compilar('con-indice', [], { clave: 'otro' });
    expect(r.textosPasos).toEqual([
      // La estimación inicial no ve la nomenclatura (este fixture la escribe a mano) y se corrige al terminar la primera pasada.
      'Paso 1 de 3: primera pasada',
      'Paso 2 de 4: índice',
      'Paso 3 de 4: nomenclatura',
      'Paso 4 de 4: nueva pasada',
    ]);
  });

  test('«bibliografia»: BibTeX corre una vez y la segunda compilación salta las herramientas (caché)', async () => {
    const primera = await compilar('bibliografia', ['main.bbl']);
    medidas['bibliografia1Ms'] = Math.round(primera.msTotal);
    medidas['bibliografia1Pasos'] = primera.pasos;
    medidas['bibliografia1MsPorPaso'] = primera.msPorPaso;
    expect(primera.exito, JSON.stringify(primera)).toBe(true);
    expect(primera.existe['main.bbl']).toBe(true);
    expect(programas(primera)).toContain('bibtex8');
    expect(primera.cacheUsada).toBe(false);
    expect(primera.problemas.filter((p) => p.gravedad === 'error')).toEqual([]);
    // Las citas quedaron resueltas: ni «cita sin definir» ni «hace falta volver a compilar».
    const SIN_RESOLVER = [
      'cita-indefinida',
      'referencia-indefinida',
      'referencias-indefinidas',
      'repetir-pasada',
    ];
    expect(primera.problemas.filter((p) => SIN_RESOLVER.includes(p.codigo))).toEqual([]);

    // Solo cambió el texto: sin BibTeX y con una sola pasada; el .bbl de la corrida anterior se vuelve a montar.
    const principal = readFileSync('e2e/fixtures/bibliografia/main.tex', 'utf8');
    const segunda = await compilar('bibliografia', ['main.bbl'], {
      reemplazos: { 'main.tex': `${principal}\n% solo cambió el texto\n` },
    });
    medidas['bibliografia2Ms'] = Math.round(segunda.msTotal);
    medidas['bibliografia2Pasos'] = segunda.pasos;
    expect(segunda.exito, JSON.stringify(segunda)).toBe(true);
    expect(segunda.cacheUsada).toBe(true);
    expect(programas(segunda)).toEqual(['pdflatex']);
    expect(segunda.saltadas).toContain('bibliografia');
    expect(segunda.existe['main.bbl']).toBe(true);
    expect(segunda.problemas.filter((p) => p.gravedad === 'error')).toEqual([]);

    // Cambió el .bib: BibTeX vuelve a correr.
    const bib = readFileSync('e2e/fixtures/bibliografia/refs.bib', 'utf8');
    const tercera = await compilar('bibliografia', [], {
      reemplazos: { 'refs.bib': bib.replace('Un libro de prueba', 'Otro título de prueba') },
    });
    expect(tercera.exito, JSON.stringify(tercera)).toBe(true);
    expect(programas(tercera)).toContain('bibtex8');
    medidas['bibliografiaAhorroMs'] = Math.round(primera.msTotal - segunda.msTotal);
  });

  test('imagen faltante en un capítulo: problema con archivo y línea, y el PDF anterior se conserva', async () => {
    const buena = await compilar('capitulos', [], { clave: 'cap' });
    expect(buena.exito, JSON.stringify(buena)).toBe(true);
    medidas['capitulos1Ms'] = Math.round(buena.msTotal);
    medidas['capitulos1Pasos'] = buena.pasos;

    const mala = await compilar('capitulos', [], {
      clave: 'cap',
      reemplazos: {
        'capitulos/uno.tex':
          '\\chapter{Primer capítulo}\nTexto.\n\\includegraphics{imagenes/no-existe.png}\n',
      },
    });
    expect(mala.exito).toBe(false);
    expect(mala.pdfAnteriorConservado).toBe(true);
    expect(mala.motivo).toBe('fatal');
    const problema = mala.problemas.find((p) => p.codigo === 'archivo-faltante');
    expect(problema, JSON.stringify(mala.problemas)).toBeDefined();
    expect(problema?.archivo).toBe('capitulos/uno.tex');
    expect(problema?.linea).toBe(3);
    expect(problema?.titulo).toContain('imagenes/no-existe.png');

    const corregida = await compilar('capitulos', [], { clave: 'cap' });
    expect(corregida.exito, JSON.stringify(corregida)).toBe(true);
    expect(corregida.pdfAnteriorConservado).toBe(false);
  });

  test('«glosario»: produce el .gls (y la lista de acrónimos .acr)', async () => {
    test.skip(!hayEspejo, 'Sin espejo local (npm run espejo:generar).');
    const r = await compilar('glosario', ['main.glo', 'main.gls', 'main.acn', 'main.acr', 'main.ist']);
    medidas['glosario1Ms'] = Math.round(r.msTotal);
    medidas['glosarioPasos'] = r.pasos;
    expect(r.exito, JSON.stringify(r)).toBe(true);
    expect(r.existe['main.gls']).toBe(true);
    expect(r.existe['main.acr']).toBe(true);
    expect(programas(r).filter((p) => p === 'makeindex')).toHaveLength(2);
    expect(await pagina.evaluate(() => window.banco.leerTexto('main.gls'))).toContain('motor');
  });

  test('«varios-indices»: dos índices con nombre producen dos .ind', async () => {
    test.skip(!hayEspejo, 'Sin espejo local (npm run espejo:generar).');
    const r = await compilar('varios-indices', ['autores.idx', 'autores.ind', 'temas.idx', 'temas.ind']);
    medidas['variosIndices1Ms'] = Math.round(r.msTotal);
    medidas['variosIndicesPasos'] = r.pasos;
    expect(r.exito, JSON.stringify(r)).toBe(true);
    expect(r.existe['autores.ind']).toBe(true);
    expect(r.existe['temas.ind']).toBe(true);
    expect(await pagina.evaluate(() => window.banco.leerTexto('autores.ind'))).toContain('Autora');
  });

  test('«nomenclatura» con el paquete real nomencl: produce el .nls', async () => {
    test.skip(!hayEspejo, 'Sin espejo local (npm run espejo:generar).');
    const r = await compilar('nomenclatura', ['main.nlo', 'main.nls']);
    medidas['nomenclatura1Ms'] = Math.round(r.msTotal);
    medidas['nomenclaturaPasos'] = r.pasos;
    expect(r.exito, JSON.stringify(r)).toBe(true);
    expect(r.existe['main.nls']).toBe(true);
  });

  test('«espanol» con el espejo local: PDF y sin pedir texlive-recommended ni texlive-extra', async () => {
    test.skip(!hayEspejo, 'Sin espejo local (npm run espejo:generar).');
    const r = await compilar('espanol');
    medidas['espanol1Ms'] = Math.round(r.msTotal);
    expect(r.exito, JSON.stringify(r)).toBe(true);
    expect(r.inicioPdf).toBe('%PDF-');
    expect(r.problemas.filter((p) => p.gravedad === 'error')).toEqual([]);
    expect(peticiones.filter((u) => /texlive-(recommended|extra)/.test(u))).toEqual([]);
    // `spanish.ldf` salió del espejo, no de los datos de «basic».
    const aEspejo = peticiones.filter((u) => u.startsWith(URL_ESPEJO));
    expect(aEspejo.some((u) => /spanish\.ldf/.test(u))).toBe(true);
  });

  test('cancelar durante una compilación termina con cancelado y la siguiente funciona', async () => {
    const c = await pagina.evaluate(() => window.banco.cancelarEnCurso('con-indice', 100));
    medidas['cancelacionMs'] = c.ms;
    expect(c.cancelada).toBe(true);
    expect(c.ms).toBeLessThan(2000);
    const r = await compilar('hola');
    expect(r.exito, JSON.stringify(r)).toBe(true);
  });
});
