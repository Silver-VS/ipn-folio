// SPDX-License-Identifier: AGPL-3.0-or-later
// Convierte contenido/textos/es.toml (y los textos comunes de @ipn/comun) en src/textos/es.gen.ts,
// con el tipo ClaveTexto: usar una clave inexistente es error de compilación.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RAIZ, leerTextosComun, leerTextosFolio, variablesDe } from './lib/textos.mjs';

export function generar() {
  const folio = leerTextosFolio();
  const comun = leerTextosComun();
  const ordenar = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  const f = ordenar(folio.textos);
  const c = ordenar(comun.textos);

  const conVariables = {};
  for (const [clave, plantilla] of Object.entries({ ...c, ...f })) {
    const vars = variablesDe(plantilla);
    if (vars.length) conVariables[clave] = vars;
  }
  const lineasVars = Object.entries(conVariables).map(
    ([clave, vars]) =>
      `  ${JSON.stringify(clave)}: { ${vars.map((v) => `${v}: string | number`).join('; ')} };`,
  );

  return [
    '// GENERADO desde contenido/textos/es.toml y @ipn/comun (dist/textos/comun.es.json); no editar',
    '// SPDX-License-Identifier: CC0-1.0',
    '',
    `export const VERSION_TEXTOS = ${JSON.stringify(folio.version)};`,
    `export const VERSION_TEXTOS_COMUN = ${JSON.stringify(comun.version)};`,
    '',
    `export const TEXTOS_FOLIO = ${JSON.stringify(f, null, 2)} as const;`,
    '',
    `export const TEXTOS_COMUN: Readonly<Record<string, string>> = ${JSON.stringify(c, null, 2)};`,
    '',
    `export type ClaveComun = ${
      Object.keys(c)
        .map((k) => JSON.stringify(k))
        .join(' | ') || 'never'
    };`,
    'export type ClaveFolio = keyof typeof TEXTOS_FOLIO;',
    'export type ClaveTexto = ClaveFolio | ClaveComun;',
    '',
    '/** Variables que exige cada clave con {variables}; las claves sin variables no aparecen. */',
    'export interface VariablesPorClave {',
    ...lineasVars,
    '}',
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const destino = join(RAIZ, 'src', 'textos', 'es.gen.ts');
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, generar(), 'utf8');
  console.log('textos: src/textos/es.gen.ts generado');
}
