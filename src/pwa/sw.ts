// SPDX-License-Identifier: AGPL-3.0-or-later
// Service worker de IPN Folio (injectManifest de vite-plugin-pwa, módulos de Workbox).
//  - Precaché: solo el cascarón (HTML, JS, CSS, fuentes, íconos). NUNCA los activos de BusyTeX.
//  - `folio-busytex-<versión>`: se llena solo cuando el usuario instala «Documentos LaTeX» (src/herramientas/instalador.ts);
//    aquí solo se lee. `texlive-basic.data` no se guarda aquí: lo guarda Emscripten en IndexedDB.
//  - `folio-espejo-v1`: respuestas 200 y 404 del espejo de TeX Live, «primero caché» (el 404 es un fallo legítimo
//    que kpathsea recuerda).
//  - `version.json` (petición de hora de la papelera, D29), `login.microsoftonline.com` y `graph.microsoft.com`:
//    el service worker no los toca; van siempre a la red.
import { clientsClaim, setCacheNameDetails } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  getCacheKeyForURL,
  precacheAndRoute,
} from 'workbox-precaching';
import type { PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { ESPEJO_URL } from '../compilacion/config';
import { ARCHIVOS_EN_CACHE, CACHE_ESPEJO, RUTA_HORA, cacheBusytex } from './nombres';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<PrecacheEntry | string> };

const ESPEJO = new URL(ESPEJO_URL.replace(/\/$/, '') + '/', self.location.href).href;
const SERVICIOS_MICROSOFT = ['login.microsoftonline.com', 'graph.microsoft.com'];

/** Peticiones que el service worker deja pasar sin tocar (la 10 usa Microsoft; la 11, la hora). */
const dejarPasar = (url: URL): boolean =>
  url.pathname.endsWith(`/${RUTA_HORA}`) ||
  SERVICIOS_MICROSOFT.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));

setCacheNameDetails({ prefix: 'folio' });
cleanupOutdatedCaches();
// Los archivos del cascarón llevan su hash en el nombre: cualquier «?consulta» (utm, ?espejo=…) abre la misma página.
precacheAndRoute(self.__WB_MANIFEST, { ignoreURLParametersMatching: [/.*/] });

// Navegaciones dentro del alcance: el cascarón (la app usa rutas con «#», así que basta con index.html).
// (El banco de pruebas no tiene index.html en la raíz: ahí no hay respaldo de navegación.)
if (getCacheKeyForURL('index.html')) {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('index.html'), {
      allowlist: [
        new RegExp(
          `^${new URL('.', self.location.href).pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:index\\.html)?(?:\\?.*)?$`,
        ),
      ],
    }),
  );
}

// Activos de BusyTeX: se sirven de la caché si el usuario ya los instaló; si no, van a la red SIN guardarse.
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    url.origin === self.location.origin &&
    !dejarPasar(url) &&
    /\/busytex\/[^/]+$/.test(url.pathname) &&
    ARCHIVOS_EN_CACHE.includes(url.pathname.slice(url.pathname.lastIndexOf('/') + 1)),
  async ({ request }) => {
    const guardada = await caches.match(request, { cacheName: cacheBusytex() });
    return guardada ?? fetch(request);
  },
);

// Espejo de TeX Live: primero caché; se guardan las respuestas 200 y 404.
if (ESPEJO) {
  registerRoute(
    ({ url, request }) => request.method === 'GET' && !dejarPasar(url) && url.href.startsWith(ESPEJO),
    async ({ request, event }) => {
      const cache = await caches.open(CACHE_ESPEJO);
      const guardada = await cache.match(request, { ignoreVary: true });
      if (guardada) return guardada;
      const respuesta = await fetch(request);
      if (respuesta.status === 200 || respuesta.status === 404) {
        const guardar = cache.put(request, respuesta.clone()).catch(() => undefined);
        event.waitUntil(guardar);
      }
      return respuesta;
    },
  );
}

self.addEventListener('message', (evento) => {
  // La página pide activar la versión nueva cuando el usuario toca «Actualizar» (sin recarga forzada).
  if ((evento.data as { tipo?: string } | null)?.tipo === 'activar') void self.skipWaiting();
});

// Las versiones anteriores siguen disponibles para pestañas abiertas y equipos sin conexión.
// Solo «Quitar» elimina los activos de BusyTeX.

clientsClaim();
