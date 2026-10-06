// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { PuertoMotor } from './motor';
import { compilarProvisional, pideRepetir, usaBibliografia } from './secuencia-provisional';
import type { ArchivoProyecto, ResultadoEjecucion } from './tipos';

const codificador = new TextEncoder();

/** Motor falso: guarda los comandos y simula el sistema de archivos con un mapa. */
function motorFalso(opciones: {
  generados?: (cmd: string[]) => Record<string, string | undefined>;
  codigos?: (cmd: string[]) => number;
  logTex?: (n: number) => string;
}) {
  const sistema = new Map<string, Uint8Array>();
  const comandos: string[][] = [];
  const montajes: Array<{ archivos: ArchivoProyecto[]; directorio?: string }> = [];
  let pasadasTex = 0;
  const motor: PuertoMotor = {
    async montar(archivos, directorio) {
      montajes.push({ archivos, directorio });
      sistema.clear();
    },
    async ejecutar(cmd) {
      comandos.push(cmd);
      let log = '';
      if (cmd[0] === 'pdflatex') {
        pasadasTex++;
        log = opciones.logTex?.(pasadasTex) ?? '';
        sistema.set('main.pdf', codificador.encode('%PDF-1.5 falso'));
      }
      for (const [ruta, texto] of Object.entries(opciones.generados?.(cmd) ?? {})) {
        if (texto === undefined) continue;
        sistema.set(ruta, codificador.encode(texto));
      }
      const resultado: ResultadoEjecucion = {
        codigo: opciones.codigos?.(cmd) ?? 0,
        stdout: '',
        stderr: '',
        log,
        ms: 1,
      };
      return resultado;
    },
    async leer(ruta) {
      return sistema.get(ruta.replace(/^.*\//, '')) ?? null;
    },
    async existe(ruta) {
      return sistema.has(ruta.replace(/^.*\//, ''));
    },
  };
  return { motor, comandos, montajes, sistema };
}

const proyecto = (tex: string, extra: ArchivoProyecto[] = []): ArchivoProyecto[] => [
  { ruta: 'main.tex', contenido: tex },
  ...extra,
];

const programas = (comandos: string[][]) => comandos.map((c) => c[0]);

describe('detección de bibliografía y repeticiones', () => {
  it('reconoce \\bibliography y \\addbibresource, incluso en bytes', () => {
    expect(usaBibliografia(proyecto('\\bibliography{refs}'))).toBe(true);
    expect(usaBibliografia(proyecto('\\addbibresource {refs.bib}'))).toBe(true);
    expect(usaBibliografia([{ ruta: 'a.tex', contenido: codificador.encode('\\bibliography{x}') }])).toBe(
      true,
    );
    expect(usaBibliografia(proyecto('\\bibliographystyle{plain}'))).toBe(false);
    expect(usaBibliografia([{ ruta: 'refs.bib', contenido: '\\bibliography{x}' }])).toBe(false);
    expect(usaBibliografia([{ ruta: 'conf/estilo.sty', contenido: '\\bibliography{x}' }])).toBe(true);
  });

  it('reconoce los avisos de repetir pasada', () => {
    expect(
      pideRepetir('LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.'),
    ).toBe(true);
    expect(pideRepetir('Output written on main.pdf')).toBe(false);
  });
});

describe('secuencia provisional', () => {
  it('documento simple: una sola pasada de pdflatex y devuelve el PDF', async () => {
    const { motor, comandos, montajes } = motorFalso({});
    const r = await compilarProvisional(motor, {
      archivos: proyecto('\\documentclass{article}'),
      principal: 'main.tex',
    });
    expect(programas(comandos)).toEqual(['pdflatex']);
    expect(comandos[0]).toContain('-file-line-error');
    expect(comandos[0]).toContain('--interaction=batchmode');
    expect(comandos[0]).toContain('--fmt');
    expect(montajes[0]?.directorio).toBe('');
    expect(r.exito).toBe(true);
    expect(new TextDecoder().decode(r.pdf!)).toMatch(/^%PDF-/);
  });

  it('con bibliografía: pdflatex → bibtex8 → pdflatex ×2, la última en nonstopmode', async () => {
    const { motor, comandos } = motorFalso({
      generados: (cmd) =>
        cmd[0] === 'pdflatex' ? { 'main.aux': '\\bibdata{refs}' } : { 'main.blg': 'This is BibTeX' },
    });
    const r = await compilarProvisional(motor, {
      archivos: proyecto('\\bibliography{refs}'),
      principal: 'main.tex',
    });
    expect(programas(comandos)).toEqual(['pdflatex', 'bibtex8', 'pdflatex', 'pdflatex']);
    expect(comandos[1]).toEqual(['bibtex8', '--8bit', 'main.aux']);
    expect(comandos[3]).toContain('--interaction=nonstopmode');
    expect(comandos[2]).toContain('--interaction=batchmode');
    expect(r.bitacoras.blg).toBe('');
    expect(r.exito).toBe(true);
  });

  it('no corre bibtex8 si el .aux no trae \\bibdata (biblatex con Biber)', async () => {
    const { motor, comandos } = motorFalso({ generados: () => ({ 'main.aux': '\\relax' }) });
    await compilarProvisional(motor, {
      archivos: proyecto('\\addbibresource{refs.bib}'),
      principal: 'main.tex',
    });
    expect(programas(comandos)).not.toContain('bibtex8');
  });

  it('con índice no vacío: makeindex sobre el .idx; vacío: se omite', async () => {
    const con = motorFalso({
      generados: (cmd) => (cmd[0] === 'pdflatex' ? { 'main.idx': '\\indexentry{a}{1}' } : {}),
    });
    await compilarProvisional(con.motor, { archivos: proyecto('x'), principal: 'main.tex' });
    expect(con.comandos.map((c) => c.join(' '))).toContain('makeindex main.idx');

    const vacio = motorFalso({ generados: (cmd) => (cmd[0] === 'pdflatex' ? { 'main.idx': '  \n' } : {}) });
    await compilarProvisional(vacio.motor, { archivos: proyecto('x'), principal: 'main.tex' });
    expect(programas(vacio.comandos)).toEqual(['pdflatex']);
  });

  it('con nomenclatura (.nlo): makeindex con nomencl.ist y salida .nls (hallazgo 4)', async () => {
    const { motor, comandos } = motorFalso({
      generados: (cmd) => (cmd[0] === 'pdflatex' ? { 'main.nlo': '\\nomenclatura{a}{1}' } : {}),
    });
    await compilarProvisional(motor, { archivos: proyecto('x'), principal: 'main.tex' });
    expect(comandos.map((c) => c.join(' '))).toContain('makeindex main.nlo -s nomencl.ist -o main.nls');
    expect(programas(comandos)).toEqual(['pdflatex', 'makeindex', 'pdflatex', 'pdflatex']);
  });

  it('si TeX pide repetir, hace las dos pasadas extra aunque no haya índice ni bibliografía', async () => {
    const { motor, comandos } = motorFalso({
      logTex: (n) => (n === 1 ? 'Rerun to get cross-references right.' : ''),
    });
    await compilarProvisional(motor, { archivos: proyecto('x'), principal: 'main.tex' });
    expect(programas(comandos)).toEqual(['pdflatex', 'pdflatex', 'pdflatex']);
  });

  it('si falla la primera pasada, se detiene y no hay PDF; conserva la bitácora', async () => {
    const { motor, comandos } = motorFalso({
      codigos: () => 1,
      logTex: () => '! Undefined control sequence.',
    });
    const r = await compilarProvisional(motor, { archivos: proyecto('x'), principal: 'main.tex' });
    expect(programas(comandos)).toEqual(['pdflatex']);
    expect(r.exito).toBe(false);
    expect(r.pdf).toBeNull();
    expect(r.bitacoras.log).toContain('Undefined control sequence');
  });

  it('un código distinto de cero en bibtex8 no detiene la compilación', async () => {
    const { motor, comandos } = motorFalso({
      generados: (cmd) => (cmd[0] === 'pdflatex' ? { 'main.aux': '\\bibdata{refs}' } : {}),
      codigos: (cmd) => (cmd[0] === 'bibtex8' ? 2 : 0),
    });
    const r = await compilarProvisional(motor, {
      archivos: proyecto('\\bibliography{r}'),
      principal: 'main.tex',
    });
    expect(programas(comandos)).toEqual(['pdflatex', 'bibtex8', 'pdflatex', 'pdflatex']);
    expect(r.exito).toBe(true);
  });

  it('principal en una subcarpeta: monta y compila desde esa carpeta', async () => {
    const { motor, comandos, montajes } = motorFalso({});
    await compilarProvisional(motor, {
      archivos: [{ ruta: 'tesis/main.tex', contenido: 'x' }],
      principal: 'tesis/main.tex',
    });
    expect(montajes[0]?.directorio).toBe('tesis');
    expect(comandos[0]?.at(-1)).toBe('main.tex');
  });

  it('registra pasos con código y tiempo', async () => {
    const { motor } = motorFalso({});
    const r = await compilarProvisional(motor, { archivos: proyecto('x'), principal: 'main.tex' });
    expect(r.pasos).toHaveLength(1);
    expect(r.pasos[0]).toMatchObject({ codigo: 0, ms: 1 });
    expect(r.ms).toBeGreaterThanOrEqual(0);
  });
});
