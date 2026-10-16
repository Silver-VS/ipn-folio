// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

/** Solo Vite dev sirve una lista cerrada de fuentes locales; nunca expone el directorio completo. */
export function pluginPlantillasLocales(raiz = process.cwd()) {
  const carpeta = resolve(raiz, 'plantillas-locales/TT_UPIITA_2023');
  return {
    name: 'folio-plantillas-locales',
    apply: 'serve',
    configureServer(servidor) {
      const archivos = new Map();
      if (existsSync(carpeta)) {
        const real = realpathSync(carpeta);
        const recorrer = (dir) => {
          for (const entrada of readdirSync(dir, { withFileTypes: true })) {
            if (entrada.isSymbolicLink()) continue;
            const ruta = resolve(dir, entrada.name);
            if (entrada.isDirectory()) recorrer(ruta);
            else if (/\.(tex|sty|cls|bib|bst|ist|png|jpe?g|pdf|eps)$/i.test(entrada.name)) {
              const relativa = relative(real, realpathSync(ruta));
              if (!relativa.startsWith('..') && !relative(real, ruta).startsWith('..'))
                archivos.set(relativa.split(sep).join('/'), ruta);
            }
          }
        };
        recorrer(real);
      }
      servidor.middlewares.use((req, res, siguiente) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const indice = url.pathname.indexOf('/plantillas-locales/');
        if (indice < 0) return siguiente();
        let ruta;
        try {
          ruta = decodeURIComponent(url.pathname.slice(indice + '/plantillas-locales/'.length));
        } catch {
          res.statusCode = 400;
          res.end();
          return;
        }
        if (ruta === 'catalogo.json') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify(
              archivos.size
                ? [
                    {
                      id: 'tt-upiita-2023',
                      nombre: 'Trabajo Terminal UPIITA',
                      unidad: 'upiita',
                      descripcion: 'UpiiTeXis · plantilla disponible en este equipo',
                      archivos: [...archivos.keys()],
                      licencia: 'LPPL + CC-BY-SA',
                      origen: 'local',
                    },
                  ]
                : [],
            ),
          );
        } else {
          const archivo =
            ruta.startsWith('tt-upiita-2023/') && archivos.get(ruta.slice('tt-upiita-2023/'.length));
          if (!archivo) {
            res.statusCode = 404;
            res.end();
            return;
          }
          res.setHeader('Content-Type', 'application/octet-stream');
          res.end(readFileSync(archivo));
        }
      });
    },
  };
}
