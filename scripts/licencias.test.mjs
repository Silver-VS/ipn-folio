// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { evaluar } from './licencias.mjs';

describe('evaluar (licencias)', () => {
  it('acepta licencias compatibles y expresiones OR con una opción permitida', () => {
    expect(evaluar('MIT')).toBe('permitida');
    expect(evaluar('CC0-1.0')).toBe('permitida');
    expect(evaluar('(MIT OR GPL-2.0-only)')).toBe('permitida');
    expect(evaluar('MIT AND Apache-2.0')).toBe('permitida');
  });
  it('rechaza GPL-2.0-only (incompatible con AGPL-3.0)', () => {
    expect(evaluar('GPL-2.0-only')).toBe('prohibida');
    expect(evaluar('MIT AND GPL-2.0-only')).toBe('prohibida');
  });
  it('respeta la precedencia SPDX: paréntesis primero y AND antes que OR', () => {
    expect(evaluar('(MIT OR Apache-2.0) AND GPL-2.0-only')).toBe('prohibida');
    expect(evaluar('MIT OR (Apache-2.0 AND GPL-2.0-only)')).toBe('permitida');
    expect(evaluar('MIT OR Apache-2.0 AND GPL-2.0-only')).toBe('permitida');
    expect(evaluar('GPL-2.0-only OR (MIT AND ISC)')).toBe('permitida');
  });
  it('trata GPL-2.0+ y GPL-2.0-or-later como compatibles', () => {
    expect(evaluar('GPL-2.0+')).toBe('permitida');
    expect(evaluar('GPL-2.0-or-later')).toBe('permitida');
  });
  it('manda a revisar lo que no reconoce', () => {
    expect(evaluar('')).toBe('revisar');
    expect(evaluar('Licencia-Rara-1.0')).toBe('revisar');
  });
});
