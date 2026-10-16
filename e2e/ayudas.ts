// SPDX-License-Identifier: AGPL-3.0-or-later
// Ayudas comunes de las pruebas de la pantalla de proyecto.
import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** En la primera visita aparece la bienvenida (sesión 07): «Descargar después» la cierra sin descargar nada. */
export async function omitirBienvenida(page: Page): Promise<void> {
  const despues = page.getByRole('button', { name: 'Descargar después' });
  const inicio = page.getByRole('button', { name: 'Crear un proyecto de ejemplo' });
  await expect(despues.or(inicio)).toBeVisible();
  if (await despues.isVisible()) await despues.click();
  await expect(inicio).toBeVisible();
}

/** Crea el proyecto de ejemplo desde el inicio y espera a que el editor esté listo. Devuelve el hash del proyecto. */
export async function abrirProyectoDeEjemplo(page: Page): Promise<string> {
  await page.goto('/');
  await omitirBienvenida(page);
  await page.getByRole('button', { name: 'Crear un proyecto de ejemplo' }).click();
  await page.waitForURL(/#\/proyecto\//);
  await esperarEditor(page);
  return new URL(page.url()).hash;
}

/** El editor (CodeMirror) del archivo activo; las pestañas no activas quedan ocultas. */
export function editorActivo(page: Page): Locator {
  return page.locator('.vista:not([hidden]) .cm-content');
}

/** El editor (CodeMirror) del archivo activo está dibujado. */
export async function esperarEditor(page: Page): Promise<void> {
  await expect(editorActivo(page)).toBeVisible();
}

/**
 * Texto completo del documento del archivo activo (CodeMirror solo dibuja las líneas visibles, así que no sirve
 * leer el DOM): se pregunta a la vista de CodeMirror que cuelga del elemento.
 */
export async function textoDelEditor(page: Page): Promise<string> {
  return editorActivo(page).evaluate((el) => {
    const vista = (el as unknown as { cmTile?: { view?: { state: { doc: { toString(): string } } } } }).cmTile
      ?.view;
    return vista ? vista.state.doc.toString() : (el as HTMLElement).innerText;
  });
}

/** Marca de tiempo del último guardado que muestra el indicador (0 si aún no hubo ninguno en esta pestaña). */
export async function marcaDeGuardado(page: Page): Promise<number> {
  return Number(await page.locator('.guardado').getAttribute('data-ultimo'));
}

/**
 * Espera a que el indicador diga «guardado» Y a que haya habido un guardado nuevo después de `marca` (tomada con
 * `marcaDeGuardado` antes de escribir): el texto «Guardado en este equipo…» sigue en pantalla mientras hay algo pendiente.
 */
export async function esperarGuardado(page: Page, marca = 0): Promise<void> {
  await expect(page.locator('.guardado[data-estado="guardado"]')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => marcaDeGuardado(page), { timeout: 10_000 }).toBeGreaterThan(marca);
}

/** Elige una opción de un menú de la barra superior (p. ej. «Distribución» → «Solo editor»). */
export async function elegirEnMenu(page: Page, menu: string, opcion: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: menu, exact: true }).click();
  const exact = typeof opcion === 'string';
  await page
    .getByRole('menuitem', { name: opcion, exact })
    .or(page.getByRole('menuitemcheckbox', { name: opcion, exact }))
    .click();
}
