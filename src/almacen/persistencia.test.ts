// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { espacio, pedirPersistencia } from './persistencia';

describe('persistencia', () => {
  it('pide persistencia solo si aún no se tiene', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    expect(
      await pedirPersistencia({ persist, persisted: async () => false, estimate: async () => ({}) }),
    ).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    const otro = vi.fn();
    expect(
      await pedirPersistencia({ persist: otro, persisted: async () => true, estimate: async () => ({}) }),
    ).toBe(true);
    expect(otro).not.toHaveBeenCalled();
  });

  it('devuelve undefined si el navegador no lo ofrece o falla', async () => {
    expect(await pedirPersistencia(undefined)).toBeUndefined();
    const roto = {
      persist: async () => Promise.reject(new Error('no')),
      persisted: async () => false,
      estimate: async () => ({}),
    };
    expect(await pedirPersistencia(roto)).toBeUndefined();
  });

  it('informa el espacio usado y la cuota', async () => {
    const g = {
      persist: async () => true,
      persisted: async () => true,
      estimate: async () => ({ usage: 10, quota: 100 }),
    };
    expect(await espacio(g)).toEqual({ usado: 10, cuota: 100 });
    expect(await espacio({ ...g, estimate: async () => ({}) })).toBeUndefined();
    expect(await espacio(undefined)).toBeUndefined();
  });
});
