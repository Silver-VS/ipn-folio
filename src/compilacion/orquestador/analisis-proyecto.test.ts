// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { analizarProyecto } from './analisis-proyecto';
import type { ArchivoProyecto } from '../tipos';

const f = (ruta: string, contenido: string | Uint8Array): ArchivoProyecto => ({ ruta, contenido });

describe('analizarProyecto', () => {
  it('detecta nomenclatura cargada desde un archivo de paquetes, no desde el principal', () => {
    const a = analizarProyecto([
      f(
        'main.tex',
        '\\documentclass{book}\n\\input{configuracion/paquetes}\n\\begin{document}\\end{document}',
      ),
      f('configuracion/paquetes.tex', '\\usepackage[intoc]{nomencl}\n\\makenomenclature'),
    ]);
    expect(a.nomenclatura).toBe(true);
  });

  it('lee también los .sty y .cls (UpiiTeXis pide la bibliografía desde un .sty)', () => {
    const a = analizarProyecto([
      f('main.tex', '\\usepackage{configuracion/upiitatesis}'),
      f('configuracion/upiitatesis.sty', '\\bibliography{xbiblioteca}'),
    ]);
    expect(a.bibliografia).toBe(true);
  });

  it('acepta archivos como bytes e ignora los que no son fuentes TeX', () => {
    const a = analizarProyecto([
      f('main.tex', new TextEncoder().encode('\\addbibresource{refs.bib}')),
      f('refs.bib', '\\makeindex'),
    ]);
    expect(a.bibliografia).toBe(true);
    expect(a.indice).toBe(false);
  });

  it('ignora lo comentado', () => {
    const a = analizarProyecto([
      f('main.tex', '% \\makeindex\n\\usepackage{x} % \\bibliography{y}\n100\\% \\makeindex'),
    ]);
    expect(a.bibliografia).toBe(false);
    // `100\%` es un porcentaje escapado: lo que sigue sí es código.
    expect(a.indice).toBe(true);
  });

  it('distingue biblatex con Biber (por omisión) de biblatex con BibTeX', () => {
    expect(analizarProyecto([f('a.tex', '\\usepackage{biblatex}')]).biber).toBe(true);
    expect(analizarProyecto([f('a.tex', '\\usepackage[style=apa,backend=biber]{biblatex}')]).biber).toBe(
      true,
    );
    expect(analizarProyecto([f('a.tex', '\\usepackage[backend=bibtex,style=apa]{biblatex}')]).biber).toBe(
      false,
    );
    expect(analizarProyecto([f('a.tex', '\\usepackage[backend=bibtex8]{biblatex}')]).biber).toBe(false);
    expect(analizarProyecto([f('a.tex', '\\usepackage[backend=bibtex]{biblatex}')]).biblatex).toBe(true);
  });

  it('detecta \\makeindex y los índices con nombre de imakeidx (con sus opciones)', () => {
    const a = analizarProyecto([
      f(
        'main.tex',
        '\\usepackage{imakeidx}\n\\makeindex\n\\makeindex[name=autores, title={Autores}]\n\\makeindex[name=temas,options=-s estilo.ist]',
      ),
    ]);
    expect(a.indice).toBe(true);
    expect(a.indicesExtra).toEqual([
      { nombre: 'autores', opciones: [] },
      { nombre: 'temas', opciones: ['-s', 'estilo.ist'] },
    ]);
  });

  it('un \\makeindex con opciones pero sin nombre es el índice principal', () => {
    const a = analizarProyecto([f('main.tex', '\\makeindex[intoc]')]);
    expect(a.indice).toBe(true);
    expect(a.indicesExtra).toEqual([]);
  });

  it('detecta glosarios y los glosarios declarados con \\newglossary', () => {
    const a = analizarProyecto([
      f(
        'main.tex',
        '\\usepackage[acronym]{glossaries}\n\\makeglossaries\n\\newglossary[slg]{simbolos}{sls}{slo}{Símbolos}',
      ),
    ]);
    expect(a.glosarios).toBe(true);
    expect(a.glosariosExtra).toEqual([{ bitacora: 'slg', salida: 'sls', entrada: 'slo' }]);
  });

  it('lee los idiomas de babel (varios paquetes en una línea, opciones con llaves)', () => {
    const a = analizarProyecto([
      f(
        'main.tex',
        '\\usepackage[utf8]{inputenc}\n\\usepackage[spanish, mexico, es-minimal={x,y}]{babel}\n\\usepackage[english]{babel}',
      ),
    ]);
    expect(a.idiomas).toEqual(['spanish', 'mexico', 'english']);
    expect(analizarProyecto([f('m.tex', '\\documentclass[spanish]{article}')]).idiomas).toEqual(['spanish']);
  });

  it('reúne los \\include (sin extensión)', () => {
    const a = analizarProyecto([
      f('main.tex', '\\include{capitulos/uno}\n\\include{capitulos/dos.tex}\n\\input{apendice}'),
    ]);
    expect(a.incluidos).toEqual(['capitulos/uno', 'capitulos/dos']);
  });

  it('un proyecto vacío no necesita nada', () => {
    expect(analizarProyecto([])).toEqual({
      bibliografia: false,
      biblatex: false,
      biber: false,
      indice: false,
      indicesExtra: [],
      nomenclatura: false,
      glosarios: false,
      glosariosExtra: [],
      idiomas: [],
      incluidos: [],
    });
  });
});
