// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, rmdirSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { validar } from '@ipn/comun/herramientas/lib/esquema.mjs';
import { pluginPlantillasLocales } from './lib/plantillas-locales.mjs';

it('el control de producción falla por cada marcador local en contenido o nombres', () => {
  mkdirSync('test-results', { recursive: true });
  const raiz = mkdtempSync(join('test-results', 'control-dist-'));
  const dist = join(raiz, 'dist');
  mkdirSync(dist);
  const comprobar = () =>
    spawnSync(process.execPath, [resolve('scripts/validar-dist.mjs')], {
      cwd: raiz,
      encoding: 'utf8',
    });
  try {
    expect(comprobar().status).toBe(0);
    for (const marcador of ['plantillas-locales', 'UpiiTeXis', 'TT_UPIITA']) {
      const archivo = join(dist, 'prueba.js');
      writeFileSync(archivo, `const ruta = '${marcador}';`, 'utf8');
      const resultado = comprobar();
      expect(resultado.status).toBe(1);
      expect(resultado.stderr).toContain('referencia local en producción');
      rmSync(archivo);
      const carpeta = join(dist, marcador);
      mkdirSync(carpeta);
      expect(comprobar().status).toBe(1);
      rmdirSync(carpeta);
    }
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

it('valida el catálogo contra su esquema y rechaza rutas y propiedades ajenas', () => {
  const esquema = JSON.parse(readFileSync('public/plantillas/catalogo.schema.json', 'utf8'));
  const catalogo = JSON.parse(readFileSync('public/plantillas/catalogo.json', 'utf8'));
  expect(validar(catalogo, esquema)).toEqual([]);
  expect(esquema.items.properties.archivos.items.pattern.startsWith('^(?!/)')).toBe(true);
  for (const ruta of ['/etc/x.tex', '../privado.tex', 'C:/x.tex', 'carpeta\\x.tex']) {
    expect(validar([{ ...catalogo[0], archivos: [ruta] }], esquema), ruta).toHaveLength(1);
  }
  expect(validar([{ ...catalogo[0], archivos: ['../privado.tex'], extra: true }], esquema)).toHaveLength(2);
});

it('solo sirve fuentes locales en desarrollo y rechaza rutas fuera de su lista', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'folio-plantillas-'));
  try {
    const carpeta = join(raiz, 'plantillas-locales/TT_UPIITA_2023');
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(join(carpeta, 'Principal.tex'), 'Documento ficticio');
    writeFileSync(join(carpeta, 'privado.txt'), 'excluido');
    const plugin = pluginPlantillasLocales(raiz);
    expect(plugin.apply).toBe('serve');
    let servir;
    plugin.configureServer({
      middlewares: {
        use(fn) {
          servir = fn;
        },
      },
    });
    const respuesta = (ruta) => {
      let cuerpo;
      const res = {
        statusCode: 200,
        setHeader() {},
        end(c) {
          cuerpo = c;
        },
      };
      servir({ url: `/plantillas-locales/${ruta}` }, res, () => {});
      return { cuerpo, status: res.statusCode };
    };
    expect(JSON.parse(respuesta('catalogo.json').cuerpo)[0].archivos).toEqual(['Principal.tex']);
    expect(respuesta('tt-upiita-2023/Principal.tex').cuerpo.toString()).toBe('Documento ficticio');
    expect(respuesta('tt-upiita-2023/privado.txt').status).toBe(404);
    expect(respuesta('tt-upiita-2023/%2e%2e%2fprivado.txt').status).toBe(404);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

it('el build de producción excluye fuentes locales y referencias a UpiiTeXis', async () => {
  const { build } = await import('vite');
  const raiz = mkdtempSync(join(tmpdir(), 'folio-build-'));
  try {
    mkdirSync(join(raiz, 'plantillas-locales/TT_UPIITA_2023'), { recursive: true });
    writeFileSync(
      join(raiz, 'plantillas-locales/TT_UPIITA_2023/Principal.tex'),
      'MARCADOR_PRIVADO_UPIITEXIS',
    );
    writeFileSync(join(raiz, 'index.html'), '<script type="module" src="/main.js"></script>');
    writeFileSync(join(raiz, 'main.js'), 'document.body.textContent = "Prueba"');
    await build({
      root: raiz,
      configFile: false,
      plugins: [pluginPlantillasLocales(raiz)],
      logLevel: 'silent',
    });
    const comprobar = (dir) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        expect(entrada.name).not.toMatch(/Principal|TT_UPIITA|plantillas-locales/i);
        const ruta = join(dir, entrada.name);
        if (entrada.isDirectory()) comprobar(ruta);
        else
          expect(readFileSync(ruta, 'utf8')).not.toMatch(
            /MARCADOR_PRIVADO_UPIITEXIS|UpiiTeXis|plantillas-locales/,
          );
      }
    };
    comprobar(join(raiz, 'dist'));
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}, 30000);
