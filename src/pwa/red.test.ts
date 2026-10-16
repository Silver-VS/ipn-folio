// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { decidirDescarga, tipoDeRed } from './red';

describe('regla de red (D15)', () => {
  it('Wi-Fi o Ethernet: se descarga, con «Solo con Wi-Fi» activo o no', () => {
    for (const type of ['wifi', 'ethernet']) {
      expect(decidirDescarga(true, { type }), type).toBe('descargar');
      expect(decidirDescarga(false, { type }), type).toBe('descargar');
    }
  });

  it('datos móviles con «Solo con Wi-Fi» activo: no se descarga sin confirmar', () => {
    expect(decidirDescarga(true, { type: 'cellular' })).toBe('confirmar-datos');
  });

  it('datos móviles con «Solo con Wi-Fi» apagado: se descarga', () => {
    expect(decidirDescarga(false, { type: 'cellular' })).toBe('descargar');
  });

  it('tipo de red desconocido (Safari, Firefox o tipos como «bluetooth»): se pregunta, haya o no el ajuste', () => {
    expect(decidirDescarga(true, undefined)).toBe('preguntar');
    expect(decidirDescarga(false, undefined)).toBe('preguntar');
    expect(decidirDescarga(true, {})).toBe('preguntar');
    expect(decidirDescarga(true, { type: 'unknown' })).toBe('preguntar');
    expect(decidirDescarga(true, { type: 'other' })).toBe('preguntar');
    expect(decidirDescarga(true, { effectiveType: '4g' })).toBe('preguntar');
  });

  it('ahorro de datos activo: se pregunta siempre, aun en Wi-Fi', () => {
    expect(decidirDescarga(true, { type: 'wifi', saveData: true })).toBe('preguntar-ahorro');
    expect(decidirDescarga(false, { type: 'cellular', saveData: true })).toBe('preguntar-ahorro');
    expect(decidirDescarga(false, { saveData: true })).toBe('preguntar-ahorro');
  });

  it('tipoDeRed traduce los valores de la API', () => {
    expect(tipoDeRed({ type: 'wifi' })).toBe('wifi');
    expect(tipoDeRed({ type: 'ethernet' })).toBe('ethernet');
    expect(tipoDeRed({ type: 'cellular' })).toBe('datos-moviles');
    expect(tipoDeRed({ type: 'wimax' })).toBe('desconocida');
    expect(tipoDeRed(undefined)).toBe('desconocida');
  });

  it('sin navigator.connection (Node), el tipo es desconocido y se pregunta', () => {
    expect(decidirDescarga(true)).toBe('preguntar');
  });
});
