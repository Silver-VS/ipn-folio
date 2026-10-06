// SPDX-License-Identifier: AGPL-3.0-or-later
// Valores compartidos por la configuración de Playwright y las pruebas de compilación (un solo lugar).
import { readFileSync } from 'node:fs';

/** Puerto del banco de compilación (e2e/banco), que empaqueta y sirve Vite solo si hay activos de BusyTeX. */
export const PUERTO_BANCO = 4174;

/** Puerto del servidor de desarrollo que sirve la página de prueba del almacén (e2e/almacen.html). */
export const PUERTO_DESARROLLO = 4175;

/** Dirección de la página del banco. `espejo` es la URL del espejo de TeX Live (opcional). */
export function urlBanco(espejo?: string): string {
  const consulta = espejo ? `?espejo=${encodeURIComponent(espejo)}` : '';
  return `http://localhost:${PUERTO_BANCO}/e2e/banco/index.html${consulta}`;
}

/** Puerto del espejo local de TeX Live (`npm run espejo:servir`); sale de la misma lista que usa el servidor. */
export const PUERTO_ESPEJO: number =
  (
    JSON.parse(readFileSync(new URL('../scripts/espejo/paquetes.json', import.meta.url), 'utf8')) as {
      servidor?: { puerto?: number };
    }
  ).servidor?.puerto ?? 8766;

/** URL del espejo local. */
export const URL_ESPEJO = `http://localhost:${PUERTO_ESPEJO}`;
