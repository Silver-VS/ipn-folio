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
    await page.keyboard.type('\n% Prueba de autoguardado con acentos: ', { delay: 10 });
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
    // Sin confirmación: va a la papelera y el aviso lo dice una sola vez, con el plazo.
    await expect(page.getByText('Se movió notas/ideas.tex a la papelera. Tienes 30 días para recuperarlo.')).toBeVisible();
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.getByRole('treeitem', { name: /ideas\.tex/ })).toBeVisible();
  });

  test('renombrar con un cambio pendiente no resucita la ruta vieja (contrato del autoguardado)', async ({
    page,
  }) => {
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
    // WebKit en Windows tarda en enviar las pulsaciones entre dos pestañas; además esperamos 3 s reales.
    // El límite es del escenario completo: las aserciones conservan sus propios plazos.
    test.setTimeout(60_000);
    // Solo retenemos la entrega del aviso externo para reproducir el cruce de escrituras sin detener temporizadores.
    await page.addInitScript(() => {
      const retenidos: Array<() => void> = [];
      let retener = false;
      Object.assign(window, {
        retenerAvisos: () => {
          retener = true;
        },
        avisosRetenidos: () => retenidos.length,
        liberarAvisos: () => {
          retener = false;
          retenidos.splice(0).forEach((fn) => fn());
        },
      });
      const agregar = BroadcastChannel.prototype.addEventListener;
      BroadcastChannel.prototype.addEventListener = function (
        tipo: string,
        oyente: EventListenerOrEventListenerObject,
        opciones?: boolean | AddEventListenerOptions,
      ) {
        if (tipo !== 'message' || !oyente) return agregar.call(this, tipo, oyente, opciones);
        agregar.call(
          this,
          tipo,
          (evento) => {
            const ejecutar = () =>
              typeof oyente === 'function' ? oyente.call(this, evento) : oyente.handleEvent(evento);
            if (retener) retenidos.push(ejecutar);
            else ejecutar();
          },
          opciones,
        );
      };
    });
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

    await page.evaluate(() => (window as unknown as { retenerAvisos(): void }).retenerAvisos());
    const marcaOtra2 = await marcaDeGuardado(otra);
    await otra.bringToFront();
    await editorActivo(otra).click();
    await otra.keyboard.press('Control+End');
    await otra.keyboard.type('\n% otra vez');
    await otra.keyboard.press('Control+s');
    await esperarGuardado(otra, marcaOtra2);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { avisosRetenidos(): number }).avisosRetenidos()))
      .toBeGreaterThan(0);
    // Se programa el cambio local y se entrega el aviso en la misma tarea; el reloj del navegador sigue corriendo.
    await editorActivo(page).evaluate((el) => {
      const vista = (
        el as unknown as {
          cmTile: { view: { state: { doc: { length: number } }; dispatch(tr: unknown): void } };
        }
      ).cmTile.view;
      vista.dispatch({ changes: { from: vista.state.doc.length, insert: '\n% mio' } });
      (window as unknown as { liberarAvisos(): void }).liberarAvisos();
    });
    await expect(page.getByText(/Otra pestaña cambió referencias.bib/)).toBeVisible();
    expect(await textoDelEditor(page)).toContain('% mio');
    await page.bringToFront();
    await editorActivo(page).focus();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText(' con más cambios');
    // Debe pasar el máximo del autoguardado con temporizadores reales para detectar una sobrescritura tardía.
    await page.waitForTimeout(3000);
    await otra.reload();
    await esperarEditor(otra);
    expect(await textoDelEditor(otra)).toContain('otra vez');
    expect(await textoDelEditor(otra)).not.toContain('% mio');
    await page.getByRole('button', { name: 'Cargar la versión de la otra pestaña' }).click();
    await expect.poll(() => textoDelEditor(page)).toContain('otra vez');
    await expect.poll(() => textoDelEditor(page)).not.toContain('% mio');
  });

  test('el menú Proyecto manda el proyecto a la papelera y se puede restaurar', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    await page.getByRole('button', { name: 'Proyecto', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Mover el proyecto a la papelera' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(
      page.getByText('Se movió el proyecto Proyecto de ejemplo a la papelera. Tienes 30 días para recuperarlo.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Papelera (1)' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Proyecto de ejemplo' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.getByRole('link', { name: 'Proyecto de ejemplo' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Papelera (0)' })).toBeVisible();
  });

  test('cerrar y reabrir lee la otra pestaña y un archivo recreado no conserva texto viejo', async ({
    page,
    context,
  }) => {
    const hash = await abrirProyectoDeEjemplo(page);
    await page.getByRole('treeitem', { name: /referencias\.bib/ }).click();
    await esperarEditor(page);
    const otra = await context.newPage();
    await otra.goto(`/${hash}`);
    await esperarEditor(otra);
    await page.getByRole('tab', { name: 'referencias.bib' }).press('Delete');
    await expect(page.getByRole('tab', { name: 'referencias.bib' })).toHaveCount(0);
    await otra.getByRole('treeitem', { name: /referencias\.bib/ }).click();
    await expect(otra.getByRole('tab', { name: 'referencias.bib' })).toHaveAttribute('aria-selected', 'true');
    await editorActivo(otra).click();
    await otra.keyboard.press('Control+a');
    await otra.keyboard.insertText('versión desde otra pestaña');
    await expect.poll(() => textoDelEditor(otra)).toBe('versión desde otra pestaña');
    await otra.keyboard.press('Control+s');
    await esperarGuardado(otra);
    await page.getByRole('treeitem', { name: /referencias\.bib/ }).click();
    await expect.poll(() => textoDelEditor(page)).toBe('versión desde otra pestaña');
    await otra.close();
    await page.getByRole('button', { name: 'Borrar', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'referencias.bib' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Nuevo archivo' }).click();
    await page.getByLabel('Nombre del archivo nuevo').fill('referencias.bib');
    await page.keyboard.press('Enter');
    await esperarEditor(page);
    await expect.poll(() => textoDelEditor(page)).toBe('');
  });

  test('renombrar destruye la vista anterior aunque ya no esté en el mapa', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    await page.getByRole('treeitem', { name: /referencias\.bib/ }).click();
    await esperarEditor(page);
    const vieja = await editorActivo(page).evaluateHandle((el) => el.closest('.cm-editor')!);
    await page.getByRole('button', { name: 'Renombrar', exact: true }).click();
    await page.getByRole('textbox', { name: /Nuevo nombre para referencias\.bib/ }).fill('bibliografia.bib');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tab', { name: 'bibliografia.bib' })).toBeVisible();
    // destroy elimina el DOM de CodeMirror de su contenedor, incluso si Svelte retiró el panel.
    await expect.poll(() => vieja.evaluate((el) => el.parentElement === null)).toBe(true);
  });

  test('cambiar entre amplio y compacto conserva texto y cursor y permite seguir escribiendo', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await abrirProyectoDeEjemplo(page);
    await editorActivo(page).click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.insertText('amplio ');
    for (const [width, texto] of [
      [390, 'compacto '],
      [1280, 'amplio otra vez '],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      await esperarEditor(page);
      // focus no mueve el cursor; un clic sobre el texto sí lo haría.
      await editorActivo(page).focus();
      await page.keyboard.insertText(texto);
    }
    await expect.poll(() => textoDelEditor(page)).toMatch(/^amplio compacto amplio otra vez /);
    await page.keyboard.press('Control+s');
    await esperarGuardado(page);
    await page.reload();
    await esperarEditor(page);
    await expect.poll(() => textoDelEditor(page)).toMatch(/^amplio compacto amplio otra vez /);
  });

  test('Supr sobre una carpeta la manda a la papelera sin confirmar y Deshacer la devuelve completa', async ({
    page,
  }) => {
    await abrirProyectoDeEjemplo(page);
    await page.getByRole('button', { name: 'Nuevo archivo' }).click();
    await page.getByLabel('Nombre del archivo nuevo').fill('notas/apuntes.tex');
    await page.keyboard.press('Enter');
    const carpeta = page.getByRole('treeitem', { name: 'notas', exact: true });
    let aparecioDialogo = false;
    page.on('dialog', () => (aparecioDialogo = true));
    await carpeta.focus();
    await carpeta.press('Delete');
    await expect(page.getByRole('treeitem', { name: /apuntes\.tex/ })).toHaveCount(0);
    expect(aparecioDialogo).toBe(false);
    await expect(page.getByRole('treeitem', { name: /main\.tex/ })).toBeFocused();
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.getByRole('treeitem', { name: /apuntes\.tex/ })).toBeVisible();
    // El foco vuelve al árbol, a la fila restaurada.
    await expect(page.getByRole('treeitem', { name: /apuntes\.tex/ })).toBeFocused();
  });

  test('las regiones vivas existen antes de insertar el aviso de borrado', async ({ page }) => {
    await abrirProyectoDeEjemplo(page);
    const polite = page.locator('.mensajes [aria-live="polite"]');
    const assertive = page.locator('.mensajes [aria-live="assertive"]');
    await expect(polite).toBeAttached();
    await expect(assertive).toBeAttached();
    await expect(polite).toBeEmpty();
    await expect(assertive).toBeEmpty();
    await page.getByRole('treeitem', { name: /referencias\.bib/ }).click();
    await page.getByRole('button', { name: 'Borrar', exact: true }).click();
    await expect(polite).toContainText('Se movió referencias.bib a la papelera.');
    await expect(assertive).toBeEmpty();
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
