// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { rutaDeBitacora } from './adaptador';

describe('rutaDeBitacora', () => {
  it('TeX: el .log del archivo principal', () => {
    expect(rutaDeBitacora(['pdflatex', '-synctex=1', '--fmt', '/x/pdflatex.fmt', 'tesis.tex'])).toBe(
      'tesis.log',
    );
  });

  it('TeX con -jobname usa ese nombre', () => {
    expect(rutaDeBitacora(['pdflatex', '--jobname=salida', 'a.tex'])).toBe('salida.log');
  });

  it('bibtex8: el .blg del .aux', () => {
    expect(rutaDeBitacora(['bibtex8', '--8bit', 'tesis.aux'])).toBe('tesis.blg');
  });

  it('makeindex: el .ilg de la entrada, ignorando valores de opciones', () => {
    expect(rutaDeBitacora(['makeindex', 'tesis.idx'])).toBe('tesis.ilg');
    expect(rutaDeBitacora(['makeindex', 'tesis.nlo', '-s', 'nomencl.ist', '-o', 'tesis.nls'])).toBe(
      'tesis.ilg',
    );
  });

  it('makeindex con -t usa la bitácora indicada', () => {
    expect(rutaDeBitacora(['makeindex', 'a.idx', '-t', 'otra.ilg'])).toBe('otra.ilg');
  });
});
