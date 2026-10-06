// SPDX-License-Identifier: AGPL-3.0-or-later
export type Gravedad = 'error' | 'aviso';
// `titulo` y `accion` ya vienen resueltos y escapados para HTML (por ejemplo «&» llega como «&amp;»).
// Para pintarlos como texto plano resuelve el texto por clave con el formateador de textos desde `codigo` y `variables` (valores sin escapar);
// si se pintan con `{@html}` se muestran bien tal cual. Ver «Arreglos tras revisión» en sesion-05-HANDOFF.md.
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
