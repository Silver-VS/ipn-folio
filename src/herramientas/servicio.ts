// SPDX-License-Identifier: AGPL-3.0-or-later
// Arma el instalador real (fetch, Cache API, IndexedDB y el Motor de la sesión 03) para la aplicación.
import { espacio, pedirPersistencia } from '../almacen';
import type { Almacen } from '../almacen';
import { BUSYTEX_BASE } from '../compilacion/config';
import { Motor } from '../compilacion/motor';
import { BD_PAQUETES_EMSCRIPTEN } from '../pwa/nombres';
import { ErrorInstalacion, Instalador } from './instalador';
import tamanos from './tamanos.gen.json';

/** Borra la base donde Emscripten guarda el paquete de datos; si hay una conexión abierta, no espera para siempre. */
export function borrarBaseDePaquetes(): Promise<void> {
  return new Promise((resolver, rechazar) => {
    if (typeof indexedDB === 'undefined') return resolver();
    const peticion = indexedDB.deleteDatabase(BD_PAQUETES_EMSCRIPTEN);
    const fallo = () =>
      rechazar(
        new ErrorInstalacion('otro', 'IndexedDB: cierre las otras pestañas de Folio antes de quitar LaTeX'),
      );
    const listo = () => {
      resolver();
    };
    peticion.onsuccess = listo;
    peticion.onerror = fallo;
    peticion.onblocked = fallo;
  });
}

export function crearInstaladorReal(almacen: Almacen, base: string = BUSYTEX_BASE): Instalador {
  let motor: Motor | null = null;
  const direccion = new URL(base, document.baseURI).href.replace(/\/$/, '');
  return new Instalador({
    almacen,
    base: direccion,
    version: tamanos.busytex,
    async iniciarMotor(alProgreso) {
      // Sin espejo: aquí solo se prepara el paquete «basic» (lo que el espejo aporte llega al compilar).
      const m = new Motor({ base: direccion, espejo: null, eventos: { progreso: alProgreso } });
      motor = m;
      try {
        await m.iniciar();
      } catch (e) {
        if (e instanceof Error && 'detalle' in e && String(e.detalle).includes('folio-version'))
          throw new ErrorInstalacion('version', String(e.detalle));
        throw e;
      } finally {
        m.cancelar();
        if (motor === m) motor = null;
      }
    },
    cancelarMotor: () => motor?.cancelar(),
    borrarPaquetes: async () => {
      motor?.cancelar();
      await borrarBaseDePaquetes();
    },
    persistir: pedirPersistencia,
    async espacioLibre() {
      const e = await espacio();
      return e ? e.cuota - e.usado : undefined;
    },
  });
}
