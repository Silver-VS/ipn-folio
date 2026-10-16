// SPDX-License-Identifier: AGPL-3.0-or-later
// Regla de descarga según la red (D15, PA7). `navigator.connection` solo existe en algunos navegadores (Chromium);
// donde falta, o no informa el tipo, se pregunta antes de descargar.

/** Lo que el navegador informa de la conexión (parte de la Network Information API). */
export interface InfoConexion {
  type?: string;
  effectiveType?: string;
  saveData?: boolean;
}

export type TipoRed = 'wifi' | 'ethernet' | 'datos-moviles' | 'desconocida';

/**
 * - `descargar`: se puede empezar.
 * - `confirmar-datos`: datos móviles con «Solo con Wi-Fi» activo; se ofrece «Descargar de todos modos».
 * - `preguntar`: no se sabe el tipo de red; se pregunta una vez por descarga, con el tamaño.
 * - `preguntar-ahorro`: el navegador pide ahorrar datos; se pregunta siempre.
 */
export type DecisionDescarga = 'descargar' | 'confirmar-datos' | 'preguntar' | 'preguntar-ahorro';

export function conexionActual(): InfoConexion | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: InfoConexion }).connection;
}

export function tipoDeRed(conexion: InfoConexion | undefined = conexionActual()): TipoRed {
  switch (conexion?.type) {
    case 'wifi':
      return 'wifi';
    case 'ethernet':
      return 'ethernet';
    case 'cellular':
      return 'datos-moviles';
    default:
      return 'desconocida';
  }
}

export function decidirDescarga(
  soloWifi: boolean,
  conexion: InfoConexion | undefined = conexionActual(),
): DecisionDescarga {
  if (conexion?.saveData) return 'preguntar-ahorro';
  const tipo = tipoDeRed(conexion);
  if (tipo === 'wifi' || tipo === 'ethernet') return 'descargar';
  if (tipo === 'datos-moviles') return soloWifi ? 'confirmar-datos' : 'descargar';
  return 'preguntar';
}
