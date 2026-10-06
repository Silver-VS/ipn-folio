// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { prerevisar } from './prerevision';

// Archivo sintético: el molde de referencia de WinEdt usa el byte 0x7F como marcador de campo.
const BIB = `@BOOK{libro-bueno,
  title = {Un libro completo},
}

@BOOK{molde-winedt,
  author = {\x7f},
  title = {\x7f},
  year = {\x7f},
}
`;

describe('prerevisar', () => {
  it('avisa de la entrada con campos por llenar, con archivo, línea y una sola vez por entrada', () => {
    const problemas = prerevisar([{ ruta: 'XBiblioteca.bib', contenido: BIB }]);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatchObject({
      codigo: 'campos-por-llenar',
      gravedad: 'aviso',
      archivo: 'XBiblioteca.bib',
      linea: 5,
      variables: { archivo: 'XBiblioteca.bib', cita: 'molde-winedt' },
    });
    expect(problemas[0]?.titulo).toBe('Hay campos por llenar en XBiblioteca.bib (entrada molde-winedt)');
  });

  it('no avisa de un .bib completo', () => {
    expect(prerevisar([{ ruta: 'a.bib', contenido: '@BOOK{a,\n title={x}\n}' }])).toEqual([]);
  });

  it('también revisa los .tex y los archivos en bytes', () => {
    const tex = new TextEncoder().encode('\\section{A}\ntexto \x7f\n');
    const problemas = prerevisar([{ ruta: 'capitulos/uno.tex', contenido: tex }]);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toMatchObject({ archivo: 'capitulos/uno.tex', linea: 2 });
    expect(problemas[0]?.titulo).toBe('Hay campos por llenar en capitulos/uno.tex, línea 2');
  });

  it('ignora otros tipos de archivo', () => {
    expect(prerevisar([{ ruta: 'datos.csv', contenido: 'a\x7fb' }])).toEqual([]);
  });
});
