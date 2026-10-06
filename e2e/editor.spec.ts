// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from '@playwright/test';
import {
  abrirProyectoDeEjemplo,
  editorActivo,
  elegirEnMenu,
  esperarEditor,
  esperarGuardado,
  marcaDeGuardado,
  textoDelEditor,
} from './ayudas';

test.describe('editor y archivos', () => {
  // El teléfono usa el modo compacto (un panel a la vez): se prueba en compacto.spec.ts.
  test.skip(({ isMobile }) => isMobile, 'modo compacto: ver compacto.spec.ts');

  test('lo que escribes se guarda solo y sigue ahí tras recargar', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    await editorActivo(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n% Prueba de autoguardado con acentos: ');
    // Los caracteres que no están en el teclado de EE. UU. llegan como entrada de texto (como en un teléfono).
    await page.keyboard.insertText('ñ á é ¿ ¡');
    // El indicador pasa por «Guardando…» y termina en «Guardado en este equipo».
    await esperarGuardado(page);
    await page.reload();
    await esperarEditor(page);
    expect(await textoDelEditor(page)).toContain('Prueba de autoguardado con acentos: ñ á é ¿ ¡');
  });

  test('Ctrl+S guarda de inmediato y no abre «Guardar página»', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    const marca = await marcaDeGuardado(page);
    await editorActivo(page).click();
    await page.keyboard.type('xyz');
    await page.keyboard.press('Control+s');
    await esperarGuardado(page, marca);
    await page.reload();
    await esperarEditor(page);
    expect(await textoDelEditor(page)).toContain('xyz');
  });

  test('crear, renombrar y borrar un archivo desde el árbol (con deshacer)', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    // Crear
    await page.getByRole('button', { name: 'Nuevo archivo' }).click();
    await page.getByLabel('Nombre del archivo nuevo').fill('notas/apuntes.tex');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tab', { name: 'apuntes.tex' })).toBeVisible();
    await page.getByRole('treeitem', { name: /notas/ }).first().waitFor();

    // Renombrar (la fila se elige con un clic; el botón actúa sobre la fila elegida)
    await page.getByRole('treeitem', { name: /apuntes\.tex/ }).click();
    await page.getByRole('button', { name: 'Renombrar', exact: true }).click();
    await page.getByRole('textbox', { name: /Nuevo nombre para apuntes\.tex/ }).fill('ideas.tex');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tab', { name: 'ideas.tex' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'apuntes.tex' })).toHaveCount(0);

    // Borrar y deshacer
    await page.getByRole('treeitem', { name: /ideas\.tex/ }).click();
    await page.getByRole('button', { name: 'Borrar', exact: true }).click();
    await expect(page.getByRole('treeitem', { name: /ideas\.tex/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.getByRole('treeitem', { name: /ideas\.tex/ })).toBeVisible();
  });

  test('renombrar con un cambio pendiente no resucita la ruta vieja (contrato del autoguardado)', async ({ page }) => {
    // El reloj de la página se controla: el autoguardado (400 ms) no se dispara solo y el renombrado ocurre con el cambio
    // todavía pendiente. Si el renombrado fuera directo al almacén, el guardado tardío recrearía «referencias.bib».
    await page.clock.install();
    await abrirProyectoDeEjemplo(page);
    await page.getByRole('treeitem', { name: /referencias\.bib/ }).click();
    await page.clock.runFor(50);
    await editorActivo(page).click();
    await page.keyboard.type('@book{pendiente}');

    await page.getByRole('treeitem', { name: /referencias\.bib/ }).click();
    await page.getByRole('button', { name: 'Renombrar', exact: true }).click();
    await page.getByRole('textbox', { name: /Nuevo nombre para referencias\.bib/ }).fill('bibliografia.bib');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('treeitem', { name: /bibliografia\.bib/ })).toBeVisible();

    // Pasa el tiempo: el guardado que estaba pendiente se ejecuta ahora.
    await page.clock.resume();
    await esperarGuardado(page, 0);
    await page.reload();
    await expect(page.getByRole('treeitem', { name: /bibliografia\.bib/ })).toBeVisible();
    await expect(page.getByRole('treeitem', { name: /referencias\.bib/ })).toHaveCount(0);
    await page.getByRole('treeitem', { name: /bibliografia\.bib/ }).click();
    expect(await textoDelEditor(page)).toContain('@book{pendiente}');
  });

  test('arrastrar una imagen a Archivos la agrega al proyecto', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    // PNG válido de 1×1 píxel.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
      'base64',
    );
    const transferencia = await page.evaluateHandle(
      (bytes) => {
        const t = new DataTransfer();
        t.items.add(new File([new Uint8Array(bytes)], 'figura.png', { type: 'image/png' }));
        return t;
      },
      [...png],
    );
    const zona = page.getByRole('region', { name: 'Archivos del proyecto' });
    await zona.dispatchEvent('dragover', { dataTransfer: transferencia });
    await zona.dispatchEvent('drop', { dataTransfer: transferencia });
    await expect(page.getByRole('treeitem', { name: /figura\.png/ })).toBeVisible();
    await page.getByRole('treeitem', { name: /figura\.png/ }).click();
    await expect(page.getByRole('img', { name: /Vista previa de figura\.png/ })).toBeVisible();
  });

  test('un cambio hecho en otra pestaña se recarga si aquí no hay cambios, y avisa si los hay', async ({
    page,
    context,
  }) => {
    const hash = await abrirProyectoDeEjemplo(page);
    await page.getByRole('treeitem', { name: /referencias\.bib/ }).click();
    await expect(page.getByRole('tab', { name: 'referencias.bib' })).toHaveAttribute('aria-selected', 'true');
    await esperarEditor(page);

    const otra = await context.newPage();
    await otra.goto(`/${hash}`);
    await esperarEditor(otra);
    await otra.getByRole('treeitem', { name: /referencias.bib/ }).click();
    await esperarEditor(otra);
    const marcaOtra = await marcaDeGuardado(otra);
    await editorActivo(otra).click();
    await otra.keyboard.press('Control+End');
    await otra.keyboard.type('\n% desde la otra pestana');
    await esperarGuardado(otra, marcaOtra);

    // Aquí no había cambios locales: se recarga sola.
    await expect.poll(() => textoDelEditor(page)).toContain('desde la otra pestana');

    // Ahora aquí hay cambios sin guardar (el reloj está detenido, así que el guardado sigue pendiente) y la otra
    // pestaña vuelve a escribir.
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 5000));
    await editorActivo(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n% mio');
    const marcaOtra2 = await marcaDeGuardado(otra);
    await otra.bringToFront();
    await editorActivo(otra).click();
    await otra.keyboard.press('Control+End');
    await otra.keyboard.type('\n% otra vez');
    // El reloj está detenido en todo el navegador: Ctrl+S guarda de inmediato, sin esperar al temporizador.
    await otra.keyboard.press('Control+s');
    await esperarGuardado(otra, marcaOtra2);
    await expect(page.getByText(/Otra pestaña cambió referencias.bib/)).toBeVisible();
    expect(await textoDelEditor(page)).toContain('% mio');
    await page.getByRole('button', { name: 'Cargar la versión de la otra pestaña' }).click();
    await expect.poll(() => textoDelEditor(page)).toContain('otra vez');
    await expect.poll(() => textoDelEditor(page)).not.toContain('% mio');
  });

  test('el menú Proyecto manda el proyecto a la papelera y se puede restaurar', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    await page.getByRole('button', { name: 'Proyecto', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Mover el proyecto a la papelera' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('heading', { name: 'Papelera' })).toBeVisible();
    await page.getByRole('button', { name: 'Restaurar' }).click();
    await expect(page.getByRole('link', { name: 'Proyecto de ejemplo' })).toBeVisible();
  });

  test('el texto del editor y los menús están en español y el tema oscuro se aplica', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    await elegirEnMenu(page, 'Tema', 'Tema oscuro');
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');
    // Ctrl+F abre el panel de búsqueda de CodeMirror traducido.
    await editorActivo(page).click();
    await page.keyboard.press('Control+f');
    await expect(page.getByRole('button', { name: 'siguiente' })).toBeVisible();
  });
});
