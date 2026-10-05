// SPDX-License-Identifier: AGPL-3.0-or-later
// Datos públicos del proyecto (enlace al código fuente, licencia, versión). Salen de config/*.json:
// no hay URLs ni versión escritas en el código.
import desarrollo from '../config/desarrollo.json';
import produccion from '../config/produccion.json';

export type Entorno = 'desarrollo' | 'produccion';

export interface Acerca {
  REPO_URL: string;
  LICENCIA: string;
  version: string;
}

const CONFIGURACIONES: Record<Entorno, Acerca> = { desarrollo, produccion };

export function obtenerAcerca(entorno: Entorno): Acerca {
  return CONFIGURACIONES[entorno];
}

/** Datos del entorno con que se compiló esta página. */
export const acerca: Acerca = obtenerAcerca(
  typeof __FOLIO_ENTORNO__ === 'string' ? __FOLIO_ENTORNO__ : 'produccion',
);
