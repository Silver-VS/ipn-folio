// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARCHIVOS_EN_CACHE } from '../pwa/nombres';
import { CATALOGO, herramienta, megasDe, megasDeHerramienta, textosDe } from './catalogo';
import { ESTADO_INICIAL, normalizar } from './estado';
import tamanos from './tamanos.gen.json';

describe('catálogo de herramientas', () => {
  it('en la capa A solo «Documentos LaTeX» es instalable; el resto no descarga nada', () => {
    expect(CATALOGO.filter((h) => h.disponibilidad === 'instalable').map((h) => h.id)).toEqual(['latex']);
    expect(CATALOGO.filter((h) => h.disponibilidad === 'proximamente').map((h) => h.id)).toEqual([
      'python',
      'r',
      'octave',
    ]);
    expect(CATALOGO.filter((h) => h.disponibilidad === 'escritorio').map((h) => h.id)).toEqual([
      'cpp',
      'java',
    ]);
    for (const h of CATALOGO.filter((x) => x.disponibilidad !== 'instalable')) {
      expect(h.archivos, h.id).toEqual([]);
      expect(h.bytes, h.id).toBe(0);
      expect(megasDeHerramienta(h.id), h.id).toBe(0);
    }
  });

  it('el tamaño de LaTeX es la suma de sus archivos y {megas} es ese total redondeado', () => {
    const latex = herramienta('latex');
    expect(latex.archivos.reduce((s, a) => s + a.bytes, 0)).toBe(latex.bytes);
    expect(megasDeHerramienta('latex')).toBe(megasDe(latex.bytes));
    expect(tamanos.latex.megas).toBe(megasDe(tamanos.latex.bytes));
    expect(megasDe(1)).toBe(1);
    expect(megasDe(127_735_181)).toBe(128);
  });

  it('el manifiesto de tamaños coincide (±1 MB) con activos.json cuando hay activos locales', () => {
    const ruta = 'public/busytex/activos.json';
    if (!existsSync(ruta)) return;
    const activos = JSON.parse(readFileSync(ruta, 'utf8')) as {
      archivos: Array<{ nombre: string; bytes: number }>;
    };
    const suma = herramienta('latex').archivos.reduce(
      (s, a) => s + (activos.archivos.find((x) => x.nombre === a.nombre)?.bytes ?? Number.NaN),
      0,
    );
    expect(Math.abs(suma - herramienta('latex').bytes)).toBeLessThan(1e6);
    expect(suma).toBe(herramienta('latex').bytes);
  });

  it('en la caché del service worker solo van los archivos pequeños; texlive-basic.data va a IndexedDB', () => {
    expect([...ARCHIVOS_EN_CACHE].sort()).toEqual(
      ['busytex.js', 'busytex.wasm', 'busytex_pipeline.js', 'texlive-basic.js', 'texmf.cnf'].sort(),
    );
    const datos = herramienta('latex').archivos.find((a) => a.nombre === 'texlive-basic.data');
    expect(datos?.destino).toBe('indexeddb');
    expect(ARCHIVOS_EN_CACHE).not.toContain('texlive-basic.data');
  });

  it('cada herramienta tiene nombre, sigla y descripción', () => {
    for (const h of CATALOGO) {
      const t = textosDe(h.id);
      expect(t.nombre.length, h.id).toBeGreaterThan(0);
      expect(t.sigla.length, h.id).toBeGreaterThan(0);
      expect(t.descripcion.length, h.id).toBeGreaterThan(0);
    }
  });
});

describe('estado de las herramientas', () => {
  it('lo mal formado cuenta como no instalada', () => {
    for (const malo of [undefined, null, 5, 'x', {}, { estado: 'otra' }]) {
      expect(normalizar(malo), String(malo)).toEqual(ESTADO_INICIAL);
    }
  });

  it('conserva un estado bien formado', () => {
    expect(normalizar({ estado: 'error', bytes: 10, version: '1', error: 'red' })).toEqual({
      estado: 'error',
      bytes: 10,
      version: '1',
      error: 'red',
    });
    expect(normalizar({ estado: 'instalada', bytes: -1, version: 3 })).toEqual({
      estado: 'instalada',
      bytes: 0,
      version: '',
    });
  });
});
