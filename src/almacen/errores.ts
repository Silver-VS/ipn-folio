// SPDX-License-Identifier: AGPL-3.0-or-later
import { t } from '../textos/t';

export type CodigoErrorAlmacen =
  | 'ruta_invalida'
  | 'nombre_invalido'
  | 'proyecto_inexistente'
  | 'proyecto_en_papelera'
  | 'archivo_inexistente'
  | 'destino_ocupado'
  | 'movimiento_invalido'
  | 'almacenamiento_lleno'
  | 'almacen_no_disponible'
  | 'zip_invalido'
  | 'zip_demasiado_grande';

/** Error de la capa de almacenamiento. El texto para el alumnado sale de `textoDeError`, no de `message`. */
export class ErrorAlmacen extends Error {
  readonly codigo: CodigoErrorAlmacen;
  readonly variables: Record<string, string>;

  constructor(codigo: CodigoErrorAlmacen, variables: Record<string, string> = {}) {
    super(`${codigo} ${JSON.stringify(variables)}`);
    this.name = 'ErrorAlmacen';
    this.codigo = codigo;
    this.variables = variables;
  }
}

/** Mensaje en español con la acción a seguir (textos en contenido/textos/es.toml, claves `almacen.error.*`). */
export function textoDeError(e: unknown): string {
  if (!(e instanceof ErrorAlmacen)) return t('almacen.error.desconocido');
  const ruta = e.variables.ruta ?? '';
  switch (e.codigo) {
    case 'ruta_invalida':
      return t('almacen.error.ruta_invalida', { ruta });
    case 'nombre_invalido':
      return t('almacen.error.nombre_invalido');
    case 'proyecto_inexistente':
      return t('almacen.error.proyecto_inexistente');
    case 'proyecto_en_papelera':
      return t('almacen.error.proyecto_en_papelera');
    case 'archivo_inexistente':
      return t('almacen.error.archivo_inexistente', { ruta });
    case 'destino_ocupado':
      return t('almacen.error.destino_ocupado', { ruta });
    case 'movimiento_invalido':
      return t('almacen.error.movimiento_invalido', { ruta });
    case 'almacenamiento_lleno':
      return t('almacen.error.almacenamiento_lleno');
    case 'almacen_no_disponible':
      return t('almacen.error.almacen_no_disponible');
    case 'zip_invalido':
      return t('almacen.error.zip_invalido');
    case 'zip_demasiado_grande':
      return t('almacen.error.zip_demasiado_grande');
  }
}

/** Convierte el error de cuota de IndexedDB en un error propio; deja pasar los demás. */
export function traducirErrorNativo(e: unknown): unknown {
  if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
    return new ErrorAlmacen('almacenamiento_lleno');
  }
  return e;
}
