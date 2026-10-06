// SPDX-License-Identifier: AGPL-3.0-or-later
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { crearAlmacenMemoria } from './almacen-memoria';
import { ErrorAlmacen, textoDeAviso } from './errores';
import { detectarPrincipal, exportarZip, importarZip } from './zip';

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 255, 254,
]);
const TEX = '\\documentclass{article}\n\\begin{document}\nHola, Alumna Ficticia.\n\\end{document}\n';
const BIB = '@book{ejemplo, title={Libro de ejemplo}, author={Autora Ficticia}}\n';

describe('zip', () => {
  it('exportar e importar conserva los mismos bytes y el mismo principal', async () => {
    const a = crearAlmacenMemoria();
    const p = await a.crearProyecto({ nombre: 'Proyecto de ejemplo' }, [
      { ruta: 'main.tex', contenido: TEX },
      { ruta: 'refs/bibliografia.bib', contenido: BIB },
      { ruta: 'img/logo.png', contenido: PNG },
    ]);
    const zip = await exportarZip(a, p.id);
    const { proyecto, ignorados } = await importarZip(a, zip, 'Proyecto de ejemplo.zip');
    expect(ignorados).toEqual([]);
    expect(proyecto.nombre).toBe('Proyecto de ejemplo');
    expect(proyecto.principal).toBe(p.principal);
    const antes = await a.listarArchivos(p.id);
    const despues = await a.listarArchivos(proyecto.id);
    expect(despues.map((f) => f.ruta)).toEqual(antes.map((f) => f.ruta));
    for (const { ruta } of antes) {
      const x = (await a.leer(p.id, ruta))!;
      const y = (await a.leer(proyecto.id, ruta))!;
      expect(y.tipo).toBe(x.tipo);
      const bx = typeof x.contenido === 'string' ? strToU8(x.contenido) : x.contenido;
      const by = typeof y.contenido === 'string' ? strToU8(y.contenido) : y.contenido;
      expect([...by], ruta).toEqual([...bx]);
    }
  });

  it('importar ignora .aux, .log, __MACOSX/ y demás auxiliares', async () => {
    const a = crearAlmacenMemoria();
    const zip = zipSync({
      'main.tex': strToU8(TEX),
      'main.aux': strToU8('x'),
      'main.log': strToU8('x'),
      'main.synctex.gz': new Uint8Array([1, 2, 3]),
      'capitulos/uno.toc': strToU8('x'),
      '__MACOSX/._main.tex': strToU8('x'),
      'img/logo.png': PNG,
    });
    const { proyecto, ignorados } = await importarZip(a, zip, 'entrega');
    expect((await a.listarArchivos(proyecto.id)).map((f) => f.ruta)).toEqual(['img/logo.png', 'main.tex']);
    expect(ignorados.sort()).toEqual([
      '__MACOSX/._main.tex',
      'capitulos/uno.toc',
      'main.aux',
      'main.log',
      'main.synctex.gz',
    ]);
  });

  it('importar omite rutas peligrosas (zip slip) y rechaza archivos que no son zip', async () => {
    const a = crearAlmacenMemoria();
    const zip = zipSync({ 'main.tex': strToU8(TEX), '../fuera.tex': strToU8('x'), '/abs.tex': strToU8('x') });
    const { proyecto, ignorados } = await importarZip(a, zip, 'x.zip');
    expect((await a.listarArchivos(proyecto.id)).map((f) => f.ruta)).toEqual(['main.tex']);
    expect(ignorados.length).toBe(2);
    await expect(importarZip(a, new Uint8Array([1, 2, 3, 4]), 'x.zip')).rejects.toBeInstanceOf(ErrorAlmacen);
  });

  it('conserva un BOM de UTF-8 en los archivos de texto', async () => {
    const a = crearAlmacenMemoria();
    const conBom = new Uint8Array([0xef, 0xbb, 0xbf, ...strToU8(TEX)]);
    const { proyecto } = await importarZip(a, zipSync({ 'main.tex': conBom }), 'bom');
    const salida = await exportarZip(a, proyecto.id);
    const { proyecto: otro } = await importarZip(a, salida, 'bom2');
    const archivo = (await a.leer(otro.id, 'main.tex'))!;
    expect(strToU8(archivo.contenido as string)).toEqual(conBom);
  });

  it('un .tex que no es UTF-8 se decodifica como Windows-1252 y se avisa, sin perder letras', async () => {
    const a = crearAlmacenMemoria();
    const latin1 = new Uint8Array([...strToU8('\\documentclass{article}\n% '), 0xe1, 0xf1, 0xdc, 0x0a]);
    const { proyecto, avisos } = await importarZip(
      a,
      zipSync({ 'main.tex': latin1, 'ok.tex': strToU8('áñ') }),
      'x',
    );
    const t = (await a.leer(proyecto.id, 'main.tex'))!.contenido as string;
    expect(t).toContain('% áñÜ');
    expect(t).not.toContain('\uFFFD');
    expect((await a.leer(proyecto.id, 'ok.tex'))!.contenido).toBe('áñ');
    expect(avisos).toEqual([{ clave: 'codificacion_convertida', variables: { ruta: 'main.tex' } }]);
    expect(textoDeAviso(avisos[0]!)).toContain('main.tex');
  });

  it('una entrada duplicada no aborta la importación: gana la última y se avisa', async () => {
    const a = crearAlmacenMemoria();
    const zip = zipSync({ 'a.tex': strToU8('primera'), './a.tex': strToU8('segunda'), 'b.tex': strToU8('b') });
    const { proyecto, avisos } = await importarZip(a, zip, 'x');
    expect((await a.listarArchivos(proyecto.id)).map((f) => f.ruta)).toEqual(['a.tex', 'b.tex']);
    expect((await a.leer(proyecto.id, 'a.tex'))!.contenido).toBe('segunda');
    expect(avisos).toEqual([{ clave: 'entrada_duplicada', variables: { ruta: 'a.tex' } }]);
  });
});

describe('detectarPrincipal', () => {
  const f = (ruta: string, contenido = '') => ({ ruta, contenido });

  it('elige el .tex con \\documentclass', () => {
    expect(detectarPrincipal([f('capitulo.tex', 'texto'), f('tesis.tex', '\\documentclass{book}')])).toBe(
      'tesis.tex',
    );
  });

  it('ignora \\documentclass comentado', () => {
    expect(detectarPrincipal([f('a.tex', '% \\documentclass{x}'), f('b.tex', '\\documentclass{x}')])).toBe(
      'b.tex',
    );
  });

  it('con varios, prefiere la raíz y luego main.tex', () => {
    const dc = '\\documentclass{article}';
    expect(detectarPrincipal([f('sub/a.tex', dc), f('z.tex', dc)])).toBe('z.tex');
    expect(detectarPrincipal([f('z.tex', dc), f('main.tex', dc), f('a.tex', dc)])).toBe('main.tex');
    expect(detectarPrincipal([f('sub/b.tex', dc), f('sub/a.tex', dc)])).toBe('sub/a.tex');
  });

  it('sin \\documentclass: main.tex, el primer .tex o el primer archivo', () => {
    expect(detectarPrincipal([f('b.tex'), f('main.tex')])).toBe('main.tex');
    expect(detectarPrincipal([f('b.tex'), f('a.tex')])).toBe('a.tex');
    expect(detectarPrincipal([f('z.png'), f('a.bib')])).toBe('a.bib');
    expect(detectarPrincipal([])).toBe('main.tex');
  });

  it('lee el contenido en bytes', () => {
    expect(
      detectarPrincipal([{ ruta: 'x.tex', contenido: strToU8('\\documentclass{article}') }, f('y.tex')]),
    ).toBe('x.tex');
  });
});
