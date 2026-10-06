// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearAlmacenMemoria } from './almacen-memoria';
import { crearAutoguardado } from './autoguardado';

describe('autoguardado', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function preparar() {
    const almacen = crearAlmacenMemoria();
    const p = await almacen.crearProyecto({ nombre: 'Proyecto de ejemplo' });
    const escribir = vi.spyOn(almacen, 'escribir');
    return { almacen, p, escribir };
  }

  it('20 llamadas en 300 ms producen una sola escritura: pendiente → guardado', async () => {
    const { almacen, p, escribir } = await preparar();
    const auto = crearAutoguardado(almacen);
    const estados: string[] = [];
    auto.alCambiar(() => estados.push(auto.estado));
    expect(auto.estado).toBe('guardado');
    expect(auto.ultimoGuardado).toBeUndefined();
    for (let i = 1; i <= 20; i++) {
      auto.programar(p.id, 'main.tex', `v${i}`);
      await vi.advanceTimersByTimeAsync(15);
    }
    expect(auto.estado).toBe('pendiente');
    expect(escribir).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(escribir).toHaveBeenCalledTimes(1);
    expect(escribir).toHaveBeenCalledWith(p.id, 'main.tex', 'v20');
    expect(auto.estado).toBe('guardado');
    expect(auto.ultimoGuardado).toBeTypeOf('number');
    expect(estados).toEqual(['pendiente', 'guardado']);
    expect((await almacen.leer(p.id, 'main.tex'))!.contenido).toBe('v20');
  });

  it('nunca pasan más de 2 s sin guardar aunque se siga escribiendo', async () => {
    const { almacen, p, escribir } = await preparar();
    const auto = crearAutoguardado(almacen);
    for (let t = 0; t < 2000; t += 100) {
      auto.programar(p.id, 'main.tex', `v${t}`);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(escribir.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(escribir.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('agrupa por archivo: dos archivos, dos escrituras', async () => {
    const { almacen, p, escribir } = await preparar();
    const auto = crearAutoguardado(almacen);
    auto.programar(p.id, 'a.tex', '1');
    auto.programar(p.id, 'b.tex', '2');
    auto.programar(p.id, 'a.tex', '3');
    await vi.advanceTimersByTimeAsync(500);
    expect(escribir).toHaveBeenCalledTimes(2);
  });

  it('guardarTodo guarda de inmediato lo pendiente', async () => {
    const { almacen, p, escribir } = await preparar();
    const auto = crearAutoguardado(almacen);
    auto.programar(p.id, 'main.tex', 'rápido');
    await auto.guardarTodo();
    expect(escribir).toHaveBeenCalledTimes(1);
    expect(auto.estado).toBe('guardado');
    await vi.advanceTimersByTimeAsync(1000);
    expect(escribir).toHaveBeenCalledTimes(1);
  });

  it('si falla pasa a «error» y guardarTodo lo reintenta', async () => {
    const { almacen, p, escribir } = await preparar();
    escribir.mockRejectedValueOnce(new Error('sin espacio'));
    const auto = crearAutoguardado(almacen);
    auto.programar(p.id, 'main.tex', 'contenido');
    await vi.advanceTimersByTimeAsync(500);
    expect(auto.estado).toBe('error');
    await auto.guardarTodo();
    expect(auto.estado).toBe('guardado');
    expect((await almacen.leer(p.id, 'main.tex'))!.contenido).toBe('contenido');
  });

  it('protegerSalida pide confirmación solo con cambios sin guardar', async () => {
    const { almacen, p } = await preparar();
    const auto = crearAutoguardado(almacen);
    const ventana = new EventTarget();
    const quitar = auto.protegerSalida(ventana as unknown as Window);

    const limpio = new Event('beforeunload', { cancelable: true });
    ventana.dispatchEvent(limpio);
    expect(limpio.defaultPrevented).toBe(false);

    auto.programar(p.id, 'main.tex', 'sin guardar');
    const sucio = new Event('beforeunload', { cancelable: true });
    ventana.dispatchEvent(sucio);
    expect(sucio.defaultPrevented).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(auto.estado).toBe('guardado');

    quitar();
    auto.programar(p.id, 'main.tex', 'otra vez');
    const tras = new Event('beforeunload', { cancelable: true });
    ventana.dispatchEvent(tras);
    expect(tras.defaultPrevented).toBe(false);
    auto.cerrar();
  });
});

describe('autoguardado y cambios de ruta', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function preparar() {
    const almacen = crearAlmacenMemoria();
    const p = await almacen.crearProyecto({ nombre: 'Proyecto de ejemplo' }, [
      { ruta: 'main.tex', contenido: 'm' },
      { ruta: 'cap/a.tex', contenido: 'viejo' },
    ]);
    return { almacen, p, auto: crearAutoguardado(almacen) };
  }
  const rutas = async (almacen: Awaited<ReturnType<typeof preparar>>['almacen'], id: string) =>
    (await almacen.listarArchivos(id)).map((f) => f.ruta);

  it('renombrar una carpeta con un cambio pendiente lo lleva a la ruta nueva y no resucita la vieja', async () => {
    const { almacen, p, auto } = await preparar();
    auto.programar(p.id, 'cap/a.tex', 'nuevo');
    await auto.renombrar(p.id, 'cap', 'capitulos');
    await vi.advanceTimersByTimeAsync(3000);
    expect(await rutas(almacen, p.id)).toEqual(['capitulos/a.tex', 'main.tex']);
    expect((await almacen.leer(p.id, 'capitulos/a.tex'))!.contenido).toBe('nuevo');
    expect(auto.estado).toBe('guardado');
  });

  it('borrar con un cambio pendiente (incluso bajo una carpeta) no hace reaparecer el archivo', async () => {
    const { almacen, p, auto } = await preparar();
    auto.programar(p.id, 'cap/a.tex', 'nuevo');
    await auto.borrar(p.id, 'cap');
    await vi.advanceTimersByTimeAsync(3000);
    expect(await rutas(almacen, p.id)).toEqual(['main.tex']);
    expect(auto.estado).toBe('guardado');
  });

  it('mover a la papelera guarda lo pendiente primero y no deja el estado en error', async () => {
    const { almacen, p, auto } = await preparar();
    auto.programar(p.id, 'main.tex', 'ultimo');
    await auto.moverAPapelera(p.id);
    await vi.advanceTimersByTimeAsync(3000);
    expect((await almacen.leer(p.id, 'main.tex'))!.contenido).toBe('ultimo');
    expect(auto.estado).toBe('guardado');
  });

  it('descartar cancela lo pendiente de una ruta y de lo que cuelga de ella', async () => {
    const { almacen, p, auto } = await preparar();
    auto.programar(p.id, 'cap/a.tex', 'nuevo');
    auto.descartar(p.id, 'cap');
    expect(auto.estado).toBe('guardado');
    await vi.advanceTimersByTimeAsync(3000);
    expect((await almacen.leer(p.id, 'cap/a.tex'))!.contenido).toBe('viejo');
  });
});

describe('autoguardado: salida de la página', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('vacía el autoguardado al ocultarse la página y en pagehide', async () => {
    const almacen = crearAlmacenMemoria();
    const p = await almacen.crearProyecto({ nombre: 'Proyecto de ejemplo' });
    const auto = crearAutoguardado(almacen);
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const ventana = Object.assign(new EventTarget(), { document: doc });
    const { protegerSalida } = auto; // sin depender de `this`
    const desconectar = protegerSalida(ventana as never);

    auto.programar(p.id, 'main.tex', 'uno');
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(await almacen.leer(p.id, 'main.tex')).toBeUndefined();

    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect((await almacen.leer(p.id, 'main.tex'))!.contenido).toBe('uno');

    auto.programar(p.id, 'main.tex', 'dos');
    ventana.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect((await almacen.leer(p.id, 'main.tex'))!.contenido).toBe('dos');

    desconectar();
    auto.programar(p.id, 'main.tex', 'tres');
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect((await almacen.leer(p.id, 'main.tex'))!.contenido).toBe('dos');
  });
});
