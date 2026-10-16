// SPDX-License-Identifier: AGPL-3.0-or-later
// EditorView de CodeMirror 6 con las extensiones de Folio. Una vista por archivo abierto; el estado (cursor,
// historial, plegados) vive en `EditorState` y se conserva al cambiar de pestaña o de modo (amplio/compacto).
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
} from '@codemirror/language';
import { lintGutter, lintKeymap } from '@codemirror/lint';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Annotation, EditorState, Transaction } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { plano } from '../textos/plano';
import { t } from '../textos/t';
import { avisosCodeMirror, frasesCodeMirror } from './frases';
import { lenguajePara, tipoEditorPorRuta } from './lenguaje';
import { temaFolio } from './tema';

/** Marca los cambios que vienen de fuera (otra pestaña, restaurar): no se vuelven a guardar ni entran al historial. */
export const desdeExterno = Annotation.define<boolean>();

export interface OpcionesEstado {
  ruta: string;
  texto: string;
  /** Cada cambio hecho por la persona (no los de `desdeExterno`) con el texto completo. */
  alEditar(texto: string): void;
  /** Cada transacción, para guardar el `EditorState` más reciente. */
  alActualizar?(estado: EditorState): void;
  alGuardar(): void;
  alPaleta(): void;
}

export function crearEstadoEditor(o: OpcionesEstado): EditorState {
  const tipo = tipoEditorPorRuta(o.ruta);
  const propios: Extension = keymap.of([
    {
      key: 'Mod-s',
      preventDefault: true,
      run: () => {
        o.alGuardar();
        return true;
      },
    },
    {
      key: 'Mod-k',
      preventDefault: true,
      run: () => {
        o.alPaleta();
        return true;
      },
    },
  ]);
  return EditorState.create({
    doc: o.texto,
    extensions: [
      propios,
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter(),
      lintGutter(),
      history(),
      drawSelection(),
      indentOnInput(),
      indentUnit.of('  '),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true }),
      EditorView.lineWrapping,
      EditorState.phrases.of(frasesCodeMirror()),
      avisosCodeMirror,
      EditorView.contentAttributes.of({
        'aria-label': plano(t('editor.aria_texto', { ruta: o.ruta })),
        'aria-multiline': 'true',
        // La región con scroll de CodeMirror necesita un hijo enfocable que lectores de pantalla y axe reconozcan.
        tabindex: '0',
        lang: 'es',
        spellcheck: tipo === 'latex' || o.ruta.endsWith('.txt') ? 'true' : 'false',
        autocapitalize: 'off',
        autocorrect: 'off',
      }),
      lenguajePara(tipo, o.ruta),
      temaFolio,
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...lintKeymap,
        // Sin `indentWithTab`: Tab sigue moviendo el foco (si no, el teclado quedaría atrapado en el editor).
      ]),
      EditorView.updateListener.of((u) => {
        o.alActualizar?.(u.state);
        if (u.docChanged && !u.transactions.some((tr) => tr.annotation(desdeExterno))) {
          o.alEditar(u.state.doc.toString());
        }
      }),
    ],
  });
}

/** Cambia todo el texto sin tocar el historial ni disparar el autoguardado (el texto ya está en el almacén). */
export function reemplazarTextoExterno(estado: EditorState, texto: string): Transaction {
  const actual = estado.doc.toString();
  if (actual === texto) return estado.update({});
  // Conserva la selección dentro del texto nuevo.
  const largo = texto.length;
  const sel = estado.selection.main;
  return estado.update({
    changes: { from: 0, to: estado.doc.length, insert: texto },
    selection: { anchor: Math.min(sel.anchor, largo), head: Math.min(sel.head, largo) },
    annotations: [desdeExterno.of(true), Transaction.addToHistory.of(false)],
  });
}
