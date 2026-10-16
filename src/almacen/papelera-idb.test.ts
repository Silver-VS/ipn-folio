// SPDX-License-Identifier: AGPL-3.0-or-later
// Pruebas propias de IndexedDB: migración de la base, ciclo de vida de la conexión (M4) y lo que queda en los
// almacenes de la papelera. La batería común (bateria-pruebas.ts) cubre el comportamiento visible del almacén.
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { crearAlmacenIdb, VERSION_BD } from './almacen-idb';
import { crearAutoguardado } from './autoguardado';
import { ErrorAlmacen } from './errores';
import { crearAlmacen } from './index';
import type { EventoApertura } from './tipos';

let contador = 0;
const nombre = (base: string) => `${base}-${++contador}`;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255]);

/** El `upgrade` de la versión 1 tal como era antes de la papelera (copiado a propósito: es el pasado, no cambia). */
async function crearBaseV1(nombreBD: string) {
  return openDB(nombreBD, 1, {
    upgrade(base) {
      base.createObjectStore('proyectos', { keyPath: 'id' });
      const archivos = base.createObjectStore('archivos', { keyPath: ['proyectoId', 'ruta'] });
      archivos.createIndex('porProyecto', 'proyectoId');
      base.createObjectStore('ajustes');
      base.createObjectStore('distribuciones');
      base.createObjectStore('herramientas');
    },
  });
}

describe('migración de la base 1 → 2 (papelera)', () => {
  it('conserva proyectos, archivos, ajustes y distribuciones, y crea los almacenes nuevos vacíos', async () => {
    const nombreBD = nombre('migracion');
    const v1 = await crearBaseV1(nombreBD);
    const activo = {
      id: 'p1',
      nombre: 'Activo',
      creado: 1,
      modificado: 5,
      principal: 'main.tex',
      motor: 'pdflatex',
    };
    const enPapelera = {
      id: 'p2',
      nombre: 'En papelera',
      creado: 2,
      modificado: 6,
      principal: 'main.tex',
      motor: 'pdflatex',
      enPapelera: 99,
    };
    const archivos = [
      { proyectoId: 'p1', ruta: 'main.tex', tipo: 'texto', contenido: 'Hola', modificado: 5, tamano: 4 },
      {
        proyectoId: 'p1',
        ruta: 'img/a.png',
        tipo: 'binario',
        contenido: PNG,
        modificado: 5,
        tamano: PNG.length,
      },
      { proyectoId: 'p2', ruta: 'main.tex', tipo: 'texto', contenido: 'Viejo', modificado: 6, tamano: 5 },
    ];
    await v1.put('proyectos', activo);
    await v1.put('proyectos', enPapelera);
    for (const a of archivos) await v1.put('archivos', a);
    await v1.put('ajustes', 'oscuro', 'tema');
    await v1.put('ajustes', { abiertos: ['main.tex'] }, 'folio.pestanas.p1');
    await v1.put('distribuciones', { grid: [1, 2] }, 'p1');
    await v1.put('herramientas', { estado: 'instalada' }, 'busytex');
    v1.close();

    const a = await crearAlmacenIdb({ nombreBD });
    expect((await a.listarProyectos('todos')).map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    expect(await a.obtenerProyecto('p2')).toEqual(enPapelera);
    expect(await a.obtenerProyecto('p1')).toEqual(activo);
    expect((await a.leer('p1', 'main.tex'))!.contenido).toBe('Hola');
    expect([...((await a.leer('p1', 'img/a.png'))!.contenido as Uint8Array)]).toEqual([...PNG]);
    expect((await a.leer('p2', 'main.tex'))!.contenido).toBe('Viejo');
    expect(await a.leerAjuste('tema')).toBe('oscuro');
    expect(await a.leerAjuste('folio.pestanas.p1')).toEqual({ abiertos: ['main.tex'] });
    expect(await a.leerDistribucion('p1')).toEqual({ grid: [1, 2] });
    expect(await a.leerHerramienta('busytex')).toEqual({ estado: 'instalada' });
    // El proyecto que ya estaba en la papelera aparece en la lista nueva (aunque sin fecha confiable).
    const lista = await a.listarPapelera();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({
      id: 'proyecto:p2',
      clase: 'proyecto',
      fecha: 99,
      fechaConfiable: false,
      cuantos: 1,
      tamano: 5,
    });
    a.cerrar();

    const crudo = await openDB(nombreBD);
    expect(crudo.version).toBe(VERSION_BD);
    expect([...crudo.objectStoreNames].sort()).toEqual(
      [
        'ajustes',
        'archivos',
        'distribuciones',
        'herramientas',
        'papelera',
        'papeleraArchivos',
        'proyectos',
      ].sort(),
    );
    expect(await crudo.count('papelera')).toBe(0);
    expect(await crudo.count('papeleraArchivos')).toBe(0);
    crudo.close();
  });

  it('una base nueva se crea ya en la versión actual', async () => {
    const nombreBD = nombre('nueva');
    const a = await crearAlmacenIdb({ nombreBD });
    a.cerrar();
    const crudo = await openDB(nombreBD);
    expect(crudo.version).toBe(VERSION_BD);
    expect(crudo.objectStoreNames.contains('papelera')).toBe(true);
    crudo.close();
  });
});

describe('lo que queda en los almacenes de la papelera', () => {
  it('borrar definitivamente y purgar no dejan archivos huérfanos', async () => {
    const nombreBD = nombre('huerfanos');
    let hora = 1_800_000_000_000;
    const a = await crearAlmacenIdb({ nombreBD, horaConfiable: () => hora });
    const p = await a.crearProyecto({ nombre: 'Ejemplo' }, [
      { ruta: 'a.tex', contenido: 'A' },
      { ruta: 'img/b.png', contenido: PNG },
    ]);
    const e1 = await a.moverArchivosAPapelera(p.id, 'img');
    await a.moverArchivosAPapelera(p.id, 'a.tex');
    const crudo = await openDB(nombreBD);
    expect(await crudo.count('papelera')).toBe(2);
    expect(await crudo.count('papeleraArchivos')).toBe(2);
    await a.borrarDefinitivo(e1.id);
    expect(await crudo.count('papeleraArchivos')).toBe(1);
    await a.moverAPapelera(p.id);
    hora += 40 * 86_400_000;
    await a.purgarCaducados(30);
    expect(await crudo.count('papelera')).toBe(0);
    expect(await crudo.count('papeleraArchivos')).toBe(0);
    expect(await crudo.count('archivos')).toBe(0);
    expect(await crudo.count('proyectos')).toBe(0);
    crudo.close();
    a.cerrar();
  });

  it('la papelera cuenta bytes y cuántos archivos tiene', async () => {
    const a = await crearAlmacenIdb({ nombreBD: nombre('tamano') });
    const p = await a.crearProyecto({ nombre: 'Ejemplo' }, [
      { ruta: 'carpeta/a.tex', contenido: 'abc' },
      { ruta: 'carpeta/b.png', contenido: PNG },
    ]);
    const e = await a.moverArchivosAPapelera(p.id, 'carpeta');
    expect(e).toMatchObject({ clase: 'carpeta', cuantos: 2, tamano: 3 + PNG.length });
    await a.moverAPapelera(p.id);
    expect((await a.listarPapelera())[0]).toMatchObject({
      clase: 'proyecto',
      cuantos: 2,
      tamano: 3 + PNG.length,
    });
    a.cerrar();
  });
});

describe('ciclo de vida de la conexión (M4)', () => {
  it('blocking: otra pestaña pide la versión siguiente → version-nueva; se guarda lo pendiente y se suelta la base', async () => {
    const nombreBD = nombre('blocking');
    const a = await crearAlmacenIdb({ nombreBD });
    const p = await a.crearProyecto({ nombre: 'Ejemplo' });
    const auto = crearAutoguardado(a);
    let avisos = 0;
    a.al('version-nueva', () => {
      avisos++;
      // Lo que hacen los servicios: guardar lo pendiente y soltar la base.
      void auto.guardarTodo().then(() => a.cerrar());
    });
    auto.programar(p.id, 'main.tex', 'pendiente al actualizar');

    const nueva = await openDB(nombreBD, VERSION_BD + 1);
    expect(avisos).toBe(1);
    expect((await nueva.get('archivos', [p.id, 'main.tex']))?.contenido).toBe('pendiente al actualizar');
    nueva.close();
    auto.cerrar();
  });

  it('blocking: si nadie suelta la base, se suelta sola a los pocos segundos y las operaciones avisan', async () => {
    const nombreBD = nombre('blocking-solo');
    const a = await crearAlmacenIdb({ nombreBD });
    const p = await a.crearProyecto({ nombre: 'Ejemplo' });
    const nueva = await openDB(nombreBD, VERSION_BD + 1);
    nueva.close();
    const error = await a.listarArchivos(p.id).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ErrorAlmacen);
    expect((error as ErrorAlmacen).codigo).toBe('version_nueva');
    await expect(a.escribir(p.id, 'x.tex', 'x')).rejects.toMatchObject({ codigo: 'version_nueva' });
    a.cerrar();
  }, 10_000);

  it('blocked: esta pestaña quiere actualizar y otra no suelta la base → aviso; al soltarla, se quita', async () => {
    const nombreBD = nombre('blocked');
    const vieja = await crearBaseV1(nombreBD);
    const eventos: EventoApertura['tipo'][] = [];
    const abriendo = crearAlmacenIdb({ nombreBD, alAbrir: (e) => eventos.push(e.tipo) });
    await new Promise((r) => setTimeout(r, 50));
    expect(eventos).toEqual(['almacen-bloqueado']);
    vieja.close();
    const a = await abriendo;
    expect(eventos).toEqual(['almacen-bloqueado', 'almacen-liberado']);
    a.cerrar();
  });

  it('sin bloqueo no se emite ningún aviso de apertura', async () => {
    const eventos: string[] = [];
    const a = await crearAlmacenIdb({ nombreBD: nombre('limpio'), alAbrir: (e) => eventos.push(e.tipo) });
    expect(eventos).toEqual([]);
    a.cerrar();
  });

  it('VersionError: una base más nueva que este código NO cae a memoria', async () => {
    const nombreBD = nombre('version-error');
    const futura = await openDB(nombreBD, VERSION_BD + 3, {
      upgrade(base) {
        base.createObjectStore('proyectos', { keyPath: 'id' });
      },
    });
    futura.close();
    await expect(crearAlmacenIdb({ nombreBD })).rejects.toMatchObject({ codigo: 'version_nueva' });
    await expect(crearAlmacen({ nombreBD })).rejects.toMatchObject({ codigo: 'version_nueva' });
  });

  it('con la conexión cerrada, las operaciones dicen por qué (almacen_cerrado)', async () => {
    const a = await crearAlmacenIdb({ nombreBD: nombre('cerrada') });
    a.cerrar();
    await expect(a.listarProyectos()).rejects.toMatchObject({ codigo: 'almacen_cerrado' });
  });
});
