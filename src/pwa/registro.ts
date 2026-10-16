// SPDX-License-Identifier: AGPL-3.0-or-later
// Registro del service worker y detección de versiones nuevas. No recarga por su cuenta: avisa («Hay una versión
// nueva de Folio · Actualizar») y solo al elegir «Actualizar» activa la versión nueva y recarga.

export interface OpcionesRegistro {
  /** Dirección del service worker; por omisión `sw.js` junto a la página (respeta la ruta base del sitio). */
  url?: string;
  /** Se llama cuando hay una versión nueva esperando; `activar` la pone en marcha y recarga la página. */
  alHaberActualizacion: (activar: () => void) => void;
}

/** Registra el service worker. Devuelve `undefined` si el navegador no lo ofrece o el registro falla. */
export async function registrarServiceWorker(
  opciones: OpcionesRegistro,
): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
  const url = opciones.url ?? new URL('sw.js', document.baseURI).href;
  let registro: ServiceWorkerRegistration;
  try {
    registro = await navigator.serviceWorker.register(url);
  } catch {
    return undefined;
  }

  let pidioActivar = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // La primera vez que el service worker toma el control no hay nada que recargar: solo tras «Actualizar».
    if (pidioActivar) location.reload();
  });
  const activar = () => {
    pidioActivar = true;
    registro.waiting?.postMessage({ tipo: 'activar' });
  };
  const avisarSiEspera = () => {
    if (registro.waiting && navigator.serviceWorker.controller) opciones.alHaberActualizacion(activar);
  };

  avisarSiEspera();
  registro.addEventListener('updatefound', () => {
    const nuevo = registro.installing;
    nuevo?.addEventListener('statechange', () => {
      if (nuevo.state === 'installed') avisarSiEspera();
    });
  });
  // Al volver a la pestaña se busca una versión nueva (el navegador solo lo hace al navegar).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void registro.update().catch(() => undefined);
  });
  return registro;
}
