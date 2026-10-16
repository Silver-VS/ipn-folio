// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';

/** Un archivo TeX ausente debe responder 404; el respaldo HTML de una SPA sería contenido TeX falso. */
export function sinRespaldoHtml(raiz) {
  const base = resolve(raiz);
  return (req, res, siguiente) => {
    let ruta;
    try {
      ruta = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      res.statusCode = 400;
      res.end();
      return;
    }
    const prefijo = '/espejo/';
    const indice = ruta.indexOf(prefijo);
    if (indice < 0) return siguiente();
    const archivo = resolve(base, ruta.slice(indice + prefijo.length));
    if (archivo.startsWith(base + sep) && existsSync(archivo) && statSync(archivo).isFile())
      return siguiente();
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end();
  };
}

export function pluginEspejoEstatico() {
  return {
    name: 'folio-espejo-sin-spa',
    configureServer(servidor) {
      servidor.middlewares.use(sinRespaldoHtml(resolve(servidor.config.publicDir, 'espejo')));
    },
    configurePreviewServer(servidor) {
      servidor.middlewares.use(
        sinRespaldoHtml(resolve(servidor.config.root, servidor.config.build.outDir, 'espejo')),
      );
    },
  };
}
