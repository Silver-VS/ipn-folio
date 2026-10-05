// SPDX-License-Identifier: AGPL-3.0-or-later
// Lectura compartida de textos TOML y de lo común (@ipn/comun) para textos.mjs y contenido.mjs.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RUTA_TEXTOS = join(RAIZ, 'contenido', 'textos', 'es.toml');
export const RUTA_COMUN = join(RAIZ, 'node_modules', '@ipn', 'comun');

/** Aplana tablas anidadas a claves con puntos. Devuelve { version, textos }. */
export function aplanarToml(crudo) {
  const datos = parse(crudo);
  const textos = {};
  const recorrer = (obj, prefijo) => {
    for (const [k, v] of Object.entries(obj)) {
      const clave = prefijo ? `${prefijo}.${k}` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) recorrer(v, clave);
      else if (!prefijo && k === 'version') continue;
      else textos[clave] = v;
    }
  };
  recorrer(datos, '');
  return { version: String(datos.version ?? ''), textos };
}

export function leerTextosFolio(ruta = RUTA_TEXTOS) {
  return aplanarToml(readFileSync(ruta, 'utf8'));
}

/** Textos comunes ya generados por ipn-comun (dist/textos/comun.es.json). */
export function leerTextosComun(ruta = RUTA_COMUN) {
  const json = JSON.parse(readFileSync(join(ruta, 'dist', 'textos', 'comun.es.json'), 'utf8'));
  return { version: String(json.version ?? ''), textos: json.textos };
}

/** Palabras vetadas de la voz editorial (glosario de ipn-comun). */
export function leerVetadas(ruta = RUTA_COMUN) {
  const { vetadas } = parse(readFileSync(join(ruta, 'contenido', 'glosario.toml'), 'utf8'));
  return Array.isArray(vetadas) ? vetadas.map(String) : [];
}

/** Nombres de variables {nombre} de una plantilla (incluye las de las ramas de un plural). */
export function variablesDe(plantilla) {
  const nombres = new Set();
  for (const m of String(plantilla).matchAll(/\{\s*([a-z_][a-z0-9_]*)\s*[,}]/g)) nombres.add(m[1]);
  return [...nombres].sort();
}
