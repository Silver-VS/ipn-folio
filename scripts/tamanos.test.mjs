// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { ARCHIVOS_LATEX, medir, megasDe } from './tamanos.mjs';

const activos = {
  texlyreBusytex: '9.9.9',
  archivos: [
    ...ARCHIVOS_LATEX.map((a, i) => ({ nombre: a.nombre, bytes: (i + 1) * 1_000_000 })),
    { nombre: 'versions.txt', bytes: 400 },
  ],
};

describe('tamaños medidos', () => {
  it('suma solo los archivos de LaTeX y separa caché de IndexedDB', () => {
    const m = medir(activos);
    expect(m.busytex).toBe('9.9.9');
    expect(m.latex.bytes).toBe(21_000_000);
    expect(m.latex.bytesIndexedDb).toBe(6_000_000);
    expect(m.latex.bytesCache).toBe(15_000_000);
    expect(m.latex.megas).toBe(21);
    expect(m.latex.archivos.map((a) => a.nombre)).not.toContain('versions.txt');
  });

  it('falla con claridad si falta un archivo', () => {
    expect(() => medir({ texlyreBusytex: '1', archivos: [] })).toThrow(/busytex\.js/);
  });

  it('megasDe redondea y nunca baja de 1', () => {
    expect(megasDe(127_735_181)).toBe(128);
    expect(megasDe(10)).toBe(1);
  });
});
