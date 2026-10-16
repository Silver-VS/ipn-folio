// SPDX-License-Identifier: AGPL-3.0-or-later
// Nombres de las cachés de Folio, compartidos por el service worker y el instalador. Todos empiezan con `folio-`
// (prefijo registrado en ipn-comun/datos/almacen.json: los sitios bajo silver-vs.github.io comparten origen con IPN-tools).
import tamanos from '../herramientas/tamanos.gen.json';

export const PREFIJO_CACHE = 'folio-';
export const PREFIJO_BUSYTEX = 'folio-busytex-';
/** Caché de los archivos del espejo de TeX Live que ya se usaron (D8). */
export const CACHE_ESPEJO = 'folio-espejo-v1';
/** Base de datos de IndexedDB donde el cargador de Emscripten guarda `texlive-basic.data`. */
export const BD_PAQUETES_EMSCRIPTEN = 'EM_PRELOAD_CACHE';

/** Caché de los activos de BusyTeX de una versión de texlyre-busytex. */
export const cacheBusytex = (version: string = tamanos.busytex): string => `${PREFIJO_BUSYTEX}${version}`;

/** Archivos de BusyTeX que se guardan en `folio-busytex-*`. `texlive-basic.data` nunca (lo guarda Emscripten en IndexedDB). */
export const ARCHIVOS_EN_CACHE: readonly string[] = tamanos.latex.archivos
  .filter((a) => a.destino === 'cache')
  .map((a) => a.nombre);

/** Petición de hora de la papelera (D29): siempre va a la red. */
export const RUTA_HORA = 'version.json';
