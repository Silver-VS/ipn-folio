// SPDX-License-Identifier: AGPL-3.0-or-later
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { crearAlmacenIdb } from './almacen-idb';
import { crearAlmacenMemoria } from './almacen-memoria';
import { probarAlmacen } from './bateria-pruebas';
import { crearAlmacen } from './index';

let contador = 0;

probarAlmacen('memoria', async (opciones) => crearAlmacenMemoria(opciones));
probarAlmacen('IndexedDB (fake-indexeddb)', (opciones) =>
  crearAlmacenIdb({ ...opciones, nombreBD: `prueba-${++contador}` }),
);

describe('almacén IndexedDB: persistencia entre aperturas', () => {
  it('los datos siguen ahí al reabrir la base', async () => {
    const nombreBD = `reabrir-${++contador}`;
    const a = await crearAlmacenIdb({ nombreBD });
    const p = await a.crearProyecto({ nombre: 'Proyecto de ejemplo' }, [
      { ruta: 'main.tex', contenido: 'hola' },
    ]);
    await a.guardarAjuste('tema', 'claro');
    a.cerrar();
    const b = await crearAlmacenIdb({ nombreBD });
    expect((await b.listarProyectos()).map((x) => x.id)).toEqual([p.id]);
    expect((await b.leer(p.id, 'main.tex'))!.contenido).toBe('hola');
    expect(await b.leerAjuste('tema')).toBe('claro');
    b.cerrar();
  });
});

describe('crearAlmacen', () => {
  it('elige IndexedDB cuando está disponible', async () => {
    const { almacen, persistente } = await crearAlmacen({ nombreBD: `elegir-${++contador}` });
    expect(persistente).toBe(true);
    almacen.cerrar();
  });

  it('cae a memoria, e indica que no es persistente, si IndexedDB falla', async () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error simula un navegador sin IndexedDB (p. ej. algunos modos privados)
    delete globalThis.indexedDB;
    try {
      const { almacen, persistente } = await crearAlmacen();
      expect(persistente).toBe(false);
      const p = await almacen.crearProyecto({ nombre: 'Proyecto de ejemplo' });
      expect((await almacen.listarProyectos()).length).toBe(1);
      expect(p.id).toBeTruthy();
    } finally {
      globalThis.indexedDB = original;
    }
  });
});
