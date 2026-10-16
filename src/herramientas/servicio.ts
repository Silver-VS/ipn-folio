// SPDX-License-Identifier: AGPL-3.0-or-later
// Arma el instalador real (fetch, Cache API, IndexedDB y el Motor de la sesión 03) para la aplicación.
import { espacio, pedirPersistencia } from '../almacen';
import type { Almacen } from '../almacen';
import { BUSYTEX_BASE } from '../compilacion/config';
import { Motor } from '../compilacion/motor';
import { BD_PAQUETES_EMSCRIPTEN } from '../pwa/nombres';
import { Instalador } from './instalador';
import tamanos from './tamanos.gen.json';

/** Borra la base donde Emscripten guarda el paquete de datos; si hay una conexión abierta, no espera para siempre. */
export function borrarBaseDePaquetes(): Promise<void> {
  return new Promise((resolver) => {
    if (typeof indexedDB === 'undefined') return resolver();
    const plazo = setTimeout(resolver, 4000);
    const peticion = indexedDB.deleteDatabase(BD_PAQUETES_EMSCRIPTEN);
    const listo = () => {
      clearTimeout(plazo);
      resolver();
    };
    peticion.onsuccess = listo;
    peticion.onerror = listo;
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
      } finally {
        m.cancelar();
        if (motor === m) motor = null;
      }
    },
    cancelarMotor: () => motor?.cancelar(),
    borrarPaquetes: borrarBaseDePaquetes,
    persistir: pedirPersistencia,
    async espacioLibre() {
      const e = await espacio();
      return e ? e.cuota - e.usado : undefined;
    },
  });
}
