// SPDX-License-Identifier: AGPL-3.0-or-later
// Pruebas del generador del espejo con fixtures inventados; no requieren TeX Live instalado.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SUFIJOS, formatoDeRuta, nombreServido, variantesDeNombre } from './formatos.mjs';
import { analizarTlpdb, archivosDeLicencia, esLibre, licenciaEfectiva, resolver } from './tlpdb.mjs';
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
 texmf-dist/doc/latex/paquete-a/LICENSE.txt
 texmf-dist/doc\\latex\\paquete-a\\COPYING
 texmf-dist/doc/latex/paquete-a/OFL-FAQ.txt
 texmf-dist/doc/latex/paquete-a/license.pdf
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

  it('lee los textos de licencia de doc/ y normaliza rutas con barra invertida', () => {
    expect(archivosDeLicencia(/** @type {any} */ (db.get('paquete-a')))).toEqual([
      'texmf-dist/doc/latex/paquete-a/LICENSE.txt',
      'texmf-dist/doc/latex/paquete-a/COPYING',
    ]);
  });

  it('la etiqueta «collection» no es una licencia; solo una verificación a mano la resuelve', () => {
    const libres = new Set(['lppl', 'gpl']);
    const p = {
      nombre: 'x',
      categoria: 'Package',
      depend: [],
      runfiles: [],
      docfiles: [],
      licencia: ['collection'],
    };
    expect(esLibre(licenciaEfectiva(p), libres)).toBe(false);
    expect(esLibre(licenciaEfectiva(p, { x: ['gpl'] }), libres)).toBe(true);
  });

  it('paquetes.json no acepta «collection» ni «artistic» como licencia libre', () => {
    const config = JSON.parse(readFileSync(new URL('./paquetes.json', import.meta.url), 'utf8'));
    expect(config.licenciasLibres).not.toContain('collection');
    expect(config.licenciasLibres).not.toContain('artistic');
    expect(Object.keys(config.licenciasVerificadas ?? {}).sort()).toEqual([
      'frankenstein',
      'preprint',
      'was',
    ]);
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

  it('sirve los .fd con el nombre que pide LaTeX (minúsculas) y el resto con su nombre original', () => {
    expect(nombreServido(26, 'T1Montserrat-TLF.fd')).toBe('t1montserrat-tlf.fd');
    expect(formatoDeRuta('texmf-dist/tex/latex/montserrat/T1Montserrat-LF.fd')).toEqual({
      formato: 26,
      nombre: 't1montserrat-lf.fd',
    });
    expect(nombreServido(26, 'Montserrat.sty')).toBe('Montserrat.sty');
    expect(nombreServido(3, 'Montserrat-TLF.fd')).toBe('Montserrat-TLF.fd');
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
  writeFileSync(join(carpeta, '26', 'T1Demo-LF.fd'), 'fd');
  writeFileSync(join(carpeta, 'secreto.txt'), 'no salir');
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

  it('validar distingue mayúsculas aunque el disco no lo haga', () => {
    const r = validar(
      [
        { formato: 26, nombre: 'T1Demo-LF.fd', ruta: '/x', bytes: 2 },
        { formato: 26, nombre: 't1demo-lf.fd', ruta: '/x', bytes: 2 },
        { formato: 26, nombre: 'SOBRA.STY', ruta: null, bytes: 0 },
      ],
      carpeta,
    );
    expect(r.encontrados).toBe(1);
    expect(r.faltantes).toEqual(['26/t1demo-lf.fd']);
    expect(r.sobrantes).toEqual([]);
  });

  it('servir responde 404 si el nombre difiere en mayúsculas, como GitHub Pages', async () => {
    const servidor = crearServidor(carpeta);
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
    const { port } = servidor.address();
    try {
      const base = `http://127.0.0.1:${port}`;
      expect((await fetch(`${base}/26/T1Demo-LF.fd`)).status).toBe(200);
      expect((await fetch(`${base}/26/t1demo-lf.fd`)).status).toBe(404);
      expect((await fetch(`${base}/26/A.sty`)).status).toBe(404);
    } finally {
      await new Promise((ok) => servidor.close(ok));
    }
  });

  /** Petición con la ruta sin normalizar (fetch resolvería «..» antes de enviarla). */
  const cruda = (/** @type {number} */ puerto, /** @type {string} */ ruta) =>
    new Promise((ok, fallo) => {
      request({ host: '127.0.0.1', port: puerto, path: ruta }, (res) => {
        let cuerpo = '';
        res.on('data', (d) => (cuerpo += d));
        res.on('end', () => ok({ status: res.statusCode, cuerpo }));
      })
        .on('error', fallo)
        .end();
    });

  it('servir no sale de la raíz (path traversal)', async () => {
    const servidor = crearServidor(join(carpeta, '26'));
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
    const { port } = servidor.address();
    try {
      for (const ruta of [
        '/../secreto.txt',
        '/%2e%2e/secreto.txt',
        '/..%2fsecreto.txt',
        '/%2e%2e%2fsecreto.txt',
        '/..%5csecreto.txt',
        '/%5c..%5csecreto.txt',
        '/..%5c..%5csecreto.txt',
        '/a.sty%00.txt',
      ]) {
        const r = /** @type {{ status: number, cuerpo: string }} */ (await cruda(port, ruta));
        expect([400, 403, 404], ruta).toContain(r.status);
        expect(r.cuerpo, ruta).not.toContain('no salir');
      }
    } finally {
      await new Promise((ok) => servidor.close(ok));
    }
  });

  it('/__registro.json solo lleva CORS para los orígenes de desarrollo configurados', async () => {
    const servidor = crearServidor(carpeta, { origenesRegistro: ['http://localhost:5173'] });
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
    const { port } = servidor.address();
    try {
      const base = `http://127.0.0.1:${port}/__registro.json`;
      expect((await fetch(base)).headers.get('access-control-allow-origin')).toBeNull();
      const dev = await fetch(base, { headers: { Origin: 'http://localhost:5173' } });
      expect(dev.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
      const otro = await fetch(base, { headers: { Origin: 'https://ejemplo.org' } });
      expect(otro.headers.get('access-control-allow-origin')).toBeNull();
      // Las rutas del registro son relativas al espejo: no revelan carpetas del equipo.
      await fetch(`http://127.0.0.1:${port}/26/a.sty`);
      const reg = await (await fetch(base)).json();
      expect(reg.at(-1).ruta).toBe('26/a.sty');
    } finally {
      await new Promise((ok) => servidor.close(ok));
    }
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
