// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, it, vi } from 'vitest';
import { registrarServiceWorker } from './registro';

afterEach(() => vi.unstubAllGlobals());

function preparar(esperando = false) {
  const contenedor = Object.assign(new EventTarget(), { controller: {}, register: vi.fn() });
  const nuevo = Object.assign(new EventTarget(), { state: 'installing' });
  const registro = Object.assign(new EventTarget(), {
    waiting: esperando ? { postMessage: vi.fn() } : null,
    installing: nuevo,
  });
  contenedor.register.mockResolvedValue(registro);
  vi.stubGlobal('navigator', { serviceWorker: contenedor });
  vi.stubGlobal('document', Object.assign(new EventTarget(), { baseURI: 'http://localhost/' }));
  const reload = vi.fn();
  vi.stubGlobal('location', { reload });
  return { contenedor, registro, nuevo, reload };
}

it('1: otra pestaña activa la actualización y esta ofrece recargar sin waiting', async () => {
  const { contenedor, reload } = preparar();
  const aviso = vi.fn();
  await registrarServiceWorker({ alHaberActualizacion: aviso });
  contenedor.dispatchEvent(new Event('controllerchange'));
  expect(aviso).toHaveBeenCalledOnce();
  aviso.mock.calls[0]![0]();
  expect(reload).toHaveBeenCalledOnce();
});

it('18: observa una instalación que ya estaba en curso al registrar', async () => {
  const { registro, nuevo } = preparar();
  const aviso = vi.fn();
  await registrarServiceWorker({ alHaberActualizacion: aviso });
  registro.waiting = { postMessage: vi.fn() };
  nuevo.state = 'installed';
  nuevo.dispatchEvent(new Event('statechange'));
  expect(aviso).toHaveBeenCalledOnce();
});
