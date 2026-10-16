// SPDX-License-Identifier: AGPL-3.0-or-later
import unidades from '@ipn/comun/datos/unidades.json';

export interface Plantilla {
  id: string;
  nombre: string;
  unidad: string;
  descripcion: string;
  archivos: string[];
  licencia: string;
  origen: 'repo' | 'local';
}

/** La lista de unidades y sus referencias de plantillas pertenece a ipn-comun. */
export const UNIDADES_PLANTILLAS = unidades.unidades.filter((u) => u.productos.folio);

export function filtrarPlantillas(catalogo: readonly Plantilla[], unidad: string, todas = false): Plantilla[] {
  const referencias: readonly string[] = UNIDADES_PLANTILLAS.find((u) => u.id === unidad)?.productos.folio.plantillas ?? [];
  return catalogo.filter((p) => todas || p.unidad === 'ipn' || p.unidad === unidad || referencias.includes(p.id));
}

export async function cargarCatalogo(): Promise<Plantilla[]> {
  const respuesta = await fetch(`${import.meta.env.BASE_URL}plantillas/catalogo.json`);
  if (!respuesta.ok) throw new Error(`catalogo: HTTP ${respuesta.status}`);
  return respuesta.json() as Promise<Plantilla[]>;
}
