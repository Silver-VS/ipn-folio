// SPDX-License-Identifier: AGPL-3.0-or-later
// Pruebas del generador del espejo con fixtures inventados; no requieren TeX Live instalado.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SUFIJOS, formatoDeRuta, variantesDeNombre } from './formatos.mjs';
import { analizarTlpdb, esLibre, resolver } from './tlpdb.mjs';
import { crearServidor } from './servir.mjs';
import { validar } from './validar.mjs';

const TLPDB = `name collection-demo
category Collection
revision 1
depend paquete-a
depend collection-basic
depend paquete-binario.windows

name paquete-a
category Package
revision 2
shortdesc Paquete A
depend paquete-b
depend collection-otra
catalogue-license lppl1.3c
docfiles size=1
 texmf-dist/doc/latex/paquete-a/a.pdf details="Manual"
runfiles size=3
 texmf-dist/tex/latex/paquete-a/a.sty
 texmf-dist/fonts/tfm/public/paquete-a/fa.tfm
 texmf-dist/fonts/map/dvips/paquete-a/a.map details="Mapa"

name paquete-b
category Package
revision 3
catalogue-license nosell
runfiles size=1
 texmf-dist/tex/generic/paquete-b/b.tex

name collection-basic
category Collection
depend paquete-c

name collection-otra
category Collection
depend paquete-c

name paquete-c
category Package
catalogue-license mit
runfiles size=1
 texmf-dist/tex/latex/paquete-c/c.sty
`;

describe('tlpdb', () => {
  const db = analizarTlpdb(TLPDB);

  it('lee paquetes, categorías, dependencias y archivos', () => {
    expect(db.size).toBe(6);
    expect(db.get('paquete-a')?.categoria).toBe('Package');
    expect(db.get('paquete-a')?.depend).toEqual(['paquete-b', 'collection-otra']);
    expect(db.get('paquete-a')?.runfiles).toEqual([
      'texmf-dist/tex/latex/paquete-a/a.sty',
      'texmf-dist/fonts/tfm/public/paquete-a/fa.tfm',
      'texmf-dist/fonts/map/dvips/paquete-a/a.map',
    ]);
    expect(db.get('paquete-a')?.licencia).toEqual(['lppl1.3c']);
  });

  it('no mezcla documentación con archivos de ejecución', () => {
    expect(db.get('paquete-a')?.runfiles.some((r) => r.includes('/doc/'))).toBe(false);
  });

  it('resuelve una colección sin seguir otras colecciones ni arquitecturas', () => {
    const r = resolver(db, ['collection-demo']);
    expect(r.paquetes).toEqual(['paquete-a', 'paquete-b']);
    expect(r.paquetes).not.toContain('paquete-c');
  });

  it('informa de nombres ausentes y respeta exclusiones', () => {
    const r = resolver(db, ['paquete-a', 'inexistente'], ['paquete-b']);
    expect(r.paquetes).toEqual(['paquete-a']);
    expect(r.ausentes).toEqual(['inexistente']);
  });

  it('excluye licencias no libres, desconocidas o ausentes', () => {
    const libres = new Set(['lppl1.3c', 'mit']);
    expect(esLibre(['lppl1.3c'], libres)).toBe(true);
    expect(esLibre(['lppl1.3c', 'mit'], libres)).toBe(true);
    expect(esLibre(['nosell'], libres)).toBe(false);
    expect(esLibre(['mit', 'unknown'], libres)).toBe(false);
    expect(esLibre([], libres)).toBe(false);
  });
});

describe('formatos', () => {
  it('asigna el formato por carpeta y extensión', () => {
    const caso = (r) => formatoDeRuta(r)?.formato ?? null;
    expect(caso('texmf-dist/fonts/tfm/public/x/a.tfm')).toBe(3);
    expect(caso('texmf-dist/fonts/vf/public/x/a.vf')).toBe(33);
    expect(caso('texmf-dist/fonts/type1/public/x/a.pfb')).toBe(32);
    expect(caso('texmf-dist/fonts/enc/dvips/x/a.enc')).toBe(44);
    expect(caso('texmf-dist/fonts/map/dvips/x/a.map')).toBe(11);
    expect(caso('texmf-dist/makeindex/x/a.ist')).toBe(35);
    expect(caso('texmf-dist/bibtex/bst/x/a.bst')).toBe(7);
    expect(caso('texmf-dist/bibtex/bib/x/a.bib')).toBe(6);
    expect(caso('texmf-dist/fonts/ofm/x/a.ofm')).toBe(20);
    expect(caso('texmf-dist/fonts/ovf/x/a.ovf')).toBe(23);
    expect(caso('texmf-dist/tex/latex/x/a.sty')).toBe(26);
  });

  it('descarta documentación, fuentes y archivos fuera de texmf-dist', () => {
    expect(formatoDeRuta('texmf-dist/doc/latex/x/a.pdf')).toBeNull();
    expect(formatoDeRuta('texmf-dist/source/latex/x/a.dtx')).toBeNull();
    expect(formatoDeRuta('tlpkg/x/a.tex')).toBeNull();
    expect(formatoDeRuta('texmf-dist/fonts/tfm/public/x/leeme.txt')).toBeNull();
  });

  it('guarda con y sin extensión implícita en los 11 formatos del mapa', () => {
    for (const [formato, sufijo] of Object.entries(SUFIJOS)) {
      expect(variantesDeNombre(Number(formato), `archivo${sufijo}`)).toEqual([`archivo${sufijo}`, 'archivo']);
    }
  });

  it('no inventa variantes para otras extensiones', () => {
    expect(variantesDeNombre(26, 'spanish.ldf')).toEqual(['spanish.ldf']);
    expect(variantesDeNombre(26, 'xcolor.sty')).toEqual(['xcolor.sty']);
    expect(variantesDeNombre(3, '.tfm')).toEqual(['.tfm']);
  });
});

describe('validar y servir', () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'espejo-prueba-'));
  mkdirSync(join(carpeta, '26'));
  writeFileSync(join(carpeta, '26', 'a.sty'), 'hola');
  writeFileSync(join(carpeta, '26', 'sobra.sty'), 'x');
  afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

  it('cuenta encontrados, faltantes, tamaños distintos y sobrantes', () => {
    const r = validar(
      [
        { formato: 26, nombre: 'a.sty', ruta: '/x/a.sty', bytes: 4 },
        { formato: 26, nombre: 'b.sty', ruta: '/x/b.sty', bytes: 4 },
        { formato: 26, nombre: 'a.sty', ruta: '/x/a.sty', bytes: 9 },
        { formato: 26, nombre: 'sobra.sty', ruta: null, bytes: 0 },
        { formato: 26, nombre: 'no.sty', ruta: null, bytes: 0 },
      ],
      carpeta,
    );
    expect(r.encontrados).toBe(1);
    expect(r.faltantes).toEqual(['26/b.sty']);
    expect(r.distintos).toEqual(['26/a.sty']);
    expect(r.sobrantes).toEqual(['26/sobra.sty']);
  });

  it('responde 200 con los bytes exactos y CORS, 404 en faltantes y registra', async () => {
    const servidor = crearServidor(carpeta);
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
    const { port } = servidor.address();
    try {
      const base = `http://127.0.0.1:${port}`;
      const ok = await fetch(`${base}/26/a.sty`);
      expect(ok.status).toBe(200);
      expect(ok.headers.get('access-control-allow-origin')).toBe('*');
      expect(ok.headers.get('content-type')).toBe('application/octet-stream');
      expect(await ok.text()).toBe('hola');
      const no = await fetch(`${base}/26/falta.sty`);
      expect(no.status).toBe(404);
      expect(no.headers.get('access-control-allow-origin')).toBe('*');
      expect((await fetch(`${base}/../../etc/passwd`)).status).toBe(404);
      const registro = await (await fetch(`${base}/__registro.json`)).json();
      expect(registro.map((p) => [p.nombre, p.ruta !== null])).toEqual([
        ['a.sty', true],
        ['falta.sty', false],
      ]);
    } finally {
      await new Promise((ok) => servidor.close(ok));
    }
  });
});
