// SPDX-License-Identifier: AGPL-3.0-or-later
// Batería común: la misma lista de pruebas se ejecuta contra cada implementación de `Almacen`.
import { describe, expect, it } from 'vitest';
import { ErrorAlmacen } from './errores';
import type { Almacen, FabricaAlmacen } from './tipos';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 255]);

async function rechazaCon(promesa: Promise<unknown>, codigo: string): Promise<void> {
  const error = await promesa.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error, `debía fallar con ${codigo}`).toBeInstanceOf(ErrorAlmacen);
  expect((error as ErrorAlmacen).codigo).toBe(codigo);
}

export function probarAlmacen(nombre: string, fabrica: FabricaAlmacen): void {
  describe(`almacén (${nombre})`, () => {
    let reloj = 1_000;
    const ahora = () => ++reloj;

    async function nuevo(opciones = {}): Promise<Almacen> {
      return fabrica({ ahora, ...opciones });
    }

    async function conArbol(almacen: Almacen) {
      return almacen.crearProyecto({ nombre: 'Proyecto de ejemplo' }, [
        { ruta: 'main.tex', contenido: '\\documentclass{article}\n' },
        { ruta: 'capitulos/uno.tex', contenido: 'Uno' },
        { ruta: 'capitulos/dos.tex', contenido: 'Dos' },
        { ruta: 'capitulos/tres.tex', contenido: 'Tres' },
        { ruta: 'img/logo.png', contenido: PNG },
      ]);
    }

    it('crea un proyecto con archivos iniciales y los lista ordenados', async () => {
      const a = await nuevo();
      const p = await conArbol(a);
      expect(p).toMatchObject({ nombre: 'Proyecto de ejemplo', principal: 'main.tex', motor: 'pdflatex' });
      expect(p.enPapelera).toBeUndefined();
      const lista = await a.listarArchivos(p.id);
      expect(lista.map((f) => f.ruta)).toEqual([
        'capitulos/dos.tex',
        'capitulos/tres.tex',
        'capitulos/uno.tex',
        'img/logo.png',
        'main.tex',
      ]);
      expect(lista.find((f) => f.ruta === 'img/logo.png')).toMatchObject({
        tipo: 'binario',
        tamano: PNG.length,
      });
      expect(lista[0]).not.toHaveProperty('contenido');
      expect(await a.obtenerProyecto(p.id)).toEqual(p);
      a.cerrar();
    });

    it('lee texto y bytes tal como se guardaron', async () => {
      const a = await nuevo();
      const p = await conArbol(a);
      const png = await a.leer(p.id, 'img/logo.png');
      expect(png?.tipo).toBe('binario');
      expect([...(png!.contenido as Uint8Array)]).toEqual([...PNG]);
      const tex = await a.leer(p.id, 'main.tex');
      expect(tex).toMatchObject({ tipo: 'texto', contenido: '\\documentclass{article}\n' });
      expect(await a.leer(p.id, 'no-existe.tex')).toBeUndefined();
      a.cerrar();
    });

    it('normaliza rutas al escribir y conserva mayúsculas y acentos', async () => {
      const a = await nuevo();
      const p = await a.crearProyecto({ nombre: 'Proyecto de ejemplo' });
      await a.escribir(p.id, '.\\capitulos\\Marco Teórico.tex', 'Hola');
      expect((await a.listarArchivos(p.id)).map((f) => f.ruta)).toEqual(['capitulos/Marco Teórico.tex']);
      expect(await a.leer(p.id, 'capitulos/marco teórico.tex')).toBeUndefined();
      await rechazaCon(a.escribir(p.id, '../x.tex', 'x'), 'ruta_invalida');
      await rechazaCon(a.escribir(p.id, '/x.tex', 'x'), 'ruta_invalida');
      await rechazaCon(
        a.crearProyecto({ nombre: 'Otro' }, [{ ruta: 'C:\\x.tex', contenido: 'x' }]),
        'ruta_invalida',
      );
      a.cerrar();
    });

    it('ajusta el contenido al tipo de la extensión', async () => {
      const a = await nuevo();
      const p = await a.crearProyecto({ nombre: 'Proyecto de ejemplo' });
      await a.escribir(p.id, 'a.tex', new TextEncoder().encode('año'));
      await a.escribir(p.id, 'b.png', 'abc');
      expect(await a.leer(p.id, 'a.tex')).toMatchObject({ tipo: 'texto', contenido: 'año', tamano: 4 });
      const b = await a.leer(p.id, 'b.png');
      expect(b?.tipo).toBe('binario');
      expect([...(b!.contenido as Uint8Array)]).toEqual([97, 98, 99]);
      a.cerrar();
    });

    it('escribir actualiza modificado del proyecto y del archivo', async () => {
      const a = await nuevo();
      const p = await a.crearProyecto({ nombre: 'Proyecto de ejemplo' });
      await a.escribir(p.id, 'main.tex', 'v1');
      const despues = await a.obtenerProyecto(p.id);
      const archivo = await a.leer(p.id, 'main.tex');
      expect(despues!.modificado).toBeGreaterThan(p.modificado);
      expect(archivo!.modificado).toBe(despues!.modificado);
      await a.escribir(p.id, 'main.tex', 'v2');
      expect((await a.leer(p.id, 'main.tex'))!.contenido).toBe('v2');
      expect((await a.listarArchivos(p.id)).length).toBe(1);
      a.cerrar();
    });

    it('no permite un archivo con el nombre de una carpeta ni dentro de un archivo', async () => {
      const a = await nuevo();
      const p = await conArbol(a);
      await rechazaCon(a.escribir(p.id, 'capitulos', 'x'), 'destino_ocupado');
      await rechazaCon(a.escribir(p.id, 'main.tex/otro.tex', 'x'), 'destino_ocupado');
      await rechazaCon(
        a.crearProyecto({ nombre: 'Otro' }, [
          { ruta: 'a', contenido: 'x' },
          { ruta: 'a/b.tex', contenido: 'x' },
        ]),
        'destino_ocupado',
      );
      a.cerrar();
    });

    it('renombra un archivo', async () => {
      const a = await nuevo();
      const p = await conArbol(a);
      await a.renombrar(p.id, 'capitulos/uno.tex', 'capitulos/primero.tex');
      expect(await a.leer(p.id, 'capitulos/uno.tex')).toBeUndefined();
      expect((await a.leer(p.id, 'capitulos/primero.tex'))!.contenido).toBe('Uno');
      await rechazaCon(a.renombrar(p.id, 'capitulos/dos.tex', 'capitulos/tres.tex'), 'destino_ocupado');
      await rechazaCon(a.renombrar(p.id, 'nada.tex', 'x.tex'), 'archivo_inexistente');
      a.cerrar();
    });

    it('renombra una carpeta completa y actualiza el archivo principal', async () => {
      const a = await nuevo();
      const p = await a.crearProyecto({ nombre: 'Proyecto de ejemplo', principal: 'src/main.tex' }, [
        { ruta: 'src/main.tex', contenido: 'm' },
        { ruta: 'src/b.tex', contenido: 'b' },
        { ruta: 'otro.tex', contenido: 'o' },
      ]);
      await a.renombrar(p.id, 'src', 'fuente/v2');
      expect((await a.listarArchivos(p.id)).map((f) => f.ruta)).toEqual([
        'fuente/v2/b.tex',
        'fuente/v2/main.tex',
        'otro.tex',
      ]);
      expect((await a.obtenerProyecto(p.id))!.principal).toBe('fuente/v2/main.tex');
      await rechazaCon(a.renombrar(p.id, 'fuente', 'fuente/v2/dentro'), 'movimiento_invalido');
      a.cerrar();
    });

    it('renombrar una carpeta con 3 archivos es atómico: un fallo a la mitad no mueve nada', async () => {
      const a = await nuevo({
        inyectarFallo: (_op: string, indice: number) => {
          if (indice === 1) throw new Error('fallo inyectado');
        },
      });
      const p = await conArbol(a);
      const antes = await a.listarArchivos(p.id);
      const proyectoAntes = await a.obtenerProyecto(p.id);
      await expect(a.renombrar(p.id, 'capitulos', 'partes')).rejects.toThrow('fallo inyectado');
      expect(await a.listarArchivos(p.id)).toEqual(antes);
      expect((await a.leer(p.id, 'capitulos/dos.tex'))!.contenido).toBe('Dos');
      expect(await a.leer(p.id, 'partes/dos.tex')).toBeUndefined();
      expect(await a.obtenerProyecto(p.id)).toEqual(proyectoAntes);
      a.cerrar();
    });

    it('borra un archivo y una carpeta', async () => {
      const a = await nuevo();
      const p = await conArbol(a);
      await a.borrar(p.id, 'main.tex');
      await a.borrar(p.id, 'capitulos');
      expect((await a.listarArchivos(p.id)).map((f) => f.ruta)).toEqual(['img/logo.png']);
      await rechazaCon(a.borrar(p.id, 'capitulos'), 'archivo_inexistente');
      a.cerrar();
    });

    it('renombra el proyecto y valida el nombre', async () => {
      const a = await nuevo();
      const p = await a.crearProyecto({ nombre: '  Proyecto de ejemplo  ' });
      expect(p.nombre).toBe('Proyecto de ejemplo');
      await a.renombrarProyecto(p.id, 'Informe de ejemplo');
      expect((await a.obtenerProyecto(p.id))!.nombre).toBe('Informe de ejemplo');
      await rechazaCon(a.renombrarProyecto(p.id, '   '), 'nombre_invalido');
      await rechazaCon(a.crearProyecto({ nombre: '' }), 'nombre_invalido');
      await rechazaCon(a.renombrarProyecto('no-existe', 'x'), 'proyecto_inexistente');
      a.cerrar();
    });

    it('papelera: oculta de la lista, restaura y bloquea la edición', async () => {
      const a = await nuevo();
      const p1 = await a.crearProyecto({ nombre: 'Proyecto de ejemplo' });
      const p2 = await a.crearProyecto({ nombre: 'Segundo proyecto de ejemplo' });
      expect((await a.listarProyectos()).map((p) => p.id)).toEqual([p2.id, p1.id]);
      await a.moverAPapelera(p1.id);
      expect((await a.listarProyectos()).map((p) => p.id)).toEqual([p2.id]);
      expect((await a.listarProyectos('papelera')).map((p) => p.id)).toEqual([p1.id]);
      expect((await a.listarProyectos('todos')).length).toBe(2);
      expect((await a.obtenerProyecto(p1.id))!.enPapelera).toBeTypeOf('number');
      await rechazaCon(a.escribir(p1.id, 'main.tex', 'x'), 'proyecto_en_papelera');
      await a.restaurar(p1.id);
      expect((await a.obtenerProyecto(p1.id))!.enPapelera).toBeUndefined();
      await a.escribir(p1.id, 'main.tex', 'x');
      a.cerrar();
    });

    it('guarda ajustes, distribuciones y estado de herramientas', async () => {
      const a = await nuevo();
      expect(await a.leerAjuste('tema')).toBeUndefined();
      await a.guardarAjuste('tema', 'oscuro');
      await a.guardarAjuste('soloWifi', true);
      expect(await a.leerAjuste('tema')).toBe('oscuro');
      expect(await a.leerAjuste('soloWifi')).toBe(true);
      const distribucion = { grid: { orientacion: 'HORIZONTAL', paneles: [1, 2] } };
      await a.guardarDistribucion('global', distribucion);
      expect(await a.leerDistribucion('global')).toEqual(distribucion);
      await a.guardarHerramienta('busytex', { estado: 'instalada', version: '1' });
      expect(await a.leerHerramienta('busytex')).toEqual({ estado: 'instalada', version: '1' });
      a.cerrar();
    });

    it('emite eventos de cambio y permite cancelar la suscripción', async () => {
      const a = await nuevo();
      const archivos: string[] = [];
      const proyectos: string[] = [];
      const quitar = a.al('cambio-archivo', (e) => archivos.push(e.ruta));
      a.al('cambio-proyecto', (e) => proyectos.push(e.proyectoId));
      const p = await a.crearProyecto({ nombre: 'Proyecto de ejemplo' });
      await a.escribir(p.id, 'main.tex', 'x');
      quitar();
      await a.escribir(p.id, 'otro.tex', 'y');
      expect(archivos).toEqual(['main.tex']);
      expect(proyectos).toEqual([p.id]);
      a.cerrar();
    });

    it('un fallo de validación no deja datos a medias', async () => {
      const a = await nuevo();
      await rechazaCon(
        a.crearProyecto({ nombre: 'Proyecto de ejemplo' }, [
          { ruta: 'bien.tex', contenido: 'x' },
          { ruta: '../mal.tex', contenido: 'x' },
        ]),
        'ruta_invalida',
      );
      expect(await a.listarProyectos('todos')).toEqual([]);
      a.cerrar();
    });
  });
}
