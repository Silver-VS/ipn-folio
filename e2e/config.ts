// SPDX-License-Identifier: AGPL-3.0-or-later
// Valores compartidos por la configuración de Playwright y las pruebas de compilación (un solo lugar).

/** Puerto del banco de compilación (e2e/banco), que empaqueta y sirve Vite solo si hay activos de BusyTeX. */
export const PUERTO_BANCO = 4174;

/** Dirección de la página del banco. `espejo` es la URL del espejo de TeX Live (opcional). */
export function urlBanco(espejo?: string): string {
  const consulta = espejo ? `?espejo=${encodeURIComponent(espejo)}` : '';
  return `http://localhost:${PUERTO_BANCO}/e2e/banco/index.html${consulta}`;
}
