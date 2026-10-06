// SPDX-License-Identifier: AGPL-3.0-or-later
// Revisa las licencias de las dependencias de producción contra la lista compatible con AGPL-3.0.
// Uso: node scripts/licencias.mjs. Sin dependencias.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const PERMITIDAS = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Apache-2.0',
  'MPL-2.0',
  'Unlicense',
  'CC0-1.0',
  'OFL-1.1',
  'LGPL-3.0-or-later',
  'GPL-3.0-or-later',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
]);

/** Parte `texto` por el operador (OR / AND) solo en el nivel superior, fuera de paréntesis. */
function dividir(texto, operador) {
  const partes = [];
  let nivel = 0;
  let actual = '';
  for (const palabra of texto.split(/\s+/)) {
    if (nivel === 0 && palabra.toUpperCase() === operador) {
      partes.push(actual.trim());
      actual = '';
      continue;
    }
    for (const c of palabra) nivel += c === '(' ? 1 : c === ')' ? -1 : 0;
    actual += ' ' + palabra;
  }
  partes.push(actual.trim());
  return partes;
}

/** Quita un par de paréntesis que envuelva toda la expresión. */
function sinEnvolver(texto) {
  if (!texto.startsWith('(') || !texto.endsWith(')')) return texto;
  let nivel = 0;
  for (let i = 0; i < texto.length; i++) {
    nivel += texto[i] === '(' ? 1 : texto[i] === ')' ? -1 : 0;
    if (nivel === 0 && i < texto.length - 1) return texto;
  }
  return texto.slice(1, -1).trim();
}

/**
 * 'permitida' | 'prohibida' | 'revisar' para una expresión SPDX (OR / AND / paréntesis).
 * Precedencia SPDX: los paréntesis primero, luego AND (liga más fuerte) y al final OR.
 */
export function evaluar(expresion) {
  const texto = String(expresion ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!texto) return 'revisar';
  const limpio = sinEnvolver(texto);
  if (limpio !== texto) return evaluar(limpio);
  const alternativas = dividir(texto, 'OR');
  if (alternativas.length > 1) {
    const partes = alternativas.map(evaluar);
    if (partes.includes('permitida')) return 'permitida';
    return partes.every((p) => p === 'prohibida') ? 'prohibida' : 'revisar';
  }
  const conjuntos = dividir(texto, 'AND');
  if (conjuntos.length > 1) {
    const partes = conjuntos.map(evaluar);
    if (partes.includes('prohibida')) return 'prohibida';
    return partes.every((p) => p === 'permitida') ? 'permitida' : 'revisar';
  }
  // «GPL-2.0+» y «GPL-2.0-or-later» equivalen y son compatibles con AGPL-3.0.
  if (PERMITIDAS.has(texto) || /^GPL-2\.0(\+|-or-later)$/i.test(texto)) return 'permitida';
  if (
    /^(GPL-2\.0|LGPL-2|AGPL-1|SSPL|BUSL|CC-BY-NC|Commons-Clause|UNLICENSED$)/i.test(texto) &&
    !/or-later/i.test(texto)
  )
    return 'prohibida';
  return 'revisar';
}

function licenciaDe(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(' OR ');
  return '';
}

function arbolProduccion() {
  const args = ['ls', '--omit=dev', '--all', '--json', '--long'];
  const npm = process.env.npm_execpath;
  const r = npm
    ? spawnSync(process.execPath, [npm, ...args], {
        cwd: RAIZ,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      })
    : spawnSync('npm', args, { cwd: RAIZ, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  try {
    return JSON.parse(r.stdout);
  } catch {
    console.error('licencias: no se pudo leer la salida de «npm ls»');
    console.error(r.stderr);
    process.exit(1);
  }
}

function recolectar(nodo, acumulado) {
  for (const [dep, hijo] of Object.entries(nodo.dependencies ?? {})) {
    const ruta =
      hijo.path && existsSync(join(hijo.path, 'package.json')) ? hijo.path : join(RAIZ, 'node_modules', dep);
    const clave = `${dep}@${hijo.version ?? '?'}`;
    if (acumulado.has(clave)) continue;
    const archivo = join(ruta, 'package.json');
    const licencia = existsSync(archivo) ? licenciaDe(JSON.parse(readFileSync(archivo, 'utf8'))) : '';
    acumulado.set(clave, { nombre: dep, version: hijo.version ?? '?', licencia });
    recolectar(hijo, acumulado);
  }
  return acumulado;
}

function principal() {
  const paquetes = [...recolectar(arbolProduccion(), new Map()).values()].sort((a, b) =>
    a.nombre.localeCompare(b.nombre),
  );
  const anchoNombre = Math.max(...paquetes.map((p) => p.nombre.length), 7);
  const anchoVersion = Math.max(...paquetes.map((p) => p.version.length), 7);
  console.log(`${'paquete'.padEnd(anchoNombre)} · ${'versión'.padEnd(anchoVersion)} · licencia`);
  let fallos = 0;
  for (const p of paquetes) {
    const estado = evaluar(p.licencia);
    const marca =
      estado === 'permitida' ? '' : estado === 'prohibida' ? '  <- NO PERMITIDA' : '  <- revisar a mano';
    console.log(
      `${p.nombre.padEnd(anchoNombre)} · ${p.version.padEnd(anchoVersion)} · ${p.licencia || '(sin licencia)'}${marca}`,
    );
    if (estado !== 'permitida') fallos++;
  }
  console.log(`licencias: ${paquetes.length} paquetes de producción, ${fallos} por resolver`);
  process.exit(fallos ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
