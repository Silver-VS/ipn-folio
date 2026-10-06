// SPDX-License-Identifier: AGPL-3.0-or-later
// Direcciones de los activos de compilación. Un solo lugar para cambiarlas (por ejemplo, al mudar al hospedaje del IPN).

/** Carpeta de los activos de BusyTeX, relativa a la página (se llena con `npm run activos`). */
export const BUSYTEX_BASE = './busytex';

/** Único paquete de datos de TeX Live que Folio carga (D23); el resto llega por el espejo (D8). */
export const CATALOGO_BASICO = ['texlive-basic.js'];

/** Espejo estático de TeX Live (`GET <espejo>/<formato>/<archivo>`); sin definir, no se consulta ningún espejo. */
export const ESPEJO_URL: string | undefined = import.meta.env.VITE_ESPEJO_URL || undefined;
