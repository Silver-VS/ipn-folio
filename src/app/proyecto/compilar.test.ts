// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearAlmacenMemoria, crearAutoguardado, crearAvisos } from '../../almacen';
import { crearMotorFalso } from '../../compilacion/orquestador/motor-falso';
import { EstadoProyecto } from './estado.svelte';
import { conectarCompilacion } from './compilar';

async function preparar(instalada = true) {
  const almacen = crearAlmacenMemoria();
  const proyecto = await almacen.crearProyecto({ nombre: 'Prueba', principal: 'main.tex' }, [
    { ruta: 'main.tex', contenido: '\\documentclass{article}\n\\begin{document}Texto\\end{document}' },
  ]);
  const auto = crearAutoguardado(almacen);
  const avisos = crearAvisos({ nombreCanal: `compilar-${proyecto.id}` });
  const estado = (await EstadoProyecto.abrir(
    {
      almacen,
      auto,
      avisos,
      persistente: true,
      reloj: { horaConfiable: () => undefined, medir: async () => false, medirSiToca: async () => false },
      cerrar() {},
    },
    proyecto.id,
  ))!;
  const tienda = { instalada, solicitar: vi.fn(async () => {}) };
  const falso = crearMotorFalso();
  const fabrica = vi.fn(() => falso.motor);
  const controlador = conectarCompilacion(estado, tienda, fabrica);
  return { estado, tienda, falso, fabrica, controlador, almacen, auto };
}

afterEach(() => vi.useRealTimers());

describe('integración guardar y compilar', () => {
  it('la compilación automática empieza apagada y espera un segundo de calma al activarla', async () => {
    vi.useFakeTimers();
    const p = await preparar();
    p.estado.alEditar('main.tex', 'inicial');
    await vi.advanceTimersByTimeAsync(1500);
    expect(p.fabrica).not.toHaveBeenCalled();
    p.estado.compilacionAutomatica = true;
    p.estado.alEditar('main.tex', 'uno');
    await vi.advanceTimersByTimeAsync(700);
    p.estado.alEditar('main.tex', 'dos');
    await vi.advanceTimersByTimeAsync(700);
    expect(p.fabrica).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(p.estado.compilacion).toBe('listo');
    p.controlador.destruir();
  });
  it('guarda incluso sin instalación y pide autorización de red antes de construir el Motor', async () => {
    const p = await preparar(false);
    p.estado.alEditar('main.tex', 'cambio pendiente');
    await p.controlador.solicitar();
    expect((await p.almacen.leer(p.estado.id, 'main.tex'))?.contenido).toBe('cambio pendiente');
    expect(p.tienda.solicitar).toHaveBeenCalledOnce();
    expect(p.fabrica).not.toHaveBeenCalled();
    p.controlador.destruir();
  });

  it('compila la instantánea guardada, conserva el PDF bueno ante un fallo y permite recuperarse', async () => {
    const p = await preparar();
    p.estado.alEditar('main.tex', '\\documentclass{article}\n\\begin{document}Último\\end{document}');
    await p.controlador.solicitar();
    expect(p.falso.montajes[0]?.archivos[0]?.contenido).toContain('Último');
    expect(p.estado.compilacion).toBe('listo');
    const pdf = p.estado.pdf;
    const ejecutar = p.falso.motor.ejecutar;
    p.falso.motor.ejecutar = async () => {
      throw new Error('fallo controlado');
    };
    await p.controlador.solicitar();
    expect(p.estado.compilacion).toBe('error');
    expect(p.estado.pdf).toBe(pdf);
    expect(p.estado.pdfAnterior).toBe(true);
    p.falso.motor.ejecutar = ejecutar;
    await p.controlador.solicitar();
    expect(p.estado.compilacion).toBe('listo');
    expect(p.estado.pdfAnterior).toBe(false);
    p.controlador.destruir();
  });

  it('un conflicto bloquea compilación y cierre de archivo sin perder su estado local', async () => {
    const p = await preparar();
    p.estado.conflictos = ['main.tex'];
    p.estado.cerrarArchivo('main.tex');
    expect(p.estado.abiertos).toContain('main.tex');
    await p.controlador.solicitar();
    expect(p.fabrica).not.toHaveBeenCalled();
    expect(p.estado.mensajes.at(-1)?.texto).toContain('Conserva tu versión');
    p.controlador.destruir();
  });

  it('agrupa nuevas solicitudes y cancela solo después de dos segundos', async () => {
    vi.useFakeTimers();
    const p = await preparar();
    let liberar!: () => void;
    p.falso.motor.alEjecutar = () =>
      new Promise<void>((resolve) => {
        liberar = resolve;
      });
    const cancelar = vi.spyOn(p.falso.motor, 'cancelar');
    const primera = p.controlador.solicitar();
    await vi.waitFor(() => expect(liberar).toBeTypeOf('function'));
    expect(p.controlador.solicitar()).toBe(primera);
    expect(cancelar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2100);
    p.controlador.solicitar();
    expect(cancelar).toHaveBeenCalled();
    p.falso.motor.alEjecutar = undefined;
    liberar();
    await primera;
    expect(p.falso.comandos.length).toBe(2);
    p.controlador.destruir();
  });
});
