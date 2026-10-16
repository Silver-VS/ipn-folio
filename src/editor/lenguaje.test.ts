// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { lenguajePara, tipoEditorPorRuta } from './lenguaje';

describe('tipo de editor por archivo', () => {
  it('.tex, .sty y .cls son LaTeX (sin importar mayúsculas ni carpeta)', () => {
    for (const r of ['main.tex', 'capitulos/Intro.TEX', 'upiitexis.sty', 'a/b/c.cls'])
      expect(tipoEditorPorRuta(r), r).toBe('latex');
  });

  it('.bib y lo demás es texto plano', () => {
    for (const r of ['referencias.bib', 'notas.txt', 'README', '.gitignore', 'datos.csv', 'tex'])
      expect(tipoEditorPorRuta(r), r).toBe('texto');
  });

  it('solo LaTeX trae extensión de lenguaje', () => {
    expect(lenguajePara('latex', 'main.tex').length).toBe(1);
    expect(lenguajePara('texto', 'notas.txt')).toEqual([]);
  });
});
