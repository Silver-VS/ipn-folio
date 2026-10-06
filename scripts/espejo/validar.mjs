// SPDX-License-Identifier: AGPL-3.0-or-later
// Comprueba un registro de peticiones de BusyTeX (`[{ formato, nombre, ruta, bytes }]`) contra el espejo.
// Uso: node scripts/espejo/validar.mjs <registro.json> [--espejo espejo-local]
// - `ruta` no nula: el archivo <formato>/<nombre> debe existir y pesar lo mismo.
// - La comparación distingue mayúsculas aunque el disco no (lee el listado del directorio).
// - `ruta` nula (TeX Live nativo no lo encontró): no debe existir; si existe, se avisa.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crearBuscadorExacto } from './exacto.mjs';

/**
 * @param {{ formato: number, nombre: string, ruta: string | null, bytes: number }[]} registro
 * @param {string} espejo carpeta del espejo
 */
export function validar(registro, espejo) {
  const faltantes = [];
  const distintos = [];
  const sobrantes = [];
  let esperados = 0;
  let encontrados = 0;
  const tamanoExacto = crearBuscadorExacto();
  for (const p of registro) {
    // Un nombre con separador (/ o \) nunca es un archivo del espejo (cada formato es una carpeta plana).
    const bytes = /[\\/]/.test(p.nombre) ? null : tamanoExacto(join(espejo, String(p.formato), p.nombre));
    const hay = bytes !== null;
    if (p.ruta) {
      esperados++;
      if (!hay) faltantes.push(`${p.formato}/${p.nombre}`);
      else if (bytes !== p.bytes) distintos.push(`${p.formato}/${p.nombre}`);
      else encontrados++;
    } else if (hay) {
      sobrantes.push(`${p.formato}/${p.nombre}`);
    }
  }
  return { total: registro.length, esperados, encontrados, faltantes, distintos, sobrantes };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const iEsp = args.indexOf('--espejo');
  const espejo = resolve(
    iEsp >= 0
      ? (args[iEsp + 1] ?? '')
      : join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'espejo-local'),
  );
  const archivo = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--espejo');
  if (!archivo) {
    console.error('Uso: validar.mjs <registro.json> [--espejo carpeta]');
    process.exit(2);
  }
  const r = validar(JSON.parse(readFileSync(resolve(archivo), 'utf8')), espejo);
  const lineas = [
    `Peticiones: ${r.total}. Con archivo en TeX Live nativo: ${r.esperados}.`,
    `Encontrados con el mismo tamaño: ${r.encontrados} de ${r.esperados}.`,
  ];
  if (r.faltantes.length) lineas.push(`Faltan (${r.faltantes.length}): ${r.faltantes.join(', ')}`);
  if (r.distintos.length) lineas.push(`Tamaño distinto (${r.distintos.length}): ${r.distintos.join(', ')}`);
  lineas.push(
    r.sobrantes.length
      ? `AVISO: el espejo tiene ${r.sobrantes.length} archivo(s) que TeX Live nativo no encontró: ${r.sobrantes.join(', ')}`
      : 'Ningún archivo presente donde TeX Live nativo devolvió 404.',
  );
  console.log(lineas.slice(0, 20).join('\n'));
  process.exit(r.faltantes.length || r.distintos.length || r.sobrantes.length ? 1 : 0);
}
