// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { crearRelojConfiable, medirHora, type FetchHora } from './hora';

const T0 = 1_800_000_000_000;

/** Respuesta falsa con la cabecera `Date` dada (o sin ella). */
function respuesta(fecha: number | undefined, status = 200) {
  const headers = new Headers();
  if (fecha !== undefined) headers.set('Date', new Date(fecha).toUTCString());
  return { ok: status < 400, status, headers };
}

describe('medirHora', () => {
  it('pide HEAD sin caché y calcula el desfase contra el punto medio local', async () => {
    let local = T0;
    const fetchFalso = vi.fn<FetchHora>(async () => {
      local += 400; // la petición tarda 400 ms
      return respuesta(T0 + 5 * 60_000 + 200);
    });
    const m = await medirHora(fetchFalso, () => local, 'https://ejemplo.mx/hora.json');
    expect(fetchFalso).toHaveBeenCalledWith('https://ejemplo.mx/hora.json', {
      method: 'HEAD',
      cache: 'no-store',
    });
    // El servidor va 5 min adelante (la cabecera Date tiene resolución de 1 s).
    expect(Math.abs(m!.desfase - 5 * 60_000)).toBeLessThanOrEqual(1000);
  });

  it('un equipo adelantado da desfase negativo', async () => {
    const m = await medirHora(
      async () => respuesta(T0),
      () => T0 + 3 * 86_400_000,
      'x',
    );
    expect(m!.desfase).toBeLessThan(-2.9 * 86_400_000);
  });

  it('un equipo atrasado da desfase positivo', async () => {
    const m = await medirHora(
      async () => respuesta(T0),
      () => T0 - 3 * 86_400_000,
      'x',
    );
    expect(m!.desfase).toBeGreaterThan(2.9 * 86_400_000);
  });

  it('sin cabecera Date, con Date inválida, con error de red o error del servidor: null', async () => {
    expect(
      await medirHora(
        async () => respuesta(undefined),
        () => T0,
        'x',
      ),
    ).toBeNull();
    const rara = { ok: true, status: 200, headers: new Headers({ Date: 'no es una fecha' }) };
    expect(
      await medirHora(
        async () => rara,
        () => T0,
        'x',
      ),
    ).toBeNull();
    expect(
      await medirHora(
        async () => {
          throw new TypeError('sin red');
        },
        () => T0,
        'x',
      ),
    ).toBeNull();
    expect(
      await medirHora(
        async () => respuesta(T0, 503),
        () => T0,
        'x',
      ),
    ).toBeNull();
  });

  it('un 404 del propio sitio igual trae Date y sirve', async () => {
    const m = await medirHora(
      async () => respuesta(T0 + 1000, 404),
      () => T0,
      'x',
    );
    expect(m).not.toBeNull();
  });
});

describe('crearRelojConfiable', () => {
  it('sin medición no hay hora confiable; con ella, la hora local más el desfase', async () => {
    let local = T0;
    const reloj = crearRelojConfiable({
      url: 'x',
      ahora: () => local,
      fetch: async () => respuesta(T0 + 86_400_000),
    });
    expect(reloj.horaConfiable()).toBeUndefined();
    expect(await reloj.medir()).toBe(true);
    local += 10_000;
    expect(Math.abs(reloj.horaConfiable()! - (T0 + 86_400_000 + 10_000))).toBeLessThanOrEqual(1000);
  });

  it('una medición fallida conserva la anterior', async () => {
    let falla = false;
    const reloj = crearRelojConfiable({
      url: 'x',
      ahora: () => T0,
      fetch: async () => (falla ? respuesta(undefined) : respuesta(T0)),
    });
    await reloj.medir();
    falla = true;
    expect(await reloj.medir()).toBe(true);
    expect(reloj.horaConfiable()).toBeDefined();
  });

  it('un reloj que nunca consigue medir sigue sin hora', async () => {
    const reloj = crearRelojConfiable({ url: 'x', ahora: () => T0, fetch: async () => respuesta(undefined) });
    expect(await reloj.medir()).toBe(false);
    expect(reloj.horaConfiable()).toBeUndefined();
  });

  it('medirSiToca no repite la petición antes del intervalo', async () => {
    let local = T0;
    const f = vi.fn<FetchHora>(async () => respuesta(local));
    const reloj = crearRelojConfiable({ url: 'x', ahora: () => local, fetch: f });
    await reloj.medirSiToca(1000);
    await reloj.medirSiToca(1000);
    expect(f).toHaveBeenCalledTimes(1);
    local += 2000;
    await reloj.medirSiToca(1000);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('dos mediciones a la vez comparten la misma petición', async () => {
    const f = vi.fn<FetchHora>(async () => respuesta(T0));
    const reloj = crearRelojConfiable({ url: 'x', ahora: () => T0, fetch: f });
    await Promise.all([reloj.medir(), reloj.medir()]);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
