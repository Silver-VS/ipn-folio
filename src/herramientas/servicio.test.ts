// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, it, vi } from 'vitest';
import { BD_PAQUETES_EMSCRIPTEN } from '../pwa/nombres';
import { borrarBaseDePaquetes } from './servicio';

afterEach(() => vi.unstubAllGlobals());

it('3: borra solo la base de Folio y rechaza si otra pestaña bloquea el borrado', async () => {
  const peticion = {} as IDBOpenDBRequest;
  const borrar = vi.fn(() => peticion);
  vi.stubGlobal('indexedDB', { deleteDatabase: borrar });
  const resultado = borrarBaseDePaquetes();
  expect(BD_PAQUETES_EMSCRIPTEN).toMatch(/^folio-/);
  expect(borrar).toHaveBeenCalledWith(BD_PAQUETES_EMSCRIPTEN);
  expect(peticion.onblocked).toBeTypeOf('function');
  peticion.onblocked!(new Event('blocked') as IDBVersionChangeEvent);
  await expect(resultado).rejects.toThrow();
});
