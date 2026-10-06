// SPDX-License-Identifier: AGPL-3.0-or-later
// Build aparte del banco de compilación: empaqueta el worker como clásico (iife), igual que el producto,
// y copia public/ (con los activos de BusyTeX). No forma parte del build de la aplicación.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const raiz = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: raiz,
  base: '/',
  worker: { format: 'iife' },
  build: {
    target: 'es2022',
    outDir: '.cache-banco',
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL('./index.html', import.meta.url)) },
  },
});
