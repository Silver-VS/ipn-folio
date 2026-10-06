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
