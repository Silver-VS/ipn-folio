// SPDX-License-Identifier: AGPL-3.0-or-later
// Prepara public/busytex/ con los activos de BusyTeX que Folio usa (solo el paquete de datos «basic»).
//
// Uso:
//   node scripts/activos.mjs                          descarga ~520 MB con el CLI de texlyre-busytex
//   node scripts/activos.mjs --desde-prueba[=carpeta] copia los activos ya descargados por pruebas/compilacion
//
// Los activos no se versionan (public/busytex/ y .cache-activos/ están en .gitignore). Se escribe
// public/busytex/activos.json con nombre, bytes y SHA-256 de cada archivo (la sesión 07 lo usa para
// mostrar tamaños al usuario, D11).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'public', 'busytex');
const CACHE = join(RAIZ, '.cache-activos');

/** Archivos que se copian a public/busytex/ (busytex_worker.js es solo de referencia: Folio no lo usa). */
export const ARCHIVOS = [
  'busytex.js',
  'busytex.wasm',
  'busytex_pipeline.js',
  'busytex_worker.js',
  'texmf.cnf',
  'texlive-basic.js',
  'texlive-basic.data',
  'versions.txt',
];

function sha256(ruta) {
  return new Promise((resolver, rechazar) => {
    const hash = createHash('sha256');
    createReadStream(ruta)
      .on('data', (trozo) => hash.update(trozo))
      .on('end', () => resolver(hash.digest('hex')))
      .on('error', rechazar);
  });
}

function carpetaDeActivos(argumentos) {
  const desdePrueba = argumentos.find((a) => a === '--desde-prueba' || a.startsWith('--desde-prueba='));
  if (desdePrueba) {
    const valor = desdePrueba.split('=')[1];
    const origen = resolve(valor ?? join(RAIZ, 'pruebas', 'compilacion', 'public', 'core', 'busytex'));
    if (!existsSync(join(origen, 'busytex.wasm'))) {
      throw new Error(
        `No hay activos de la prueba en ${origen}. Pasa --desde-prueba=<carpeta con busytex.wasm> o corre sin la opción para descargarlos.`,
      );
    }
    return origen;
  }
  const origen = join(CACHE, 'busytex');
  if (!existsSync(join(origen, 'busytex.wasm'))) {
    const cli = join(RAIZ, 'node_modules', 'texlyre-busytex', 'scripts', 'cli.cjs');
    const r = spawnSync(process.execPath, [cli, 'download-assets', CACHE], { stdio: 'inherit' });
    if (r.status !== 0)
      throw new Error('La descarga de los activos falló. Revisa la conexión y vuelve a intentar.');
  }
  return origen;
}

async function principal() {
  const origen = carpetaDeActivos(process.argv.slice(2));
  mkdirSync(DESTINO, { recursive: true });
  const registro = [];
  for (const nombre of ARCHIVOS) {
    const desde = join(origen, nombre);
    if (!existsSync(desde)) throw new Error(`Falta ${nombre} en ${origen}`);
    const hasta = join(DESTINO, nombre);
    copyFileSync(desde, hasta);
    registro.push({ nombre, bytes: statSync(hasta).size, sha256: await sha256(hasta) });
  }
  const paquete = JSON.parse(
    readFileSync(join(RAIZ, 'node_modules', 'texlyre-busytex', 'package.json'), 'utf8'),
  );
  const activos = { texlyreBusytex: paquete.version, archivos: registro };
  writeFileSync(join(DESTINO, 'activos.json'), JSON.stringify(activos, null, 2) + '\n');
  const total = registro.reduce((s, a) => s + a.bytes, 0);
  console.log(
    `Listo: ${registro.length} archivos en public/busytex/ (${(total / 1048576).toFixed(1)} MB sin comprimir).`,
  );
}

principal().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
