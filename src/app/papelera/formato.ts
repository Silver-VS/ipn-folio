// SPDX-License-Identifier: AGPL-3.0-or-later
// Formato de números y fechas de la vista Papelera. Todo con `Intl`: ningún texto ni formato escrito a mano.
import { diasRestantes } from '../../almacen/papelera';
import type { ElementoPapelera } from '../../almacen';

const LOCALE = 'es-MX';

/** Megabytes con un decimal (1 MB = 1 048 576 bytes), para el texto «Ocupa {megas} MB». */
export function megas(bytes: number): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(
    bytes / (1024 * 1024),
  );
}

/** Fecha y hora cortas («16 oct 2026, 14:30»). */
export function fechaCorta(ms: number): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(ms);
}

/** Fecha ISO para el atributo `datetime` de `<time>`. */
export function fechaIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** «hoy», «mañana», «en 12 días»: cuándo se borrará solo un elemento, a partir de la hora dada. */
export function cuandoSeBorrara(e: Pick<ElementoPapelera, 'fecha'>, dias: number, hora: number): string {
  const n = diasRestantes(e.fecha, dias, hora);
  return new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' }).format(n, 'day');
}

/** Tamaño legible para una fila (12,4 kB, 3,1 MB), con las unidades de `Intl`. */
export function tamanoLegible(bytes: number): string {
  const unidades = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  return new Intl.NumberFormat(LOCALE, {
    style: 'unit',
    unit: unidades[i],
    unitDisplay: 'short',
    maximumFractionDigits: i === 0 ? 0 : 1,
  }).format(valor);
}
