// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cmdBibtex, cmdGlosario, cmdIndice, cmdNomenclatura, cmdTex } from './comandos';

const todos = [
  cmdTex('main.tex'),
  cmdBibtex('main'),
  cmdIndice('main'),
  cmdNomenclatura('main'),
  cmdGlosario('main', 'glo', 'gls', 'glg'),
];

describe('comandos', () => {
  it('TeX usa -file-line-error, -synctex=1 y nonstopmode, y nunca shell-escape', () => {
    const cmd = cmdTex('main.tex');
    expect(cmd).toEqual(
      expect.arrayContaining(['-file-line-error', '-synctex=1', '--interaction=nonstopmode']),
    );
    expect(cmd.at(-1)).toBe('main.tex');
    for (const c of todos) {
      expect(c).not.toContain('--shell-escape');
      expect(c).not.toContain('-shell-escape');
    }
    expect(cmd).toContain('--no-shell-escape');
  });

  it('las herramientas reciben los nombres esperados', () => {
    expect(cmdBibtex('tesis')).toEqual(['bibtex8', '--8bit', 'tesis.aux']);
    expect(cmdIndice('autores', ['-s', 'e.ist'])).toEqual(['makeindex', '-s', 'e.ist', 'autores.idx']);
    expect(cmdNomenclatura('tesis')).toEqual([
      'makeindex',
      'tesis.nlo',
      '-s',
      'nomencl.ist',
      '-t',
      'tesis.nlg',
      '-o',
      'tesis.nls',
    ]);
    expect(cmdGlosario('tesis', 'acn', 'acr', 'alg')).toEqual([
      'makeindex',
      '-s',
      'tesis.ist',
      '-t',
      'tesis.alg',
      '-o',
      'tesis.acr',
      'tesis.acn',
    ]);
  });

  it('ningún archivo del orquestador arma comandos ni pide shell-escape fuera de comandos.ts', () => {
    const carpeta = new URL('./', import.meta.url);
    for (const nombre of readdirSync(carpeta)) {
      if (!nombre.endsWith('.ts') || nombre.endsWith('.test.ts')) continue;
      const texto = readFileSync(new URL(nombre, carpeta), 'utf8');
      // Se busca el uso real del indicador en un comando; los comentarios que lo mencionan no cuentan.
      const codigo = texto.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(codigo, nombre).not.toMatch(/['"]-{1,2}shell-escape['"]/);
      if (nombre !== 'comandos.ts' && nombre !== 'motor-falso.ts')
        expect(codigo, nombre).not.toMatch(/['"](?:pdflatex|bibtex8|makeindex)['"]/);
    }
  });
});
