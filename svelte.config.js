// SPDX-License-Identifier: AGPL-3.0-or-later
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  // Modo runas obligatorio: la sintaxis de Svelte 4 (`export let`, `$:`) es error de compilación.
  compilerOptions: { runes: true },
};
