// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { Annotation, EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { avisosCodeMirror } from './frases';

describe('avisos completos de CodeMirror', () => {
  it.each([
    ['current match. texto con ñ on line 3.', 'Coincidencia actual: texto con ñ, en la línea 3.'],
    ['Folded lines 1 to 4.', 'Se plegaron las líneas de 1 a 4.'],
    ['Unfolded lines 1 to 4.', 'Se desplegaron las líneas de 1 a 4.'],
  ])('traduce el aviso entero: %s', (entrada, salida) => {
    const marca = Annotation.define<string>();
    const estado = EditorState.create({ doc: 'texto', extensions: avisosCodeMirror });
    const tr = estado.update({
      selection: { anchor: 2 },
      scrollIntoView: true,
      effects: EditorView.announce.of(entrada),
      annotations: [marca.of('conservar'), Transaction.addToHistory.of(false)],
    });
    expect(tr.effects.filter((e) => e.is(EditorView.announce)).map((e) => e.value)).toEqual([salida]);
    expect(tr.newSelection.main.anchor).toBe(2);
    expect(tr.scrollIntoView).toBe(true);
    expect(tr.annotation(marca)).toBe('conservar');
    expect(tr.annotation(Transaction.addToHistory)).toBe(false);
  });
});
