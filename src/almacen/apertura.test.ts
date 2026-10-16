// SPDX-License-Identifier: AGPL-3.0-or-later
// Qué hace `crearAlmacen` según cómo falle la apertura de IndexedDB (la migración 1 → 2 corre al abrir).
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';

// Función simple (no `vi.fn`): el seguimiento de promesas de `vi.fn` deja un rechazo sin atender.
const apertura = vi.hoisted(() => ({ nombre: 'AbortError' }));
vi.mock('idb', () => ({
  openDB: async () => {
    throw new DOMException('fallo simulado', apertura.nombre);
  },
}));

import { crearAlmacenIdb } from './almacen-idb';
import { crearAlmacen } from './index';

describe('apertura de la base', () => {
  for (const nombre of ['AbortError', 'QuotaExceededError', 'UnknownError', 'ConstraintError']) {
    it(`${nombre} al abrir o migrar NO cae a memoria: error persistente (apertura_fallida)`, async () => {
      apertura.nombre = nombre;
      await expect(crearAlmacenIdb({ nombreBD: 'x' })).rejects.toMatchObject({ codigo: 'apertura_fallida' });
      await expect(crearAlmacen({ nombreBD: 'x' })).rejects.toMatchObject({ codigo: 'apertura_fallida' });
    });
  }

  for (const nombre of ['SecurityError', 'InvalidStateError']) {
    it(`${nombre} (ventana privada o sin permiso) sí cae a memoria`, async () => {
      apertura.nombre = nombre;
      const { persistente } = await crearAlmacen({ nombreBD: 'x' });
      expect(persistente).toBe(false);
    });
  }

  it('VersionError no cae a memoria', async () => {
    apertura.nombre = 'VersionError';
    await expect(crearAlmacen({ nombreBD: 'x' })).rejects.toMatchObject({ codigo: 'version_nueva' });
  });
});
