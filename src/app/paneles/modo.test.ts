// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { CONSULTA_COMPACTO, modoSegunCoincidencia, observarModo } from './modo';

function ventanaFalsa(inicial: boolean) {
  const oyentes = new Set<(e: Event) => void>();
  const consulta = {
    matches: inicial,
    addEventListener: (_: string, fn: (e: Event) => void) => void oyentes.add(fn),
    removeEventListener: (_: string, fn: (e: Event) => void) => void oyentes.delete(fn),
  };
  return {
    ventana: { matchMedia: vi.fn(() => consulta) },
    cambiar(matches: boolean) {
      consulta.matches = matches;
      for (const fn of oyentes) fn({ matches } as unknown as Event);
    },
    oyentes,
  };
}

describe('modo del espacio de proyecto', () => {
  it('coincidencia de la consulta -> compacto; si no, amplio', () => {
    expect(modoSegunCoincidencia(true)).toBe('compacto');
    expect(modoSegunCoincidencia(false)).toBe('amplio');
  });

  it('la consulta cubre teléfonos y tabletas táctiles chicas', () => {
    expect(CONSULTA_COMPACTO).toContain('(max-width: 767px)');
    expect(CONSULTA_COMPACTO).toContain('(pointer: coarse) and (max-width: 1023px)');
  });

  it('el modo inicial sale de la consulta', () => {
    expect(observarModo(ventanaFalsa(true).ventana, () => {}).actual).toBe('compacto');
    expect(observarModo(ventanaFalsa(false).ventana, () => {}).actual).toBe('amplio');
  });

  it('avisa solo cuando el modo cambia y deja de avisar al detener', () => {
    const f = ventanaFalsa(false);
    const avisos: string[] = [];
    const obs = observarModo(f.ventana, (m) => avisos.push(m));
    f.cambiar(false);
    f.cambiar(true);
    f.cambiar(true);
    f.cambiar(false);
    expect(avisos).toEqual(['compacto', 'amplio']);
    expect(obs.actual).toBe('amplio');
    obs.detener();
    expect(f.oyentes.size).toBe(0);
    f.cambiar(true);
    expect(avisos).toHaveLength(2);
  });
});
