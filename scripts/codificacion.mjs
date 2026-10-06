// SPDX-License-Identifier: AGPL-3.0-or-later
// Comprueba que es.toml no tenga señales de codificación rota: letra+`?`+letra (acento o ñ perdidos)
// o el carácter de reemplazo U+FFFD. Uso: node scripts/codificacion.mjs
// `revisarCodificacion(texto)` es pura (la usan las pruebas). Devuelve una lista de errores.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { RUTA_TEXTOS } from './lib/textos.mjs';

export function revisarCodificacion(texto, nombre = 'es.toml') {
  const errores = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    if (linea.includes('�')) errores.push(`${nombre}:${i + 1}: contiene U+FFFD (codificación rota)`);
    const m = /\p{L}\?\p{L}/u.exec(linea);
    if (m) errores.push(`${nombre}:${i + 1}: «${m[0]}» parece una letra acentuada o ñ perdida`);
  });
  return errores;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errores = revisarCodificacion(readFileSync(RUTA_TEXTOS, 'utf8'));
  for (const e of errores) console.error(`error: ${e}`);
  console.log(`codificación: ${errores.length} errores`);
  process.exit(errores.length ? 1 : 0);
}
