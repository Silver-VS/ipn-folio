// SPDX-License-Identifier: AGPL-3.0-or-later
// Expone el almacén real (IndexedDB) a las pruebas de Playwright mediante `window.prueba`.
import { conectarAvisos, crearAlmacen, crearAvisos, exportarZip, importarZip } from '../src/almacen';
import type { Almacen } from '../src/almacen';

declare global {
  interface Window {
    prueba: Promise<{
      almacen: Almacen;
      persistente: boolean;
      exportarZip: typeof exportarZip;
      importarZip: typeof importarZip;
      crearAvisos: typeof crearAvisos;
      conectarAvisos: typeof conectarAvisos;
    }>;
  }
}

window.prueba = crearAlmacen().then(({ almacen, persistente }) => ({
  almacen,
  persistente,
  exportarZip,
  importarZip,
  crearAvisos,
  conectarAvisos,
}));
