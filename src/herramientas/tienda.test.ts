// SPDX-License-Identifier: AGPL-3.0-or-later
// La tienda aplica la regla de red (D15) antes de pedir al instalador que descargue.
import { describe, expect, it, vi } from 'vitest';
import { AJUSTE_SOLO_WIFI, crearAlmacenMemoria } from '../almacen';
import type { InfoConexion } from '../pwa/red';
import { ErrorInstalacion, type Instalador } from './instalador';
import { ESTADO_INICIAL } from './estado';
import { TiendaHerramientas } from './tienda.svelte';

function armar(conexion: InfoConexion | undefined) {
  const almacen = crearAlmacenMemoria();
  const instalador = {
    ocupado: false,
    estado: vi.fn(async () => ({ ...ESTADO_INICIAL })),
    instalar: vi.fn(async () => undefined),
    pausar: vi.fn(),
    cancelar: vi.fn(),
    quitar: vi.fn(async () => undefined),
  };
  const tienda = new TiendaHerramientas({
    almacen,
    instalador: instalador as unknown as Instalador,
    conexion: () => conexion,
  });
  return { almacen, instalador, tienda };
}

describe('tienda de herramientas', () => {
  it.each(['pausada', 'error'])(
    '6: reanudar desde %s vuelve a preguntar con datos móviles',
    async (estado) => {
      const { tienda, instalador } = armar({ type: 'cellular' });
      await tienda.cargar();
      tienda.pausada = estado === 'pausada';
      tienda.latex = { ...ESTADO_INICIAL, estado: estado === 'pausada' ? 'descargando' : 'error' };
      await tienda.reanudar();
      expect(tienda.pregunta).toBe('datos-moviles');
      expect(instalador.instalar).not.toHaveBeenCalled();
    },
  );

  it('13: mantiene el bloqueo hasta terminar la lectura del estado', async () => {
    const { tienda, instalador } = armar({ type: 'wifi' });
    await tienda.cargar();
    let resolver!: (valor: typeof ESTADO_INICIAL) => void;
    instalador.estado.mockImplementationOnce(() => new Promise((r) => (resolver = r)));
    const primera = tienda.solicitar();
    await vi.waitFor(() => expect(resolver).toBeTypeOf('function'));
    const segunda = tienda.iniciar();
    expect(instalador.instalar).toHaveBeenCalledOnce();
    resolver({ ...ESTADO_INICIAL, estado: 'instalada' });
    await Promise.all([primera, segunda]);
    expect(tienda.instalada).toBe(true);
  });
  it('«Solo con Wi-Fi» viene activado por omisión (D15)', async () => {
    const { tienda } = armar({ type: 'wifi' });
    await tienda.cargar();
    expect(tienda.soloWifi).toBe(true);
  });

  it('con Wi-Fi descarga sin preguntar', async () => {
    const { tienda, instalador } = armar({ type: 'wifi' });
    await tienda.cargar();
    await tienda.solicitar();
    expect(tienda.pregunta).toBeNull();
    expect(instalador.instalar).toHaveBeenCalledOnce();
  });

  it('con datos móviles simulados y «Solo con Wi-Fi» activo no descarga sin confirmar', async () => {
    const { tienda, instalador } = armar({ type: 'cellular' });
    await tienda.cargar();
    await tienda.solicitar();
    expect(tienda.pregunta).toBe('datos-moviles');
    expect(instalador.instalar).not.toHaveBeenCalled();
    await tienda.confirmar();
    expect(tienda.pregunta).toBeNull();
    expect(instalador.instalar).toHaveBeenCalledOnce();
  });

  it('rechazar la pregunta no descarga nada', async () => {
    const { tienda, instalador } = armar({ type: 'cellular' });
    await tienda.cargar();
    await tienda.solicitar();
    tienda.rechazar();
    expect(tienda.pregunta).toBeNull();
    expect(instalador.instalar).not.toHaveBeenCalled();
  });

  it('con datos móviles y el ajuste apagado descarga; el ajuste se guarda en el almacén', async () => {
    const { tienda, instalador, almacen } = armar({ type: 'cellular' });
    await tienda.cargar();
    await tienda.cambiarSoloWifi(false);
    expect(await almacen.leerAjuste(AJUSTE_SOLO_WIFI)).toBe(false);
    await tienda.solicitar();
    expect(instalador.instalar).toHaveBeenCalledOnce();
  });

  it('tipo de red desconocido y ahorro de datos: se pregunta', async () => {
    const a = armar(undefined);
    await a.tienda.cargar();
    await a.tienda.solicitar();
    expect(a.tienda.pregunta).toBe('desconocida');
    const b = armar({ type: 'wifi', saveData: true });
    await b.tienda.cargar();
    await b.tienda.solicitar();
    expect(b.tienda.pregunta).toBe('ahorro');
    expect(a.instalador.instalar).not.toHaveBeenCalled();
    expect(b.instalador.instalar).not.toHaveBeenCalled();
  });

  it('un fallo de red deja el código de error para mostrar el mensaje; pausar deja la descarga en pausa', async () => {
    const { tienda, instalador } = armar({ type: 'wifi' });
    await tienda.cargar();
    instalador.instalar.mockRejectedValueOnce(new ErrorInstalacion('red'));
    await tienda.solicitar();
    expect(tienda.error).toBe('red');
    instalador.instalar.mockRejectedValueOnce(new ErrorInstalacion('pausado'));
    await tienda.iniciar();
    expect(tienda.pausada).toBe(true);
    expect(tienda.error).toBeNull();
  });
});
