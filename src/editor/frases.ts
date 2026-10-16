// SPDX-License-Identifier: AGPL-3.0-or-later
// Traducción de los textos internos de CodeMirror (panel de búsqueda, plegado, lectores de pantalla). Las frases
// originales en inglés son las claves de `EditorState.phrases`; las traducciones salen de es.toml (principio 2).
import { t } from '../textos/t';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { plano } from '../textos/plano';

// CodeMirror arma estos avisos con fragmentos; se sustituye el efecto entero para traducir una frase completa.
export const avisosCodeMirror = EditorState.transactionFilter.of((tr) => {
  if (!tr.effects.some((efecto) => efecto.is(EditorView.announce))) return tr;
  return {
    ...tr,
    effects: tr.effects.map((efecto) => {
      if (!efecto.is(EditorView.announce)) return efecto;
      const coincidencia = /^current match\. ([\s\S]*) on line (\d+)\.$/.exec(efecto.value);
      const plegado = /^(Folded|Unfolded) lines (\d+) to (\d+)\.$/.exec(efecto.value);
      const [, texto = '', linea = ''] = coincidencia ?? [];
      const [, accion = '', desde = '', hasta = ''] = plegado ?? [];
      if (coincidencia)
        return EditorView.announce.of(
          plano(t('editor.cm.coincidencia_actual', { texto, linea })),
        );
      if (plegado)
        return EditorView.announce.of(
          plano(
            accion === 'Folded'
              ? t('editor.cm.lineas_plegadas', { desde, hasta })
              : t('editor.cm.lineas_desplegadas', { desde, hasta }),
          ),
        );
      return efecto;
    }),
  };
});

export function frasesCodeMirror(): Record<string, string> {
  return {
    Find: t('editor.cm.buscar'),
    Replace: t('editor.cm.reemplazar'),
    next: t('editor.cm.siguiente'),
    previous: t('editor.cm.anterior'),
    all: t('editor.cm.todas'),
    'match case': t('editor.cm.mayusculas'),
    regexp: t('editor.cm.regexp'),
    'by word': t('editor.cm.palabra'),
    replace: t('editor.cm.reemplazar_una'),
    'replace all': t('editor.cm.reemplazar_todas'),
    close: t('editor.cm.cerrar'),
    'Go to line': t('editor.cm.ir_a_linea'),
    go: t('editor.cm.ir'),
    'replaced match on line $': t('editor.cm.reemplazo_en_linea'),
    'replaced $ matches': t('editor.cm.reemplazos'),
    'Fold line': t('editor.cm.plegar'),
    'Unfold line': t('editor.cm.desplegar'),
    'folded code': t('editor.cm.codigo_plegado'),
    unfold: t('editor.cm.desplegar_corto'),
    'Control character': t('editor.cm.caracter_control'),
  };
}
