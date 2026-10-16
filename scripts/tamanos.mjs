// SPDX-License-Identifier: AGPL-3.0-or-later
// Mide lo que pesa cada herramienta instalable a partir de public/busytex/activos.json (lo escribe `npm run activos`)
// y lo guarda en src/herramientas/tamanos.gen.json. Los textos nunca llevan cifras fijas: piden {megas} a este manifiesto.
// Sin activos locales no toca el archivo (se conserva el último valor medido). Uso: node scripts/tamanos.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RUTA_ACTIVOS = join(RAIZ, 'public', 'busytex', 'activos.json');
export const RUTA_TAMANOS = join(RAIZ, 'src', 'herramientas', 'tamanos.gen.json');

/** Archivos que descarga «Documentos LaTeX». `destino` dice dónde queda: caché del service worker o IndexedDB (Emscripten). */
export const ARCHIVOS_LATEX = [
  { nombre: 'busytex.js', destino: 'cache' },
  { nombre: 'busytex.wasm', destino: 'cache' },
  { nombre: 'busytex_pipeline.js', destino: 'cache' },
  { nombre: 'texmf.cnf', destino: 'cache' },
  { nombre: 'texlive-basic.js', destino: 'cache' },
  { nombre: 'texlive-basic.data', destino: 'indexeddb' },
];

/** Megas decimales redondeados: lo que se muestra como «unos N MB». */
export const megasDe = (bytes) => Math.max(1, Math.round(bytes / 1e6));

/** @param {{ texlyreBusytex: string, archivos: Array<{ nombre: string, bytes: number }> }} activos */
export function medir(activos) {
  const archivos = ARCHIVOS_LATEX.map(({ nombre, destino }) => {
    const encontrado = activos.archivos.find((a) => a.nombre === nombre);
    if (!encontrado) throw new Error(`activos.json no trae ${nombre}`);
    return { nombre, bytes: encontrado.bytes, destino };
  });
  const suma = (destino) => archivos.filter((a) => a.destino === destino).reduce((s, a) => s + a.bytes, 0);
  const bytes = archivos.reduce((s, a) => s + a.bytes, 0);
  return {
    busytex: activos.texlyreBusytex,
    latex: {
      archivos,
      bytes,
      bytesCache: suma('cache'),
      bytesIndexedDb: suma('indexeddb'),
      megas: megasDe(bytes),
    },
  };
}

export function generar() {
  if (!existsSync(RUTA_ACTIVOS)) {
    console.log('tamanos: sin public/busytex/activos.json; se conserva src/herramientas/tamanos.gen.json');
    return false;
  }
  const medido = medir(JSON.parse(readFileSync(RUTA_ACTIVOS, 'utf8')));
  const texto = JSON.stringify(medido, null, 2) + '\n';
  if (!existsSync(RUTA_TAMANOS) || readFileSync(RUTA_TAMANOS, 'utf8') !== texto)
    writeFileSync(RUTA_TAMANOS, texto);
  console.log(`tamanos: LaTeX pesa ${medido.latex.bytes} bytes (unos ${medido.latex.megas} MB)`);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) generar();
