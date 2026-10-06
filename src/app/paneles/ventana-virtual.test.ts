// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { lineasDe, rangoVisible } from './ventana-virtual';

describe('ventana virtual', () => {
  it('al inicio dibuja las primeras líneas más el margen y deja el hueco de abajo', () => {
    const r = rangoVisible(0, 200, 20, 10_000, 5);
    expect(r).toEqual({ desde: 0, hasta: 15, antes: 0, despues: (10_000 - 15) * 20 });
  });

  it('en medio deja huecos arriba y abajo que suman el alto total', () => {
    const r = rangoVisible(20_000, 400, 20, 10_000, 10);
    expect(r.desde).toBe(990);
    expect(r.hasta).toBe(1030);
    expect(r.antes + (r.hasta - r.desde) * 20 + r.despues).toBe(10_000 * 20);
  });

  it('al final no se pasa del total', () => {
    const r = rangoVisible(1_000_000, 400, 20, 5_001, 10);
    expect(r.hasta).toBe(5_001);
    expect(r.desde).toBeLessThanOrEqual(r.hasta);
    expect(r.despues).toBe(0);
  });

  it('sin líneas o sin alto de línea no dibuja nada', () => {
    expect(rangoVisible(0, 100, 20, 0)).toEqual({ desde: 0, hasta: 0, antes: 0, despues: 0 });
    expect(rangoVisible(0, 100, 0, 50)).toEqual({ desde: 0, hasta: 0, antes: 0, despues: 0 });
  });

  it('lineasDe no inventa una línea vacía al final y entiende CRLF', () => {
    expect(lineasDe('')).toEqual([]);
    expect(lineasDe('a\nb\n')).toEqual(['a', 'b']);
    expect(lineasDe('a\r\nb')).toEqual(['a', 'b']);
    expect(lineasDe('a\n\nb')).toEqual(['a', '', 'b']);
  });
});
