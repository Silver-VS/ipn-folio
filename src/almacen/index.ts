// SPDX-License-Identifier: AGPL-3.0-or-later
import { crearAlmacenIdb } from './almacen-idb';
import { crearAlmacenMemoria } from './almacen-memoria';
import type { Almacen, OpcionesAlmacen } from './tipos';

export interface ResultadoAlmacen {
  almacen: Almacen;
  /** `false` si se usó el respaldo en memoria: el trabajo se perderá al cerrar la pestaña y hay que avisarlo. */
  persistente: boolean;
}

/** Abre el almacén en IndexedDB; si el navegador no lo permite, cae a memoria (y lo indica en `persistente`). */
export async function crearAlmacen(opciones: OpcionesAlmacen = {}): Promise<ResultadoAlmacen> {
  try {
    return { almacen: await crearAlmacenIdb(opciones), persistente: true };
  } catch {
    return { almacen: crearAlmacenMemoria(opciones), persistente: false };
  }
}

export * from './tipos';
export { ErrorAlmacen, textoDeAviso, textoDeError } from './errores';
export type { AvisoImportacion, CodigoErrorAlmacen } from './errores';
export { normalizarRuta, esRutaValida, tipoPorRuta } from './rutas';
export { crearAlmacenIdb, crearAlmacenMemoria };
export { crearAutoguardado } from './autoguardado';
export type { Autoguardado, EstadoAutoguardado, VentanaProtegible } from './autoguardado';
export { crearAvisos, conectarAvisos } from './avisos';
export type { Aviso, Avisos } from './avisos';
export { exportarZip, importarZip, detectarPrincipal } from './zip';
export { pedirPersistencia, espacio } from './persistencia';
