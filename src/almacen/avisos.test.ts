// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { crearAlmacenMemoria } from './almacen-memoria';
import { conectarAvisos, crearAvisos } from './avisos';
import type { Aviso } from './avisos';

const esperar = (ms = 30) => new Promise((r) => setTimeout(r, ms));

describe('avisos entre pestañas', () => {
  it('una pestaña avisa a la otra y no recibe sus propios mensajes', async () => {
    const canal = `prueba-${Math.random()}`;
    const a = crearAvisos({ nombreCanal: canal, origen: 'pestana-a' });
    const b = crearAvisos({ nombreCanal: canal, origen: 'pestana-b' });
    const enA: Aviso[] = [];
    const enB: Aviso[] = [];
    a.escuchar((x) => enA.push(x));
    b.escuchar((x) => enB.push(x));

    a.publicar({ tipo: 'cambio-archivo', proyectoId: 'p1', ruta: 'main.tex' });
    await esperar();
    expect(enB).toEqual([
      { tipo: 'cambio-archivo', proyectoId: 'p1', ruta: 'main.tex', origen: 'pestana-a' },
    ]);
    expect(enA).toEqual([]);
    a.cerrar();
    b.cerrar();
  });

  it('ignora un mensaje propio aunque llegue por el canal y mensajes mal formados', async () => {
    const canal = `prueba-${Math.random()}`;
    const a = crearAvisos({ nombreCanal: canal, origen: 'pestana-a' });
    const recibidos: Aviso[] = [];
    a.escuchar((x) => recibidos.push(x));
    const externo = new BroadcastChannel(canal);
    externo.postMessage({ tipo: 'cambio-archivo', proyectoId: 'p', ruta: 'x', origen: 'pestana-a' });
    externo.postMessage({ tipo: 'otra-cosa', origen: 'z' });
    externo.postMessage('texto');
    externo.postMessage(null);
    await esperar();
    expect(recibidos).toEqual([]);
    externo.close();
    a.cerrar();
  });

  it('conectarAvisos publica lo que escribe el almacén', async () => {
    const canal = `prueba-${Math.random()}`;
    const emisora = crearAvisos({ nombreCanal: canal, origen: 'a' });
    const receptora = crearAvisos({ nombreCanal: canal, origen: 'b' });
    const recibidos: Aviso[] = [];
    receptora.escuchar((x) => recibidos.push(x));
    const almacen = crearAlmacenMemoria();
    const desconectar = conectarAvisos(almacen, emisora);
    const p = await almacen.crearProyecto({ nombre: 'Proyecto de ejemplo' });
    await almacen.escribir(p.id, 'main.tex', 'x');
    await esperar();
    expect(recibidos.map((r) => r.tipo)).toEqual(['cambio-proyecto', 'cambio-archivo']);
    desconectar();
    await almacen.escribir(p.id, 'main.tex', 'y');
    await esperar();
    expect(recibidos.length).toBe(2);
    emisora.cerrar();
    receptora.cerrar();
  });
});
