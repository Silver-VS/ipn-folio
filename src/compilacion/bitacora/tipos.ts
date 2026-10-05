// SPDX-License-Identifier: AGPL-3.0-or-later
export type Gravedad = 'error' | 'aviso';
export interface Problema {
  variables?: Record<string, string | number>;
  gravedad: Gravedad;
  codigo: string;
  titulo: string;
  accion: string;
  archivo?: string;
  linea?: number;
  original: string;
}
export interface Senales {
  repetirPasada: boolean;
  citasIndefinidas: boolean;
  referenciasIndefinidas: boolean;
  faltantes: string[];
  fatal: boolean;
}
export interface ResultadoAnalisis {
  problemas: Problema[];
  senales: Senales;
}
export interface LineaBitacora {
  texto: string;
  original: string;
}
