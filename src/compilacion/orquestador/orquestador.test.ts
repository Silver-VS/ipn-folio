// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ArchivoProyecto } from '../tipos';
import { crearMotorFalso } from './motor-falso';
import type { Escenario } from './motor-falso';
import { Orquestador } from './orquestador';
import type { EventoOrquestador } from './orquestador';

const logReal = (nombre: string) =>
  readFileSync(new URL(`../bitacora/fixtures/${nombre}`, import.meta.url), 'utf8');

const proyecto = (tex: string, extra: ArchivoProyecto[] = []): ArchivoProyecto[] => [
  { ruta: 'main.tex', contenido: tex },
  ...extra,
];
const AUX_BIB = String.raw`\relax
\citation{a}
\bibstyle{plain}
\bibdata{refs}
`;
const AUX_BIB_RESUELTO = AUX_BIB + String.raw`\bibcite{a}{1}` + '\n';
const RERUN = 'LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.';

function preparar(escenario: Escenario = {}) {
  const falso = crearMotorFalso(escenario);
  const eventos: EventoOrquestador[] = [];
  const orquestador = new Orquestador(falso.motor, { alEvento: (e) => eventos.push(e) });
  return { ...falso, eventos, orquestador };
}

describe('escenarios del plan (motor falso, sin WASM)', () => {
  it('documento simple sin referencias: una sola pasada', async () => {
    const { orquestador, programas } = preparar({ generar: () => ({ 'main.aux': '\\relax \n' }) });
    const r = await orquestador.compilar({
      archivos: proyecto('\\documentclass{article}'),
      principal: 'main.tex',
    });
    expect(programas()).toEqual(['pdflatex']);
    expect(r.exito).toBe(true);
    expect(r.motivo).toBe('completo');
    expect(r.pdf?.byteLength).toBeGreaterThan(0);
  });

  it('con bibliografía: TeX, BibTeX, TeX, TeX', async () => {
    const { orquestador, programas, comandos } = preparar({
      generar: (cmd, n) =>
        cmd[0] === 'pdflatex' ? { 'main.aux': n === 1 ? AUX_BIB : AUX_BIB_RESUELTO } : {},
      logTex: (n) => (n === 2 ? RERUN : ''),
    });
    const r = await orquestador.compilar({
      archivos: proyecto('\\bibliography{refs}', [{ ruta: 'refs.bib', contenido: '@book{a,title={x}}' }]),
      principal: 'main.tex',
    });
    expect(programas()).toEqual(['pdflatex', 'bibtex8', 'pdflatex', 'pdflatex']);
    expect(comandos[1]).toEqual(['bibtex8', '--8bit', 'main.aux']);
    expect(r.exito).toBe(true);
    expect(r.pasos.map((p) => p.nombre)).toEqual(['primera', 'bibliografia', 'pasada', 'final']);
  });

  it('con índice y nomenclatura: una herramienta por archivo y una pasada final', async () => {
    const { orquestador, programas, comandos } = preparar({
      generar: (cmd) =>
        cmd[0] === 'pdflatex'
          ? {
              'main.aux': '\\relax \n',
              'main.idx': '\\indexentry{motor}{1}\n',
              'main.nlo': '\\nomentry{v}{1}\n',
            }
          : {},
    });
    const r = await orquestador.compilar({ archivos: proyecto('\\makeindex'), principal: 'main.tex' });
    expect(programas()).toEqual(['pdflatex', 'makeindex', 'makeindex', 'pdflatex']);
    expect(comandos[1]).toEqual(['makeindex', 'main.idx']);
    expect(comandos[2]).toEqual([
      'makeindex',
      'main.nlo',
      '-s',
      'nomencl.ist',
      '-t',
      'main.nlg',
      '-o',
      'main.nls',
    ]);
    expect(r.exito).toBe(true);
  });

  it('con glosario y acrónimos: makeindex con el estilo .ist que escribe TeX', async () => {
    const { orquestador, comandos } = preparar({
      generar: (cmd) =>
        cmd[0] === 'pdflatex'
          ? {
              'main.glo': '\\glossaryentry{a}{1}\n',
              'main.acn': '\\glossaryentry{b}{1}\n',
              'main.ist': 'keyword "\\\\glossaryentry"\n',
            }
          : {},
    });
    await orquestador.compilar({ archivos: proyecto('\\makeglossaries'), principal: 'main.tex' });
    expect(comandos.slice(1, 3)).toEqual([
      ['makeindex', '-s', 'main.ist', '-t', 'main.glg', '-o', 'main.gls', 'main.glo'],
      ['makeindex', '-s', 'main.ist', '-t', 'main.alg', '-o', 'main.acr', 'main.acn'],
    ]);
    expect(comandos.map((c) => c[0])).toEqual(['pdflatex', 'makeindex', 'makeindex', 'pdflatex']);
  });

  it('sin el estilo .ist no se arma el glosario', async () => {
    const { orquestador, programas } = preparar({
      generar: (cmd) => (cmd[0] === 'pdflatex' ? { 'main.glo': '\\glossaryentry{a}{1}\n' } : {}),
    });
    await orquestador.compilar({ archivos: proyecto('\\makeglossaries'), principal: 'main.tex' });
    expect(programas()).toEqual(['pdflatex']);
  });

  it('varios índices de imakeidx: uno por nombre', async () => {
    const { orquestador, comandos } = preparar({
      generar: (cmd) =>
        cmd[0] === 'pdflatex'
          ? { 'main.idx': 'x\n', 'autores.idx': '\\indexentry{a}{1}\n', 'temas.idx': '\\indexentry{b}{1}\n' }
          : {},
    });
    await orquestador.compilar({
      archivos: proyecto(
        '\\usepackage{imakeidx}\n\\makeindex\n\\makeindex[name=autores]\n\\makeindex[name=temas]',
      ),
      principal: 'main.tex',
    });
    expect(comandos.slice(1, 4)).toEqual([
      ['makeindex', 'main.idx'],
      ['makeindex', 'autores.idx'],
      ['makeindex', 'temas.idx'],
    ]);
  });

  it('con «Rerun» persistente corta en 5 pasadas y avisa', async () => {
    const { orquestador, programas } = preparar({ logTex: () => RERUN });
    const r = await orquestador.compilar({
      archivos: proyecto('\\documentclass{article}'),
      principal: 'main.tex',
    });
    expect(programas()).toEqual(Array(5).fill('pdflatex'));
    expect(r.motivo).toBe('limite');
    expect(r.exito).toBe(true);
    expect(r.problemas.some((p) => p.codigo === 'repetir-pasada')).toBe(true);
  });

  it('con un fatal en la primera pasada se detiene sin PDF', async () => {
    const { orquestador, programas } = preparar({
      codigo: () => 1,
      logTex: () => 'Fatal error occurred, no output PDF file produced!',
    });
    const r = await orquestador.compilar({
      archivos: proyecto('\\documentclass{article}'),
      principal: 'main.tex',
    });
    expect(programas()).toEqual(['pdflatex']);
    expect(r.exito).toBe(false);
    expect(r.pdf).toBeNull();
    expect(r.pdfAnteriorConservado).toBe(false);
    expect(r.motivo).toBe('fatal');
  });

  it('un índice general nuevo (toc) pide otra pasada que lo muestre', async () => {
    const { orquestador, programas } = preparar({
      generar: (cmd) => (cmd[0] === 'pdflatex' ? { 'main.toc': '\\contentsline{section}{A}{1}\n' } : {}),
    });
    // La primera pasada escribe el toc (antes no había); la segunda lo imprime y el toc ya no cambia.
    await orquestador.compilar({ archivos: proyecto('\\tableofcontents'), principal: 'main.tex' });
    expect(programas()).toEqual(['pdflatex', 'pdflatex']);
  });
});

describe('errores, PDF anterior y cancelación', () => {
  it('una imagen faltante en un capítulo da archivo y línea y conserva el PDF anterior', async () => {
    const entrada = {
      archivos: proyecto('\include{capitulos/uno}', [{ ruta: 'capitulos/uno.tex', contenido: 'x' }]),
      principal: 'main.tex',
    };
    // Primera compilación buena; la segunda falla con la bitácora real de una imagen faltante.
    const mixto = preparar({
      codigo: (_cmd, n) => (n === 1 ? 0 : 1),
      logTex: (n) => (n === 1 ? '' : logReal('real-img.log')),
    });
    expect((await mixto.orquestador.compilar(entrada)).exito).toBe(true);
    const fallida = await mixto.orquestador.compilar(entrada);
    expect(fallida.exito).toBe(false);
    expect(fallida.pdfAnteriorConservado).toBe(true);
    expect(fallida.pdf).toBeNull();
    const problema = fallida.problemas.find((p) => p.codigo === 'archivo-faltante');
    expect(problema?.archivo).toBe('img.tex');
    expect(problema?.linea).toBe(4);
    expect(mixto.orquestador.pdfAnterior?.byteLength).toBeGreaterThan(0);
  });

  it('cancelar termina con cancelado: true y sin problemas inventados', async () => {
    const { orquestador, bloquear, eventos } = preparar();
    bloquear();
    const compilacion = orquestador.compilar({ archivos: proyecto('x'), principal: 'main.tex' });
    await new Promise((r) => setTimeout(r, 5));
    orquestador.cancelar();
    const r = await compilacion;
    expect(r.cancelado).toBe(true);
    expect(r.exito).toBe(false);
    expect(r.problemas).toEqual([]);
    expect(eventos.at(-1)).toMatchObject({ tipo: 'fin', cancelado: true });
  });

  it('un fallo del motor produce un problema en español con la acción a seguir', async () => {
    const { orquestador, motor } = preparar();
    motor.ejecutar = async () => {
      const { ErrorMotor } = await import('../motor');
      throw new ErrorMotor('abortado', 'RuntimeError: memory access out of bounds');
    };
    const r = await orquestador.compilar({ archivos: proyecto('x'), principal: 'main.tex' });
    expect(r.exito).toBe(false);
    expect(r.motivo).toBe('motor');
    const p = r.problemas.find((x) => x.codigo === 'motor-detenido');
    expect(p?.accion).toMatch(/vuelve a compilar/i);
  });

  it('con biblatex y Biber avisa en español y sugiere BibTeX', async () => {
    const { orquestador, programas } = preparar();
    const r = await orquestador.compilar({
      archivos: proyecto('\\usepackage[style=apa]{biblatex}\n\\addbibresource{refs.bib}'),
      principal: 'main.tex',
    });
    expect(programas()).toEqual(['pdflatex']);
    expect(r.problemas.find((p) => p.codigo === 'biber-no-soportado')?.accion).toMatch(/bibtex/);
  });

  it('avisa de los campos por llenar de WinEdt sin bloquear la compilación', async () => {
    const { orquestador } = preparar();
    const r = await orquestador.compilar({
      archivos: proyecto('x', [{ ruta: 'XBiblioteca.bib', contenido: '@BOOK{molde,\n  title = {\x7f},\n}' }]),
      principal: 'main.tex',
    });
    expect(r.exito).toBe(true);
    expect(r.problemas[0]).toMatchObject({
      codigo: 'campos-por-llenar',
      archivo: 'XBiblioteca.bib',
      linea: 1,
    });
  });

  it('la ruta de los problemas incluye la carpeta del principal', async () => {
    const { orquestador } = preparar({
      codigo: () => 1,
      logTex: () => logReal('real-img.log'),
    });
    const r = await orquestador.compilar({
      archivos: [{ ruta: 'tesis/main.tex', contenido: 'x' }],
      principal: 'tesis/main.tex',
    });
    expect(r.problemas.find((p) => p.codigo === 'archivo-faltante')?.archivo).toBe('tesis/img.tex');
  });
});

describe('eventos', () => {
  it('emite inicio, pasos «Paso n de m» en español y fin', async () => {
    const { orquestador, eventos } = preparar({
      generar: (cmd, n) =>
        cmd[0] === 'pdflatex' ? { 'main.aux': n === 1 ? AUX_BIB : AUX_BIB_RESUELTO } : {},
      logTex: (n) => (n === 2 ? RERUN : ''),
    });
    await orquestador.compilar({
      archivos: proyecto('\\bibliography{refs}', [{ ruta: 'refs.bib', contenido: '@book{a}' }]),
      principal: 'main.tex',
    });
    expect(eventos[0]).toEqual({ tipo: 'inicio' });
    const pasos = eventos.filter((e) => e.tipo === 'paso');
    expect(pasos.map((p) => p.texto)).toEqual([
      'Paso 1 de 4: primera pasada',
      'Paso 2 de 4: bibliografía',
      'Paso 3 de 4: pasada intermedia',
      'Paso 4 de 4: pasada final',
    ]);
    expect(eventos.at(-1)).toMatchObject({ tipo: 'fin', exito: true, pdfAnteriorConservado: false });
  });
});

describe('caché entre compilaciones', () => {
  const bib = [{ ruta: 'refs.bib', contenido: '@book{a,title={x}}' }];
  const escenario: Escenario = {
    generar: (cmd, n) => {
      if (cmd[0] === 'bibtex8') return { 'main.bbl': '\\begin{thebibliography}{1}\\end{thebibliography}' };
      // Con el .bbl y el .aux de la corrida anterior montados, las citas ya salen resueltas.
      return cmd[0] === 'pdflatex' ? { 'main.aux': n <= 2 ? AUX_BIB : AUX_BIB_RESUELTO } : {};
    },
    logTex: (n) => (n === 2 ? RERUN : ''),
  };

  it('si solo cambió el texto, no repite BibTeX ni las pasadas extra', async () => {
    const { orquestador, programas, montajes } = preparar({
      generar: (cmd) =>
        cmd[0] === 'bibtex8'
          ? { 'main.bbl': 'bbl' }
          : cmd[0] === 'pdflatex'
            ? { 'main.aux': AUX_BIB_RESUELTO }
            : {},
      logTex: () => '',
    });
    const entrada = (texto: string) => ({ archivos: proyecto(texto, bib), principal: 'main.tex' });
    const primera = await orquestador.compilar(entrada('\\bibliography{refs} uno'));
    const tras1 = programas().length;
    expect(primera.cacheUsada).toBe(false);
    expect(programas().slice(0, tras1)).toContain('bibtex8');

    const segunda = await orquestador.compilar(entrada('\\bibliography{refs} dos'));
    expect(segunda.cacheUsada).toBe(true);
    expect(programas().slice(tras1)).toEqual(['pdflatex']);
    expect(segunda.saltadas).toEqual(['bibliografia']);
    // Los archivos generados de la corrida anterior se vuelven a montar.
    const montados = montajes.at(-1)!.archivos.map((a) => a.ruta);
    expect(montados).toEqual(expect.arrayContaining(['main.bbl', 'main.aux']));
  });

  it('si cambió el .bib vuelve a correr BibTeX', async () => {
    const { orquestador, programas } = preparar(escenario);
    await orquestador.compilar({ archivos: proyecto('\\bibliography{refs}', bib), principal: 'main.tex' });
    const antes = programas().length;
    await orquestador.compilar({
      archivos: proyecto('\\bibliography{refs}', [{ ruta: 'refs.bib', contenido: '@book{a,title={otro}}' }]),
      principal: 'main.tex',
    });
    expect(programas().slice(antes)).toContain('bibtex8');
  });

  it('si cambió la lista de archivos no usa la caché', async () => {
    const { orquestador } = preparar(escenario);
    await orquestador.compilar({ archivos: proyecto('x', bib), principal: 'main.tex' });
    const r = await orquestador.compilar({
      archivos: proyecto('x', [...bib, { ruta: 'nuevo.tex', contenido: '' }]),
      principal: 'main.tex',
    });
    expect(r.cacheUsada).toBe(false);
  });

  it('un archivo del proyecto prevalece sobre uno generado con el mismo nombre', async () => {
    const { orquestador, montajes } = preparar({ generar: () => ({ 'main.aux': '\\relax \n' }) });
    const base = { principal: 'main.tex' };
    await orquestador.compilar({ ...base, archivos: proyecto('x') });
    await orquestador.compilar({ ...base, archivos: proyecto('x') });
    const rutas = montajes.at(-1)!.archivos.map((a) => a.ruta);
    expect(rutas.filter((r) => r === 'main.aux')).toHaveLength(1);
  });

  it('olvidarCache obliga a correr todo otra vez', async () => {
    const { orquestador } = preparar();
    await orquestador.compilar({ archivos: proyecto('x'), principal: 'main.tex' });
    orquestador.olvidarCache();
    expect((await orquestador.compilar({ archivos: proyecto('x'), principal: 'main.tex' })).cacheUsada).toBe(
      false,
    );
  });
});
