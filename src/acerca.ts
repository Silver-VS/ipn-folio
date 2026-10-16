// SPDX-License-Identifier: AGPL-3.0-or-later
// Datos públicos del proyecto (enlace al código fuente, licencia, versión) y valores de la papelera. Salen de
// config/*.json: no hay URLs, versión ni umbrales escritos en el código. vite.config.ts elige un solo JSON según el
// entorno y lo inyecta como __FOLIO_CONFIG__, así el build de producción no empaqueta la configuración de desarrollo.

/** Valores de la papelera (D29); ver config/LEEME.md. */
export interface ConfigPapelera {
  /** Días antes de borrar automáticamente lo que está en la papelera, si el alumno no eligió otro. */
  diasPorOmision: number;
  /** Días que el alumno puede elegir. */
  opcionesDias: number[];
  /** Días extra antes de purgar (absorbe desfases chicos de la hora). */
  margenDias: number;
  /** Horas mínimas entre dos purgas al volver a la pestaña. */
  intervaloPurgaHoras: number;
  /** Tamaño de la papelera (MB) a partir del cual se avisa. */
  avisoMegas: number;
  /** Fracción del espacio usado por el navegador a partir de la cual se avisa. */
  avisoFraccionUso: number;
  /** Archivo del propio sitio al que se pide la hora (cabecera `Date`), relativo a la página. */
  urlHora: string;
}

export interface Acerca {
  REPO_URL: string;
  LICENCIA: string;
  version: string;
  papelera: ConfigPapelera;
}

/** Datos del entorno con que se compiló esta página. */
export const acerca: Acerca = {
  REPO_URL: __FOLIO_CONFIG__.REPO_URL,
  LICENCIA: __FOLIO_CONFIG__.LICENCIA,
  version: __FOLIO_CONFIG__.version,
  papelera: __FOLIO_CONFIG__.papelera,
};
