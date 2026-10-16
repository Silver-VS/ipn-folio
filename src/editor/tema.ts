// SPDX-License-Identifier: AGPL-3.0-or-later
// Tema de CodeMirror hecho solo con variables semánticas --ipn-* (claro y oscuro salen de los tokens, sin colores fijos).
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

const temaBase = EditorView.theme({
  '&': {
    color: 'var(--ipn-texto)',
    backgroundColor: 'var(--ipn-superficie)',
    fontSize: 'var(--ipn-tamano-s)',
    height: '100%',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--ipn-fuente-mono)',
    // D24: las ligaduras van apagadas; los operadores se ven como se escriben.
    fontVariantLigatures: 'none',
    fontFeatureSettings: '"liga" 0, "calt" 0',
    lineHeight: '1.6',
    overflow: 'auto',
  },
  '.cm-content': { caretColor: 'var(--ipn-texto)', padding: 'var(--ipn-esp-2) 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ipn-texto)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--ipn-acento-suave)' },
  '.cm-activeLine': { backgroundColor: 'var(--ipn-hundido)' },
  '.cm-gutters': {
    backgroundColor: 'var(--ipn-superficie)',
    color: 'var(--ipn-tenue)',
    border: 'none',
    borderRight: '1px solid var(--ipn-linea)',
  },
  '.cm-activeLineGutter': { backgroundColor: 'var(--ipn-hundido)', color: 'var(--ipn-texto)' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--ipn-hundido)',
    border: '1px solid var(--ipn-linea)',
    color: 'var(--ipn-tenue)',
  },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--ipn-acento-suave)',
    outline: '1px solid var(--ipn-acento)',
  },
  '.cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket': {
    backgroundColor: 'var(--ipn-error-suave)',
    outline: '1px solid var(--ipn-error)',
  },
  '.cm-searchMatch': { backgroundColor: 'var(--ipn-aviso-suave)', outline: '1px solid var(--ipn-aviso)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--ipn-acento-suave)' },
  // Panel de búsqueda
  '.cm-panels': {
    backgroundColor: 'var(--ipn-hundido)',
    color: 'var(--ipn-texto)',
    fontFamily: 'var(--ipn-fuente-texto)',
  },
  '.cm-panels-top': { borderBottom: '1px solid var(--ipn-linea)' },
  '.cm-panels-bottom': { borderTop: '1px solid var(--ipn-linea)' },
  '.cm-panel.cm-search': { padding: 'var(--ipn-esp-2) var(--ipn-esp-6) var(--ipn-esp-2) var(--ipn-esp-2)' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': {
    fontFamily: 'var(--ipn-fuente-texto)',
    fontSize: 'var(--ipn-tamano-s)',
    color: 'var(--ipn-texto)',
    backgroundColor: 'var(--ipn-superficie)',
    border: '1px solid var(--ipn-borde-control)',
    borderRadius: 'var(--ipn-radio-s)',
    padding: 'var(--ipn-esp-1) var(--ipn-esp-2)',
    margin: 'var(--ipn-esp-1)',
  },
  '.cm-panel.cm-search button': { backgroundImage: 'none', cursor: 'pointer' },
  '.cm-panel.cm-search button:hover': { backgroundColor: 'var(--ipn-acento-suave)' },
  '.cm-panel.cm-search label': { fontSize: 'var(--ipn-tamano-s)', margin: '0 var(--ipn-esp-2)' },
  '.cm-panel.cm-search [name=close]': { color: 'var(--ipn-texto)' },
  // Marcas de error en el margen (se llenan en la sesión 09).
  '.cm-gutter-lint .cm-gutterElement': { color: 'var(--ipn-error)' },
  '.cm-diagnostic-error': { borderLeft: '3px solid var(--ipn-error)' },
  '.cm-diagnostic-warning': { borderLeft: '3px solid var(--ipn-aviso)' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--ipn-error)' },
  '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy var(--ipn-aviso)' },
});

const resaltado = HighlightStyle.define([
  { tag: [tags.keyword, tags.heading], color: 'var(--ipn-sintaxis-comando)' },
  { tag: tags.heading, fontWeight: '700' },
  { tag: [tags.className, tags.typeName], color: 'var(--ipn-sintaxis-entorno)', fontWeight: '700' },
  { tag: [tags.string, tags.meta], color: 'var(--ipn-sintaxis-argumento)' },
  { tag: [tags.operator, tags.variableName, tags.processingInstruction], color: 'var(--ipn-sintaxis-matematicas)' },
  { tag: [tags.bracket, tags.punctuation], color: 'var(--ipn-sintaxis-llave)' },
  { tag: tags.comment, color: 'var(--ipn-sintaxis-comentario)', fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.monospace, fontFamily: 'var(--ipn-fuente-mono)' },
]);

export const temaFolio: Extension = [temaBase, syntaxHighlighting(resaltado)];
