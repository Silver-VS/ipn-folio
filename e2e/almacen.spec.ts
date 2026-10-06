// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from '@playwright/test';
import { PUERTO_DESARROLLO } from './config';

// El almacén se prueba con IndexedDB real de cada navegador, en una página de prueba servida por vite (puerto PUERTO_DESARROLLO de e2e/config.ts).
const PAGINA = `http://localhost:${PUERTO_DESARROLLO}/e2e/almacen.html`;

test.describe('almacén local', () => {
  test('un proyecto y su archivo siguen ahí después de recargar la página', async ({ page }) => {
    await page.goto(PAGINA);
    const id = await page.evaluate(async () => {
      const { almacen, persistente } = await window.prueba;
      if (!persistente) throw new Error('IndexedDB no disponible');
      const p = await almacen.crearProyecto({ nombre: 'Proyecto de ejemplo' }, [
        { ruta: 'main.tex', contenido: '\\documentclass{article}\nHola, Alumna Ficticia.\n' },
        { ruta: 'img/punto.png', contenido: new Uint8Array([137, 80, 78, 71, 0, 255]) },
      ]);
      await almacen.guardarAjuste('tema', 'oscuro');
      return p.id;
    });

    await page.reload();

    const leido = await page.evaluate(async (idProyecto) => {
      const { almacen, persistente } = await window.prueba;
      const proyectos = await almacen.listarProyectos();
      const tex = await almacen.leer(idProyecto, 'main.tex');
      const png = await almacen.leer(idProyecto, 'img/punto.png');
      return {
        persistente,
        nombres: proyectos.map((p) => p.nombre),
        tex: tex?.contenido,
        png: png ? Array.from(png.contenido as Uint8Array) : undefined,
        tema: await almacen.leerAjuste('tema'),
      };
    }, id);

    expect(leido.persistente).toBe(true);
    expect(leido.nombres).toEqual(['Proyecto de ejemplo']);
    expect(leido.tex).toBe('\\documentclass{article}\nHola, Alumna Ficticia.\n');
    expect(leido.png).toEqual([137, 80, 78, 71, 0, 255]);
    expect(leido.tema).toBe('oscuro');
  });

  test('renombrar una carpeta y exportar e importar .zip funcionan en el navegador', async ({ page }) => {
    await page.goto(PAGINA);
    const resultado = await page.evaluate(async () => {
      const { almacen, exportarZip, importarZip } = await window.prueba;
      const p = await almacen.crearProyecto({ nombre: 'Proyecto de ejemplo' }, [
        { ruta: 'main.tex', contenido: '\\documentclass{article}\n' },
        { ruta: 'caps/a.tex', contenido: 'A' },
        { ruta: 'caps/b.tex', contenido: 'B' },
      ]);
      await almacen.renombrar(p.id, 'caps', 'capitulos');
      const zip = await exportarZip(almacen, p.id);
      const { proyecto } = await importarZip(almacen, zip, 'copia.zip');
      return (await almacen.listarArchivos(proyecto.id)).map((f) => f.ruta);
    });
    expect(resultado).toEqual(['capitulos/a.tex', 'capitulos/b.tex', 'main.tex']);
  });

  test('dos pestañas del mismo sitio se avisan de los cambios', async ({ context }) => {
    const a = await context.newPage();
    const b = await context.newPage();
    await a.goto(PAGINA);
    await b.goto(PAGINA);
    await b.evaluate(async () => {
      const { crearAvisos } = await window.prueba;
      const avisos = crearAvisos();
      (window as unknown as { recibidos: unknown[] }).recibidos = [];
      avisos.escuchar((x) => (window as unknown as { recibidos: unknown[] }).recibidos.push(x));
    });
    await a.evaluate(async () => {
      const { almacen, crearAvisos, conectarAvisos } = await window.prueba;
      conectarAvisos(almacen, crearAvisos());
      const p = await almacen.crearProyecto({ nombre: 'Proyecto de ejemplo' });
      await almacen.escribir(p.id, 'main.tex', 'x');
    });
    await expect
      .poll(() =>
        b.evaluate(() =>
          (window as unknown as { recibidos: { tipo: string }[] }).recibidos.map((r) => r.tipo),
        ),
      )
      .toEqual(['cambio-proyecto', 'cambio-archivo']);
  });
});
