// SPDX-License-Identifier: AGPL-3.0-or-later
// Servidor estático del espejo para desarrollo: se comporta como GitHub Pages en otro origen.
// Uso: node scripts/espejo/servir.mjs [--puerto 8766] [--espejo espejo-local]
// Archivos puros (sin kpsewhich: D3), CORS abierto, 404 reales y `application/octet-stream`.
// Las peticiones se anotan en memoria y se exponen en /__registro.json (solo local) para medir.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * @param {string} espejo carpeta raíz
 * @returns {import('node:http').Server & { registro: { formato: number, nombre: string, ruta: string | null, bytes: number }[] }}
 */
export function crearServidor(espejo) {
  const raiz = resolve(espejo);
  /** @type {{ formato: number, nombre: string, ruta: string | null, bytes: number }[]} */
  const registro = [];
  const servidor = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.statusCode = 204;
      return res.end();
    }
    let url;
    try {
      url = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    } catch {
      res.statusCode = 400;
      return res.end();
    }
    if (url === '/__registro.json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(registro, null, 1));
    }
    const archivo = resolve(raiz, '.' + url);
    if (archivo !== raiz && !archivo.startsWith(raiz + sep)) {
      res.statusCode = 403;
      return res.end();
    }
    const partes = url.match(/^\/(\d+)\/([^/]+)$/);
    const existe = existsSync(archivo) && statSync(archivo).isFile();
    if (partes) {
      registro.push({
        formato: Number(partes[1]),
        nombre: partes[2] ?? '',
        ruta: existe ? archivo : null,
        bytes: existe ? statSync(archivo).size : 0,
      });
    }
    if (!existe) {
      res.statusCode = 404;
      return res.end();
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', statSync(archivo).size);
    if (req.method === 'HEAD') return res.end();
    createReadStream(archivo).pipe(res);
  });
  return Object.assign(servidor, { registro });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const val = (/** @type {string} */ k, /** @type {string} */ d) => {
    const i = args.indexOf(k);
    return i >= 0 ? (args[i + 1] ?? d) : d;
  };
  const espejo = resolve(
    val('--espejo', join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'espejo-local')),
  );
  const puerto = Number(val('--puerto', '8766'));
  if (!existsSync(espejo)) {
    console.error(`No existe ${espejo}. Ejecuta primero: npm run espejo:generar`);
    process.exit(1);
  }
  crearServidor(espejo).listen(puerto, '127.0.0.1', () =>
    console.log(`Espejo en http://localhost:${puerto}/<formato>/<archivo> (carpeta ${espejo})`),
  );
}
