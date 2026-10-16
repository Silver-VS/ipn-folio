// SPDX-License-Identifier: AGPL-3.0-or-later
// Estado de instalación de cada herramienta, guardado en el almacén `herramientas` (sesión 02).
import type { Almacen } from '../almacen';
import type { IdHerramienta } from './catalogo';

export type EstadoInstalacion = 'no-instalada' | 'descargando' | 'instalada' | 'error';

export type CodigoErrorInstalacion = 'red' | 'version' | 'espacio' | 'otro';

export interface EstadoHerramienta {
  estado: EstadoInstalacion;
  /** Bytes ya descargados (si está instalada, el total). */
  bytes: number;
  /** Versión instalada (la de los activos); vacía si no está instalada. */
  version: string;
  /** Solo con `estado: 'error'`. */
  error?: CodigoErrorInstalacion;
}

export const ESTADO_INICIAL: EstadoHerramienta = { estado: 'no-instalada', bytes: 0, version: '' };

const ESTADOS: readonly string[] = ['no-instalada', 'descargando', 'instalada', 'error'];

/** Acepta solo estados bien formados; cualquier otra cosa (datos viejos, corruptos) cuenta como no instalada. */
export function normalizar(valor: unknown): EstadoHerramienta {
  const v = valor as Partial<EstadoHerramienta> | null | undefined;
  if (!v || typeof v.estado !== 'string' || !ESTADOS.includes(v.estado)) return { ...ESTADO_INICIAL };
  return {
    estado: v.estado as EstadoInstalacion,
    bytes: typeof v.bytes === 'number' && v.bytes >= 0 ? v.bytes : 0,
    version: typeof v.version === 'string' ? v.version : '',
    ...(v.error === 'red' || v.error === 'version' || v.error === 'espacio' || v.error === 'otro'
      ? { error: v.error }
      : {}),
  };
}

export async function leerEstado(
  almacen: Pick<Almacen, 'leerHerramienta'>,
  id: IdHerramienta,
): Promise<EstadoHerramienta> {
  return normalizar(await almacen.leerHerramienta(id));
}

export async function guardarEstado(
  almacen: Pick<Almacen, 'guardarHerramienta'>,
  id: IdHerramienta,
  estado: EstadoHerramienta,
): Promise<void> {
  await almacen.guardarHerramienta(id, estado);
}
