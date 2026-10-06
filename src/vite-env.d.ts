// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference types="vite/client" />
/// <reference types="svelte" />

/** Entorno de configuración elegido al compilar (ver vite.config.ts y config/). */
declare const __FOLIO_ENTORNO__: 'desarrollo' | 'produccion';

interface ImportMetaEnv {
  /** URL del espejo de TeX Live (sesión 04); opcional. */
  readonly VITE_ESPEJO_URL?: string;
}
