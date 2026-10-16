// SPDX-License-Identifier: AGPL-3.0-or-later
// Registro del service worker y detección de versiones nuevas. También avisa si otra pestaña activa una versión;
// solo recarga cuando el usuario elige actualizar o recargar.

export interface OpcionesRegistro {
  /** Dirección del service worker; por omisión `sw.js` junto a la página (respeta la ruta base del sitio). */
  url?: string;
  /** Se llama cuando hay una versión nueva esperando; `activar` la pone en marcha y recarga la página. */
  alHaberActualizacion: (activar: () => void, recargar?: boolean) => void;
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
  let teniaControl = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // El primer controlador no invalida el cascarón; una sustitución posterior sí puede invalidar sus fragmentos.
    if (pidioActivar) location.reload();
    else if (teniaControl) opciones.alHaberActualizacion(() => location.reload(), true);
    teniaControl = true;
  });
  const activar = () => {
    pidioActivar = true;
    if (registro.waiting) registro.waiting.postMessage({ tipo: 'activar' });
    else location.reload();
  };
  const avisarSiEspera = () => {
    if (registro.waiting && navigator.serviceWorker.controller) opciones.alHaberActualizacion(activar);
  };

  avisarSiEspera();
  const observarInstalacion = () => {
    const nuevo = registro.installing;
    nuevo?.addEventListener('statechange', () => {
      if (nuevo.state === 'installed') avisarSiEspera();
    });
  };
  observarInstalacion();
  registro.addEventListener('updatefound', observarInstalacion);
  // Al volver a la pestaña se busca una versión nueva (el navegador solo lo hace al navegar).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void registro.update().catch(() => undefined);
  });
  return registro;
}
