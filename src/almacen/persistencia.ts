// SPDX-License-Identifier: AGPL-3.0-or-later
// Almacenamiento persistente: NO se llama al cargar la página (no pedir permisos sin contexto, UX-WEBAPPS §1);
// la sesión 07 lo invoca al instalar una herramienta.

type Gestor = Pick<StorageManager, 'persist' | 'persisted' | 'estimate'>;

function gestor(): Gestor | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.storage;
}

/** Pide al navegador que no borre los datos del sitio. `undefined` si el navegador no lo ofrece. */
export async function pedirPersistencia(
  almacenamiento: Gestor | undefined = gestor(),
): Promise<boolean | undefined> {
  if (!almacenamiento?.persist) return undefined;
  try {
    if (await almacenamiento.persisted?.()) return true;
    return await almacenamiento.persist();
  } catch {
    return undefined;
  }
}

export interface EspacioUsado {
  usado: number;
  cuota: number;
}

/** Espacio usado y cuota aproximada del sitio, en bytes. `undefined` si el navegador no lo informa. */
export async function espacio(
  almacenamiento: Gestor | undefined = gestor(),
): Promise<EspacioUsado | undefined> {
  if (!almacenamiento?.estimate) return undefined;
  try {
    const { usage, quota } = await almacenamiento.estimate();
    if (usage === undefined || quota === undefined) return undefined;
    return { usado: usage, cuota: quota };
  } catch {
    return undefined;
  }
}
