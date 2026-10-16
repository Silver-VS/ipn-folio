// SPDX-License-Identifier: AGPL-3.0-or-later
// Build aparte del banco de compilación: empaqueta el worker como clásico (iife), igual que el producto,
// y copia public/ (con los activos de BusyTeX). Incluye el MISMO service worker del producto (src/pwa/sw.ts) para
// probar el modo sin conexión y el espejo. No forma parte del build de la aplicación.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { pluginPwa, pluginVersionJson } from '../../scripts/lib/pwa.mjs';
import { URL_ESPEJO } from '../config';

const raiz = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: raiz,
  base: '/',
  plugins: [pluginVersionJson(new URL('../../', import.meta.url)), pluginPwa(false)],
  worker: { format: 'iife' },
  // El service worker solo guarda las respuestas del espejo cuya dirección conoce desde la compilación.
  define: { 'import.meta.env.VITE_ESPEJO_URL': JSON.stringify(URL_ESPEJO) },
  build: {
    target: 'es2022',
    outDir: '.cache-banco',
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL('./index.html', import.meta.url)) },
  },
});
