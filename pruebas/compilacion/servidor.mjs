// Servidor estático mínimo para la prueba de compilación (solo uso local).
// Sirve la página, la biblioteca de node_modules, los activos de BusyTeX y,
// si existe, una plantilla local bajo /proyecto/ con su lista en /proyecto/lista.json.
//
// También emula el «endpoint remoto» de TeX Live de BusyTeX: GET /texlive/<formato>/<archivo>.
// Lo resuelve con `kpsewhich` del TeX Live instalado y anota cada petición en /texlive/registro.json,
// para saber qué archivos (y cuántos bytes) tendría que contener un espejo estático.
//
// Uso: node servidor.mjs [puerto] [carpeta-de-plantilla] [--sin-aislamiento]
//   --sin-aislamiento  no envía COOP/COEP (como GitHub Pages sin coi-serviceworker)

import { createServer } from 'node:http';
import { createReadStream, statSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('.', import.meta.url));
const argumentos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const sinAislamiento = process.argv.includes('--sin-aislamiento');
const puerto = Number(argumentos[0] ?? 8765);
const plantilla = resolve(argumentos[1] ?? join(raiz, '../../plantillas-locales/TT_UPIITA_2023'));

const rutas = {
  '/core/busytex/busytex_worker.js': join(raiz, 'web/folio_worker.js'),
  '/core/busytex/busytex_worker_original.js': join(raiz, 'public/core/busytex/busytex_worker.js'),
  '/lib/': join(raiz, 'node_modules/texlyre-busytex/dist/'),
  '/core/': join(raiz, 'public/core/'),
  '/proyecto/': plantilla,
  '/': join(raiz, 'web/'),
};

const tipos = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.pdf': 'application/pdf',
};

function listar(carpeta, base = carpeta) {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) return listar(ruta, base);
    return [relative(base, ruta).split(sep).join('/')];
  });
}

const registro = [];
const resueltos = new Map();

function kpsewhich(nombre) {
  if (!resueltos.has(nombre)) {
    let ruta = null;
    try {
      ruta = execFileSync('kpsewhich', [nombre], { encoding: 'utf8' }).trim() || null;
    } catch {}
    resueltos.set(nombre, ruta);
  }
  return resueltos.get(nombre);
}

function texliveRemoto(url, res) {
  if (url === '/texlive/registro.json') {
    res.setHeader('Content-Type', tipos['.json']);
    return res.end(JSON.stringify(registro, null, 1));
  }
  const [, formato, nombre] = url.match(/^\/texlive\/(\d+)\/(.+)$/) ?? [];
  // kpathsea pide algunos formatos sin extensión (p. ej. 3 = TFM); se agrega la implícita.
  const sufijo = { 3: '.tfm', 6: '.bib', 7: '.bst', 11: '.map', 20: '.ofm', 23: '.ovf', 26: '.tex', 32: '.pfb', 33: '.vf', 35: '.ist', 44: '.enc' }[formato];
  const conSufijo = nombre && !/\.\w+$/.test(nombre) && sufijo ? nombre + sufijo : nombre;
  const ruta = nombre && !nombre.includes('/') ? kpsewhich(conSufijo) : null;
  const bytes = ruta ? statSync(ruta).size : 0;
  registro.push({ formato: Number(formato), nombre, ruta, bytes });
  console.log(`texlive ${formato}/${nombre} → ${ruta ?? '404'}`);
  if (!ruta) {
    res.statusCode = 404;
    return res.end();
  }
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', bytes);
  createReadStream(ruta).pipe(res);
}

createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!sinAislamiento) {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  }
  res.setHeader('Cache-Control', 'no-cache');

  if (url.startsWith('/texlive/')) return texliveRemoto(url, res);

  // Guarda el PDF generado en el navegador junto a la plantilla, para compararlo con el nativo.
  if (url === '/guardar-pdf' && req.method === 'POST') {
    const partes = [];
    req.on('data', (p) => partes.push(p));
    req.on('end', () => {
      writeFileSync(join(plantilla, '..', 'salida-navegador.pdf'), Buffer.concat(partes));
      res.end('ok');
    });
    return;
  }

  if (url === '/proyecto/lista.json') {
    try {
      res.setHeader('Content-Type', tipos['.json']);
      return res.end(JSON.stringify(listar(plantilla)));
    } catch {
      res.statusCode = 404;
      return res.end('[]');
    }
  }

  const prefijo = Object.keys(rutas).find((p) => url.startsWith(p));
  const base = rutas[prefijo];
  let archivo = prefijo.endsWith('/') ? resolve(base, '.' + url.slice(prefijo.length - 1)) : base;
  if (!archivo.startsWith(resolve(base))) {
    res.statusCode = 403;
    return res.end();
  }
  try {
    if (statSync(archivo).isDirectory()) archivo = join(archivo, 'index.html');
    const tamano = statSync(archivo).size;
    res.setHeader('Content-Type', tipos[extname(archivo)] ?? 'application/octet-stream');
    res.setHeader('Content-Length', tamano);
    createReadStream(archivo).pipe(res);
  } catch {
    res.statusCode = 404;
    res.end('No encontrado');
  }
}).listen(puerto, () => {
  console.log(`Prueba de compilación en http://localhost:${puerto}`);
  console.log(`Plantilla: ${plantilla}`);
  console.log(`Aislamiento COOP/COEP: ${sinAislamiento ? 'no' : 'sí'}`);
});
