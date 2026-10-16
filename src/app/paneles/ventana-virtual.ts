// SPDX-License-Identifier: AGPL-3.0-or-later
// Lista virtualizada para la bitácora (panel Salida): con más de LIMITE_VIRTUAL líneas solo se dibujan las visibles.

/** A partir de cuántas líneas la salida se virtualiza (plan de la sesión 08). */
export const LIMITE_VIRTUAL = 5000;

export interface RangoVisible {
  desde: number;
  hasta: number;
  /** Alto (px) del hueco antes de la primera línea dibujada. */
  antes: number;
  /** Alto (px) del hueco después de la última línea dibujada. */
  despues: number;
}

/** Líneas que hay que dibujar para un scroll dado, con un margen arriba y abajo para que el desplazamiento no parpadee. */
export function rangoVisible(
  scrollTop: number,
  altoVisible: number,
  altoLinea: number,
  total: number,
  margen = 20,
): RangoVisible {
  if (total <= 0 || altoLinea <= 0) return { desde: 0, hasta: 0, antes: 0, despues: 0 };
  const primera = Math.floor(Math.max(0, scrollTop) / altoLinea);
  const ultima = Math.ceil((Math.max(0, scrollTop) + Math.max(0, altoVisible)) / altoLinea);
  const desde = Math.min(total, Math.max(0, primera - margen));
  const hasta = Math.min(total, Math.max(desde, ultima + margen));
  return { desde, hasta, antes: desde * altoLinea, despues: (total - hasta) * altoLinea };
}

/** Parte la bitácora en líneas sin crear una línea fantasma por el salto final. */
export function lineasDe(texto: string): string[] {
  if (texto === '') return [];
  const lineas = texto.split(/\r?\n/);
  if (lineas[lineas.length - 1] === '') lineas.pop();
  return lineas;
}
