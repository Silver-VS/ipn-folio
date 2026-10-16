// SPDX-License-Identifier: AGPL-3.0-or-later
// Atajos propios de Folio. Ctrl+S guarda ya (y en la sesión 09 también compila) y Ctrl+K abre la paleta (esqueleto).
// Nunca se usan Ctrl+W, Ctrl+T ni Ctrl+N: son del navegador (UX-WEBAPPS §1).

export type AccionAtajo = 'guardar' | 'paleta';

export const ATAJOS_PROPIOS: ReadonlyArray<{ tecla: string; accion: AccionAtajo }> = [
  { tecla: 'Mod-s', accion: 'guardar' },
  { tecla: 'Mod-k', accion: 'paleta' },
];

const RESERVADAS = new Set(['w', 't', 'n']);
const MODIFICADORES = new Set(['mod', 'ctrl', 'meta', 'cmd', 'shift']);
const DEL_NAVEGADOR_MAC = new Set(['mod', 'meta', 'cmd']);
const DEL_NAVEGADOR_OTROS = new Set(['mod', 'ctrl']);

/**
 * ¿Esta tecla de CodeMirror («Mod-w», «Ctrl-Shift-t», «Mod-k Mod-n»…) usa una combinación reservada al navegador?
 * En macOS el navegador usa Cmd (no Ctrl): `Ctrl-t` y `Ctrl-n` ahí son los atajos estilo Emacs de CodeMirror y no chocan.
 */
export function usaTeclaReservada(tecla: string, enMac = false): boolean {
  return tecla.split(/\s+/).some((paso) => {
    const partes = paso.split(/-(?=.)/);
    const final = (partes.pop() ?? '').toLowerCase();
    const mods = partes.map((p) => p.toLowerCase());
    return (
      RESERVADAS.has(final) &&
      mods.length > 0 &&
      mods.every((m) => MODIFICADORES.has(m)) &&
      mods.some((m) => (enMac ? DEL_NAVEGADOR_MAC : DEL_NAVEGADOR_OTROS).has(m))
    );
  });
}

/** Qué acción propia dispara un evento de teclado (Ctrl o Cmd + letra, sin Alt ni Mayús), si alguna. */
export function atajoDeEvento(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
): AccionAtajo | undefined {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return undefined;
  const k = e.key.toLowerCase();
  if (k === 's') return 'guardar';
  if (k === 'k') return 'paleta';
  return undefined;
}

type Destino = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/**
 * Captura Ctrl+S y Ctrl+K fuera del editor (si no, Ctrl+S abriría «Guardar página» del navegador).
 * Devuelve la función para desconectar.
 */
export function instalarAtajosGlobales(destino: Destino, acciones: Record<AccionAtajo, () => void>): () => void {
  const oyente = (evento: Event) => {
    const e = evento as KeyboardEvent;
    const accion = atajoDeEvento(e);
    if (!accion) return;
    e.preventDefault();
    acciones[accion]();
  };
  destino.addEventListener('keydown', oyente);
  return () => destino.removeEventListener('keydown', oyente);
}
