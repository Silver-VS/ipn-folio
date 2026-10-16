// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { acerca } from '../../acerca';
import { crearAlmacenMemoria, crearAutoguardado, crearRelojConfiable, type FetchHora } from '../../almacen';
import { crearPurga, leerDias, AJUSTE_DIAS, AJUSTE_ULTIMA_PURGA } from './purga';

const DIA = 86_400_000;
const HORA = 3_600_000;
const T0 = 1_800_000_000_000;
const config = acerca.papelera;

function respuesta(fecha: number | undefined, status = 200) {
  const headers = new Headers();
  if (fecha !== undefined) headers.set('Date', new Date(fecha).toUTCString());
  return { ok: status < 400, status, headers };
}

/** Un mundo con reloj del equipo y del sitio controlables, un proyecto con un archivo en la papelera. */
async function montar(sitio: { hora: number | undefined | 'sin-red' } = { hora: T0 }) {
  const local = { ahora: T0 };
  const reloj = crearRelojConfiable({
    url: 'x',
    ahora: () => local.ahora,
    fetch: (async () => {
      if (sitio.hora === 'sin-red') throw new TypeError('sin red');
      return respuesta(sitio.hora);
    }) as FetchHora,
  });
  const almacen = crearAlmacenMemoria({
    ahora: () => local.ahora,
    horaConfiable: () => reloj.horaConfiable(),
    margenDias: config.margenDias,
  });
  const auto = crearAutoguardado(almacen);
  const p = await almacen.crearProyecto({ nombre: 'Proyecto de ejemplo' }, [
    { ruta: 'a.tex', contenido: 'A' },
  ]);
  const purga = crearPurga({ almacen, auto, reloj, config });
  return { almacen, auto, reloj, purga, local, sitio, p };
}

describe('leerDias', () => {
  it('sin ajuste vale 30; con un valor inválido también', async () => {
    const almacen = crearAlmacenMemoria();
    expect(await leerDias(almacen, config)).toBe(30);
    await almacen.guardarAjuste(AJUSTE_DIAS, 15);
    expect(await leerDias(almacen, config)).toBe(30);
    await almacen.guardarAjuste(AJUSTE_DIAS, 90);
    expect(await leerDias(almacen, config)).toBe(90);
  });
});

describe('purga', () => {
  it('al abrir sin conexión no purga nada, aunque el elemento sea muy viejo', async () => {
    const { almacen, auto, purga, local, sitio, p } = await montar({ hora: 'sin-red' });
    const e = await auto.borrar(p.id, 'a.tex');
    local.ahora += 400 * DIA;
    expect(await purga.purgar(true)).toEqual([]);
    expect((await almacen.listarPapelera()).map((x) => x.id)).toEqual([e.id]);
    // Cuando vuelve la red, el plazo cuenta desde la primera hora confiable: el mismo día no se borra.
    sitio.hora = T0 + 400 * DIA;
    expect(await purga.purgar(true)).toEqual([]);
    expect(await almacen.listarPapelera()).toHaveLength(1);
  });

  it('con hora confiable purga a los 31 días y guarda la marca de la última purga', async () => {
    const { almacen, auto, purga, local, sitio, p } = await montar();
    await auto.borrar(p.id, 'a.tex');
    // Primera medición: el elemento ya traía hora confiable? No (nunca se midió): queda por resellar.
    await purga.purgar(true);
    local.ahora = T0 + 31 * DIA;
    sitio.hora = T0 + 31 * DIA;
    expect((await purga.purgar(true)).map((x) => x.ruta)).toEqual(['a.tex']);
    expect(await almacen.listarPapelera()).toEqual([]);
    expect(await almacen.leerAjuste(AJUSTE_ULTIMA_PURGA)).toBeGreaterThanOrEqual(T0 + 31 * DIA);
  });

  it('un reloj del equipo adelantado no adelanta la purga: manda la hora del sitio', async () => {
    const { almacen, auto, purga, local, sitio, p } = await montar();
    local.ahora = T0 + 100 * DIA; // el equipo va 100 días adelantado; el sitio dice T0
    await purga.purgar(true);
    const e = await auto.borrar(p.id, 'a.tex');
    expect(e.fechaConfiable).toBe(true);
    expect(Math.abs(e.fecha - T0)).toBeLessThan(5000);
    // Pasan 20 días reales: ni el equipo adelantado ni la medición adelantan el borrado.
    local.ahora += 20 * DIA;
    sitio.hora = T0 + 20 * DIA;
    expect(await purga.purgar(true)).toEqual([]);
    expect(await almacen.listarPapelera()).toHaveLength(1);
    local.ahora += 11 * DIA;
    sitio.hora = T0 + 31 * DIA;
    expect(await purga.purgar(true)).toHaveLength(1);
  });

  it('al volver a la pestaña solo purga si pasaron 6 h desde la última purga', async () => {
    const { almacen, auto, purga, local, sitio, p } = await montar();
    await purga.purgar(true);
    await auto.borrar(p.id, 'a.tex');
    local.ahora = T0 + 31 * DIA;
    sitio.hora = T0 + 31 * DIA;
    await almacen.guardarAjuste(AJUSTE_ULTIMA_PURGA, T0 + 31 * DIA - 5 * HORA);
    expect(await purga.purgar(false)).toEqual([]);
    await almacen.guardarAjuste(AJUSTE_ULTIMA_PURGA, T0 + 31 * DIA - 7 * HORA);
    expect((await purga.purgar(false)).length).toBe(1);
  });

  it('usa los días que eligió el alumno', async () => {
    const { almacen, auto, purga, local, sitio, p } = await montar();
    await purga.purgar(true);
    await almacen.guardarAjuste(AJUSTE_DIAS, 7);
    await auto.borrar(p.id, 'a.tex');
    local.ahora = T0 + 8 * DIA;
    sitio.hora = T0 + 8 * DIA;
    expect((await purga.purgar(true)).length).toBe(1);
  });

  it('se engancha a visibilitychange y se puede detener', async () => {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
    const purgarCaducados = vi.fn(async () => []);
    const reloj = crearRelojConfiable({ url: 'x', ahora: () => T0, fetch: async () => respuesta(T0) });
    const almacen = crearAlmacenMemoria();
    const purga = crearPurga({
      almacen,
      auto: { purgarCaducados },
      reloj,
      config,
      documento: doc as unknown as Document,
    });
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(purgarCaducados).toHaveBeenCalledTimes(1));
    purga.detener();
    doc.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 20));
    expect(purgarCaducados).toHaveBeenCalledTimes(1);
  });
});
