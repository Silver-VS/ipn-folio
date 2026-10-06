// SPDX-License-Identifier: AGPL-3.0-or-later
// Traducción de los textos internos de CodeMirror (panel de búsqueda, plegado, lectores de pantalla). Las frases
// originales en inglés son las claves de `EditorState.phrases`; las traducciones salen de es.toml (principio 2).
import { t } from '../textos/t';

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
    'current match': t('editor.cm.coincidencia_actual'),
    'on line': t('editor.cm.en_linea'),
    'Folded lines': t('editor.cm.lineas_plegadas'),
    'Unfolded lines': t('editor.cm.lineas_desplegadas'),
    to: t('editor.cm.hasta'),
    'Fold line': t('editor.cm.plegar'),
    'Unfold line': t('editor.cm.desplegar'),
    'folded code': t('editor.cm.codigo_plegado'),
    unfold: t('editor.cm.desplegar_corto'),
    'Control character': t('editor.cm.caracter_control'),
  };
}
