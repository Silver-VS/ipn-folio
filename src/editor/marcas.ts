// SPDX-License-Identifier: AGPL-3.0-or-later
import type { EditorState } from '@codemirror/state';
import type { Diagnostic } from '@codemirror/lint';
import type { Problema } from '../app/proyecto/estado.svelte';

export function diagnosticos(estado: EditorState, ruta: string, problemas: readonly Problema[]): Diagnostic[] {
  return problemas.filter((p) => p.ruta === ruta && p.linea && p.linea > 0).map((p) => {
    const linea = estado.doc.line(Math.min(p.linea!, estado.doc.lines));
    return { from: linea.from, to: linea.to, severity: p.severidad === 'error' ? 'error' : 'warning', message: p.texto };
  });
}
