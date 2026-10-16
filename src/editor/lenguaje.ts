// SPDX-License-Identifier: AGPL-3.0-or-later
// Lenguaje del editor según el archivo. LaTeX usa el paquete de TeXlyre (D9); no se escribe un analizador propio.
import type { Extension } from '@codemirror/state';
import { latex } from 'codemirror-lang-latex';
import { EXTENSIONES_LATEX, extension } from '../almacen/rutas';

export type TipoEditor = 'latex' | 'texto';

/**
 * `.tex`, `.sty`, `.cls`… son LaTeX; el resto es texto plano. `.bib` también: el paquete de TeXlyre no trae un
 * lenguaje BibTeX y no se improvisa uno (anotado en el HANDOFF de la sesión 08).
 */
export function tipoEditorPorRuta(ruta: string): TipoEditor {
  return EXTENSIONES_LATEX.has(extension(ruta)) ? 'latex' : 'texto';
}

/**
 * Extensión de lenguaje. Se apaga lo que el paquete trae y esta sesión no usa: el linter y los tooltips (sus
 * mensajes están en inglés; los avisos propios llegan en la sesión 09) y la autocompletación.
 */
export function lenguajePara(tipo: TipoEditor, ruta: string): Extension[] {
  if (tipo !== 'latex') return [];
  return [
    latex({
      enableLinting: false,
      enableTooltips: false,
      enableAutocomplete: false,
      autoCloseTags: true,
      autoCloseBrackets: true,
      fileName: ruta,
    }),
  ];
}
