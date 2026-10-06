// SPDX-License-Identifier: AGPL-3.0-or-later
// Formatos de archivo de kpathsea que BusyTeX pide al espejo: `GET <endpoint>/<formato>/<archivo>` (D8).
// Sin dependencias.

/** Extensión implícita de cada formato [V: mapa de pruebas/compilacion/servidor.mjs]. */
export const SUFIJOS = {
  3: '.tfm',
  6: '.bib',
  7: '.bst',
  11: '.map',
  20: '.ofm',
  23: '.ovf',
  26: '.tex',
  32: '.pfb',
  33: '.vf',
  35: '.ist',
  44: '.enc',
};

/** Nombre de formato para `kpsewhich -format=…` (kpsewhich no acepta el número) [V]. */
export const NOMBRES_KPSE = {
  3: 'tfm',
  6: 'bib',
  7: 'bst',
  11: 'map',
  20: 'ofm',
  23: 'ovf',
  26: 'tex',
  32: 'type1 fonts',
  33: 'vf',
  35: 'ist',
  44: 'enc files',
};

/** Carpeta de texmf-dist (prefijo) → formato. Gana la primera que coincide. */
const CARPETAS = /** @type {[string, number][]} */ ([
  ['fonts/tfm/', 3],
  ['fonts/ofm/', 20],
  ['fonts/ovf/', 23],
  ['fonts/vf/', 33],
  ['fonts/type1/', 32],
  ['fonts/enc/', 44],
  ['fonts/map/', 11],
  ['makeindex/', 35],
  ['bibtex/bst/', 7],
  ['bibtex/bib/', 6],
  ['tex/', 26],
]);

/** Extensiones admitidas por formato (el formato 26 admite cualquiera: .sty, .cls, .def, .fd…). */
const EXTENSIONES = /** @type {Record<number, string[]>} */ ({
  3: ['.tfm'],
  6: ['.bib'],
  7: ['.bst'],
  11: ['.map'],
  20: ['.ofm'],
  23: ['.ovf'],
  32: ['.pfb', '.pfa'],
  33: ['.vf'],
  35: ['.ist'],
  44: ['.enc'],
});

/**
 * Formato kpathsea de un archivo de TeX Live a partir de su ruta relativa a la raíz (`texmf-dist/...`).
 * Devuelve null si no es un archivo que el espejo deba servir.
 * @param {string} ruta @returns {{ formato: number, nombre: string } | null}
 */
export function formatoDeRuta(ruta) {
  const m = ruta.replace(/\\/g, '/').match(/^texmf-dist\/(.+)$/);
  if (!m) return null;
  const rel = /** @type {string} */ (m[1]);
  const nombre = rel.slice(rel.lastIndexOf('/') + 1);
  for (const [prefijo, formato] of CARPETAS) {
    if (!rel.startsWith(prefijo)) continue;
    const exts = EXTENSIONES[formato];
    if (exts && !exts.some((e) => nombre.toLowerCase().endsWith(e))) return null;
    return { formato, nombre };
  }
  return null;
}

/**
 * Nombres bajo los que se guarda un archivo: el exacto y, si lleva la extensión implícita del formato,
 * también sin ella (kpathsea pide, p. ej., los TFM y algunos `.tex` sin extensión).
 * @param {number} formato @param {string} archivo @returns {string[]}
 */
export function variantesDeNombre(formato, archivo) {
  const sufijo = /** @type {Record<number, string>} */ (SUFIJOS)[formato];
  const nombres = [archivo];
  if (sufijo && archivo.toLowerCase().endsWith(sufijo) && archivo.length > sufijo.length) {
    nombres.push(archivo.slice(0, -sufijo.length));
  }
  return nombres;
}
