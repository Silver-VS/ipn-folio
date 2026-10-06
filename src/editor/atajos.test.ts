// SPDX-License-Identifier: AGPL-3.0-or-later
import { closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';
import { foldKeymap } from '@codemirror/language';
import { lintKeymap } from '@codemirror/lint';
import { searchKeymap } from '@codemirror/search';
import { describe, expect, it, vi } from 'vitest';
import { ATAJOS_PROPIOS, atajoDeEvento, instalarAtajosGlobales, usaTeclaReservada } from './atajos';

describe('teclas reservadas al navegador', () => {
  it('detecta Ctrl+W, Ctrl+T y Ctrl+N en cualquier variante', () => {
    for (const t of ['Mod-w', 'Ctrl-t', 'Ctrl-n', 'Ctrl-Shift-t', 'Mod-k Mod-n'])
      expect(usaTeclaReservada(t), t).toBe(true);
  });

  it('no marca otras combinaciones', () => {
    for (const t of ['Mod-s', 'Mod-k', 'Alt-t', 'Shift-t', 'Mod-Alt-n', 'Enter', 'Ctrl-Shift-k'])
      expect(usaTeclaReservada(t), t).toBe(false);
  });

  it('en macOS Ctrl-t y Ctrl-n (Emacs) no chocan, pero Cmd-w sí', () => {
    expect(usaTeclaReservada('Ctrl-t', true)).toBe(false);
    expect(usaTeclaReservada('Ctrl-n', true)).toBe(false);
    expect(usaTeclaReservada('Meta-w', true)).toBe(true);
    expect(usaTeclaReservada('Mod-n', true)).toBe(true);
  });

  it('ni los atajos propios ni los mapas de teclas de CodeMirror que usa el editor las ocupan', () => {
    const mapas = [
      ...ATAJOS_PROPIOS.map((a) => ({ key: a.tecla }) as { key?: string; mac?: string; win?: string; linux?: string }),
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      ...foldKeymap,
      ...closeBracketsKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
    ];
    const generales = mapas.flatMap((b) => [b.key, b.win, b.linux].filter((x): x is string => !!x));
    const deMac = mapas.flatMap((b) => (b.mac ? [b.mac] : []));
    expect(generales.length + deMac.length).toBeGreaterThan(50);
    expect(generales.filter((t) => usaTeclaReservada(t))).toEqual([]);
    expect(deMac.filter((t) => usaTeclaReservada(t, true))).toEqual([]);
  });
});

describe('atajos globales', () => {
  const evento = (key: string, extra: Partial<KeyboardEvent> = {}) =>
    ({ key, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, ...extra }) as KeyboardEvent;

  it('reconoce Ctrl+S, Cmd+K y descarta Alt o Mayús', () => {
    expect(atajoDeEvento(evento('s'))).toBe('guardar');
    expect(atajoDeEvento(evento('K', { ctrlKey: false, metaKey: true }))).toBe('paleta');
    expect(atajoDeEvento(evento('s', { shiftKey: true }))).toBeUndefined();
    expect(atajoDeEvento(evento('w'))).toBeUndefined();
    expect(atajoDeEvento(evento('s', { ctrlKey: false }))).toBeUndefined();
  });

  it('instala y desinstala el oyente, y evita el comportamiento del navegador', () => {
    let oyente: ((e: Event) => void) | undefined;
    const destino = {
      addEventListener: (_: string, fn: (e: Event) => void) => void (oyente = fn),
      removeEventListener: vi.fn(),
    };
    const guardar = vi.fn();
    const quitar = instalarAtajosGlobales(destino as unknown as Window, { guardar, paleta: vi.fn() });
    const e = { ...evento('s'), preventDefault: vi.fn() };
    oyente?.(e as unknown as Event);
    expect(guardar).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalledOnce();
    quitar();
    expect(destino.removeEventListener).toHaveBeenCalledOnce();
  });
});
