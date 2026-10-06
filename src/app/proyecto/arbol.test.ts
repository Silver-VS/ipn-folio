// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { InfoArchivo } from '../../almacen';
import {
  aplanarVisibles,
  carpetasDe,
  construirArbol,
  esImagen,
  mimeDeImagen,
  moverBajo,
  nombreUnico,
} from './arbol';

const info = (ruta: string): InfoArchivo => ({
  proyectoId: 'p',
  ruta,
  tipo: ruta.endsWith('.png') ? 'binario' : 'texto',
  modificado: 0,
  tamano: 0,
});

describe('árbol de archivos', () => {
  const archivos = ['main.tex', 'capitulos/intro.tex', 'capitulos/conclusiones.tex', 'imagenes/uno.png', 'Anexo.tex', 'capitulos/sub/a.tex'].map(
    info,
  );

  it('pone las carpetas antes que los archivos y ordena en español', () => {
    const arbol = construirArbol(archivos);
    expect(arbol.map((n) => `${n.tipo}:${n.nombre}`)).toEqual([
      'carpeta:capitulos',
      'carpeta:imagenes',
      'archivo:Anexo.tex',
      'archivo:main.tex',
    ]);
    const capitulos = arbol[0]!;
    expect(capitulos.hijos.map((n) => n.nombre)).toEqual(['sub', 'conclusiones.tex', 'intro.tex']);
    expect(capitulos.hijos[0]!.nivel).toBe(1);
  });

  it('solo muestra los hijos de las carpetas expandidas', () => {
    const arbol = construirArbol(archivos);
    expect(aplanarVisibles(arbol, new Set()).map((n) => n.ruta)).toEqual(['capitulos', 'imagenes', 'Anexo.tex', 'main.tex']);
    const abiertas = aplanarVisibles(arbol, new Set(['capitulos', 'capitulos/sub']));
    expect(abiertas.map((n) => n.ruta)).toContain('capitulos/sub/a.tex');
    expect(abiertas.map((n) => n.ruta)).not.toContain('imagenes/uno.png');
  });

  it('carpetasDe devuelve las carpetas que contienen la ruta', () => {
    expect(carpetasDe('a/b/c.tex')).toEqual(['a', 'a/b']);
    expect(carpetasDe('main.tex')).toEqual([]);
  });
});

describe('nombres', () => {
  const existentes = new Set(['imagenes/uno.png', 'imagenes/uno (2).png', 'LEEME']);

  it('conserva el nombre si está libre y numera si no (sin distinguir mayúsculas)', () => {
    expect(nombreUnico(existentes, 'imagenes', 'dos.png')).toBe('dos.png');
    expect(nombreUnico(existentes, 'imagenes', 'uno.png')).toBe('uno (3).png');
    expect(nombreUnico(existentes, 'imagenes', 'UNO.PNG')).toBe('UNO (3).PNG');
    expect(nombreUnico(existentes, '', 'LEEME')).toBe('LEEME (2)');
  });

  it('reconoce imágenes y su tipo MIME', () => {
    expect(esImagen('a/b.PNG')).toBe(true);
    expect(esImagen('a/b.tex')).toBe(false);
    expect(mimeDeImagen('x.jpg')).toBe('image/jpeg');
    expect(mimeDeImagen('x.svg')).toBe('image/svg+xml');
    expect(mimeDeImagen('x.png')).toBe('image/png');
  });

  it('moverBajo reubica una ruta y todo lo que cuelga de ella', () => {
    expect(moverBajo('a', 'a', 'z')).toBe('z');
    expect(moverBajo('a/b.tex', 'a', 'z')).toBe('z/b.tex');
    expect(moverBajo('ab/b.tex', 'a', 'z')).toBeUndefined();
  });
});
