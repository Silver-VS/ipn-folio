// SPDX-License-Identifier: AGPL-3.0-or-later
import { crearAlmacenIdb } from './almacen-idb';
import { crearAlmacenMemoria } from './almacen-memoria';
import { ErrorAlmacen } from './errores';
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
  } catch (e) {
    // Una versión más nueva de la base NO se cubre con memoria: el trabajo se perdería al cerrar la pestaña.
    // Tampoco se cubre un fallo de apertura o migración: solo falta de IndexedDB (o ventana privada) cae a memoria.
    if (e instanceof ErrorAlmacen && e.codigo !== 'almacen_no_disponible') throw e;
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
export { crearRelojConfiable, medirHora } from './hora';
export type { FetchHora, RelojConfiable } from './hora';
export type { Aviso, Avisos } from './avisos';
export { exportarZip, importarZip, detectarPrincipal } from './zip';
export { pedirPersistencia, espacio } from './persistencia';
