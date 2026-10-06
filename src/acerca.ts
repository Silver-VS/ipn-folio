// SPDX-License-Identifier: AGPL-3.0-or-later
// Datos públicos del proyecto (enlace al código fuente, licencia, versión). Salen de config/*.json:
// no hay URLs ni versión escritas en el código. vite.config.ts elige un solo JSON según el entorno y lo inyecta
// como __FOLIO_CONFIG__, así el build de producción no empaqueta la configuración de desarrollo.

export interface Acerca {
  REPO_URL: string;
  LICENCIA: string;
  version: string;
}

/** Datos del entorno con que se compiló esta página. */
export const acerca: Acerca = {
  REPO_URL: __FOLIO_CONFIG__.REPO_URL,
  LICENCIA: __FOLIO_CONFIG__.LICENCIA,
  version: __FOLIO_CONFIG__.version,
};
