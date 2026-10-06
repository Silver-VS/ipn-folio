// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { ErrorAlmacen, textoDeError } from './errores';
import { esRutaValida, normalizarRuta, planearRenombrado, tipoPorRuta, validarArbol } from './rutas';

describe('normalizarRuta', () => {
  it('acepta rutas con espacios y acentos y las deja tal cual', () => {
    expect(normalizarRuta('capitulos/Marco Teórico.tex')).toBe('capitulos/Marco Teórico.tex');
  });

  it('cambia \\ por / y quita ./', () => {
    expect(normalizarRuta('.\\a\\b.tex')).toBe('a/b.tex');
    expect(normalizarRuta('./a/./b.tex')).toBe('a/b.tex');
  });

  it('rechaza ../x.tex, /x.tex, C:\\x.tex y nombres vacíos', () => {
    for (const mala of [
      '../x.tex',
      'a/../x.tex',
      '/x.tex',
      'C:\\x.tex',
      'c:/x.tex',
      '',
      '.',
      'a//b.tex',
      'a/',
      'a/.',
    ]) {
      expect(esRutaValida(mala), mala).toBe(false);
    }
    expect(() => normalizarRuta('../x.tex')).toThrow(ErrorAlmacen);
  });

  it('rechaza caracteres de control y nombres sin contenido visible', () => {
    expect(esRutaValida('a\u0000b.tex')).toBe(false);
    expect(esRutaValida('a\nb.tex')).toBe(false);
    expect(esRutaValida('   ')).toBe(false);
    expect(esRutaValida('a/ /b.tex')).toBe(false);
  });

  it('distingue mayúsculas', () => {
    expect(normalizarRuta('Main.TEX')).toBe('Main.TEX');
  });
});

describe('tipoPorRuta', () => {
  it('texto para las extensiones de LaTeX y binario para el resto', () => {
    for (const r of [
      'a.tex',
      'a.sty',
      'a.cls',
      'a.bib',
      'a.bst',
      'a.cfg',
      'a.clo',
      'a.def',
      'a.fd',
      'a.ist',
      'a.txt',
      'a.md',
      'A.TEX',
    ]) {
      expect(tipoPorRuta(r), r).toBe('texto');
    }
    for (const r of ['a.png', 'a.pdf', 'a.jpg', 'sin-extension', '.tex', 'a.tex.gz']) {
      expect(tipoPorRuta(r), r).toBe('binario');
    }
  });
});

describe('árbol y renombrado', () => {
  it('validarArbol detecta duplicados y choques archivo/carpeta', () => {
    expect(() => validarArbol(['a.tex', 'b/c.tex'])).not.toThrow();
    expect(() => validarArbol(['a', 'a/b.tex'])).toThrow(ErrorAlmacen);
    expect(() => validarArbol(['a.tex', 'a.tex'])).toThrow(ErrorAlmacen);
  });

  it('planearRenombrado no mueve prefijos parecidos (a vs ab)', () => {
    const plan = planearRenombrado(['a/x.tex', 'ab/y.tex', 'a.tex'], 'a', 'z');
    expect([...plan]).toEqual([['a/x.tex', 'z/x.tex']]);
  });
});

describe('textoDeError', () => {
  it('devuelve un mensaje en español con la ruta', () => {
    const texto = textoDeError(new ErrorAlmacen('ruta_invalida', { ruta: '../x.tex' }));
    expect(texto).toContain('../x.tex');
    expect(textoDeError(new Error('otra cosa'))).toContain('No se pudo guardar');
  });
});
