// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { PASOS_ZOOM, pasoZoom } from './visor-pdf';

describe('pasos de zoom', () => {
  it('acercar sube al siguiente paso y alejar baja al anterior', () => {
    expect(pasoZoom(1, 1)).toBe(1.25);
    expect(pasoZoom(1, -1)).toBe(0.8);
  });

  it('desde una escala intermedia (ajuste a ancho) salta al paso más cercano en esa dirección', () => {
    expect(pasoZoom(1.1, 1)).toBe(1.25);
    expect(pasoZoom(1.1, -1)).toBe(1);
  });

  it('se queda en los extremos', () => {
    expect(pasoZoom(PASOS_ZOOM[PASOS_ZOOM.length - 1]!, 1)).toBe(PASOS_ZOOM[PASOS_ZOOM.length - 1]);
    expect(pasoZoom(PASOS_ZOOM[0]!, -1)).toBe(PASOS_ZOOM[0]);
  });
});
