// SPDX-License-Identifier: AGPL-3.0-or-later
// Lo que la bienvenida de primer uso guarda en los ajustes del almacén (IndexedDB; nada en localStorage).
import type { Almacen } from '../../almacen';
import unidades from '@ipn/comun/datos/unidades.json';

export const AJUSTE_BIENVENIDA = 'bienvenidaVista';
export const AJUSTE_UNIDAD = 'unidad';
export const AJUSTE_ROL = 'rol';

/** `otra`: la persona no encontró su unidad en la lista (D13). */
export const UNIDAD_OTRA = 'otra';
export type Rol = 'estudiante' | 'docente';

export interface UnidadElegible {
  id: string;
  siglas: string;
}

/** Las unidades salen de los datos comunes (ipn-comun): una sola fuente de verdad con IPN-tools. */
export const UNIDADES: readonly UnidadElegible[] = (
  unidades as { unidades: Array<{ id: string; siglas: string }> }
).unidades.map(({ id, siglas }) => ({ id, siglas }));

export interface Preferencias {
  unidad: string;
  rol: Rol;
}

export async function bienvenidaVista(almacen: Pick<Almacen, 'leerAjuste'>): Promise<boolean> {
  return (await almacen.leerAjuste<boolean>(AJUSTE_BIENVENIDA)) === true;
}

export async function guardarBienvenida(
  almacen: Pick<Almacen, 'guardarAjuste'>,
  preferencias: Preferencias,
): Promise<void> {
  await almacen.guardarAjuste(AJUSTE_UNIDAD, preferencias.unidad);
  await almacen.guardarAjuste(AJUSTE_ROL, preferencias.rol);
  await almacen.guardarAjuste(AJUSTE_BIENVENIDA, true);
}
