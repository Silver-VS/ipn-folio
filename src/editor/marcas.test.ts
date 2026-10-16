// SPDX-License-Identifier: AGPL-3.0-or-later
import { EditorState } from '@codemirror/state';
import { expect, it } from 'vitest';
import { diagnosticos } from './marcas';

it('ubica los problemas de cada archivo y limita líneas fuera del documento', () => {
  const estado = EditorState.create({ doc: 'uno\ndos\ntres' });
  expect(
    diagnosticos(estado, 'cap/uno.tex', [
      { severidad: 'error', texto: 'imagen', ruta: 'cap/uno.tex', linea: 2 },
      { severidad: 'aviso', texto: 'campo', ruta: 'cap/uno.tex', linea: 99 },
      { severidad: 'error', texto: 'otro', ruta: 'main.tex', linea: 1 },
    ]),
  ).toEqual([
    { from: 4, to: 7, severity: 'error', message: 'imagen' },
    { from: 8, to: 12, severity: 'warning', message: 'campo' },
  ]);
});
