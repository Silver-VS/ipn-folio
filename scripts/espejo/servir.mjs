// SPDX-License-Identifier: AGPL-3.0-or-later
// Servidor estático del espejo para desarrollo: se comporta como GitHub Pages en otro origen.
// Uso: node scripts/espejo/servir.mjs [--puerto <n>] [--espejo espejo-local]
// Archivos puros (sin kpsewhich: D3), CORS abierto en los archivos, 404 reales, `application/octet-stream`
// y nombres con distinción de mayúsculas aunque el disco no la tenga (como GitHub Pages).
// Las peticiones se anotan en memoria y se exponen en /__registro.json (solo local) para medir; esa ruta
// solo lleva CORS para los orígenes de desarrollo de `servidor.origenesRegistro` en paquetes.json.
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crearBuscadorExacto } from './exacto.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
/** Tope de peticiones anotadas (se descartan las más antiguas). */
const MAX_REGISTRO = 5000;

/** @typedef {{ formato: number, nombre: string, ruta: string | null, bytes: number }} Peticion */

/**
 * @param {string} espejo carpeta raíz
 * @param {{ origenesRegistro?: string[] }} [opciones]
 * @returns {import('node:http').Server & { registro: Peticion[] }}
 */
export function crearServidor(espejo, opciones = {}) {
  const raiz = resolve(espejo);
  const origenesRegistro = new Set(opciones.origenesRegistro ?? []);
  const tamanoExacto = crearBuscadorExacto();
  /** @type {Peticion[]} */
  const registro = [];
  const servidor = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    let url;
    try {
      url = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    } catch {
      res.statusCode = 400;
      return res.end();
    }
    if (url === '/__registro.json') {
      const origen = req.headers.origin;
      if (origen && origenesRegistro.has(origen)) {
        res.setHeader('Access-Control-Allow-Origin', origen);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(registro, null, 1));
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.statusCode = 204;
      return res.end();
    }
    // Ni `\` ni NUL: en Windows `\` separa carpetas y permitiría salir de la raíz tras decodificar `%5c`.
    if (url.includes('\\') || url.includes('\0')) {
      res.statusCode = 400;
      return res.end();
    }
    const archivo = resolve(raiz, '.' + url);
    if (archivo !== raiz && !archivo.startsWith(raiz + sep)) {
      res.statusCode = 403;
      return res.end();
    }
    const bytes = tamanoExacto(archivo);
    const partes = url.match(/^\/(\d+)\/([^/]+)$/);
    if (partes) {
      registro.push({
        formato: Number(partes[1]),
        nombre: partes[2] ?? '',
        ruta: bytes === null ? null : relative(raiz, archivo).split(sep).join('/'),
        bytes: bytes ?? 0,
      });
      if (registro.length > MAX_REGISTRO) registro.shift();
    }
    if (bytes === null) {
      res.statusCode = 404;
      return res.end();
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', bytes);
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
  const config = JSON.parse(readFileSync(join(AQUI, 'paquetes.json'), 'utf8'));
  const espejo = resolve(val('--espejo', join(AQUI, '..', '..', 'espejo-local')));
  const puerto = Number(val('--puerto', String(config.servidor?.puerto ?? 8766)));
  if (!existsSync(espejo)) {
    console.error(`No existe ${espejo}. Ejecuta primero: npm run espejo:generar`);
    process.exit(1);
  }
  crearServidor(espejo, { origenesRegistro: config.servidor?.origenesRegistro }).listen(
    puerto,
    '127.0.0.1',
    () => console.log(`Espejo en http://localhost:${puerto}/<formato>/<archivo> (carpeta ${espejo})`),
  );
}
