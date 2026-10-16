// SPDX-License-Identifier: AGPL-3.0-or-later
// Configuración compartida de la PWA entre el build de la aplicación (vite.config.ts) y el del banco de pruebas
// (e2e/banco/vite.config.ts): el mismo service worker (src/pwa/sw.ts) en los dos.
import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';

/** Extensiones que forman el cascarón de la app (HTML, JS, CSS, fuentes, íconos). Nunca los activos de BusyTeX. */
export const PRECACHE = {
  globPatterns: ['**/*.{html,js,css,woff2,svg,png,webmanifest,txt}'],
  // Los activos de BusyTeX (~125 MB) se descargan solo cuando el usuario instala «Documentos LaTeX»;
  // `version.json` es la petición de hora de la papelera: debe ir siempre a la red.
  globIgnores: ['busytex/**', 'version.json', 'licencias/**', '**/*.map'],
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
};

/**
 * Service worker propio (injectManifest), empaquetado como script clásico para cubrir también Safari.
 * @param {import('vite-plugin-pwa').VitePWAOptions['manifest']} [manifest]
 */
export function pluginPwa(manifest = false) {
  return VitePWA({
    strategies: 'injectManifest',
    srcDir: 'src/pwa',
    filename: 'sw.ts',
    registerType: 'prompt',
    injectRegister: false,
    manifest,
    injectManifest: { ...PRECACHE, rollupFormat: 'iife' },
    devOptions: { enabled: false },
  });
}

/** Emite `version.json` (versión del paquete) y lo sirve en desarrollo; es el archivo de la petición de hora (D29). */
export function pluginVersionJson(raiz) {
  const version = JSON.parse(readFileSync(new URL('package.json', raiz), 'utf8')).version;
  const cuerpo = JSON.stringify({ version }) + '\n';
  return {
    name: 'folio-version-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: cuerpo });
    },
    configureServer(servidor) {
      servidor.middlewares.use('/version.json', (_peticion, respuesta) => {
        respuesta.setHeader('Content-Type', 'application/json');
        respuesta.setHeader('Cache-Control', 'no-store');
        respuesta.end(cuerpo);
      });
    },
  };
}
