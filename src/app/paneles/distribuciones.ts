// SPDX-License-Identifier: AGPL-3.0-or-later
// Paneles y distribuciones predefinidas (D10). Las predefinidas se construyen con la API de dockview; lo que la persona
// acomoda después se guarda como JSON (ver espacio.ts).
import type { DockviewApi } from 'dockview';
import { t } from '../../textos/t';

export const PANELES = ['archivos', 'editor', 'pdf', 'problemas', 'salida'] as const;
export type IdPanel = (typeof PANELES)[number];

export const DISTRIBUCIONES = ['lado-a-lado', 'editor-arriba', 'solo-editor', 'enfocada'] as const;
export type IdDistribucion = (typeof DISTRIBUCIONES)[number];

/** Distribución con la que se abre un proyecto la primera vez. */
export const DISTRIBUCION_INICIAL: IdDistribucion = 'lado-a-lado';

export function esIdPanel(valor: string): valor is IdPanel {
  return (PANELES as readonly string[]).includes(valor);
}

export function tituloPanel(id: IdPanel): string {
  switch (id) {
    case 'archivos':
      return t('paneles.archivos');
    case 'editor':
      return t('paneles.editor');
    case 'pdf':
      return t('paneles.pdf');
    case 'problemas':
      return t('paneles.problemas');
    case 'salida':
      return t('paneles.salida');
  }
}

export function nombreDistribucion(id: IdDistribucion): string {
  switch (id) {
    case 'lado-a-lado':
      return t('distribucion.lado_a_lado');
    case 'editor-arriba':
      return t('distribucion.editor_arriba');
    case 'solo-editor':
      return t('distribucion.solo_editor');
    case 'enfocada':
      return t('distribucion.enfocada');
  }
}

/** Cuadrícula 3×3 para la miniatura de cada distribución (se dibuja con CSS en el menú). */
export function miniatura(id: IdDistribucion): string[] {
  switch (id) {
    case 'lado-a-lado':
      return ['a', 'e', 'p', 'a', 'e', 'p', 'a', 'x', 'x'];
    case 'editor-arriba':
      return ['a', 'e', 'e', 'a', 'p', 'p', 'a', 'x', 'x'];
    case 'solo-editor':
      return ['a', 'e', 'e', 'a', 'e', 'e', 'a', 'e', 'e'];
    case 'enfocada':
      return ['e', 'e', 'e', 'e', 'e', 'e', 'e', 'e', 'e'];
  }
}

function agregar(api: DockviewApi, id: IdPanel, posicion?: Parameters<DockviewApi['addPanel']>[0]['position'], extra = {}) {
  return api.addPanel({ id, component: id, title: tituloPanel(id), ...(posicion ? { position: posicion } : {}), ...extra });
}

/** Vacía el espacio y arma una distribución predefinida. */
export function construirDistribucion(api: DockviewApi, id: IdDistribucion): void {
  api.clear();
  const editor = agregar(api, 'editor');
  switch (id) {
    case 'lado-a-lado': {
      agregar(api, 'archivos', { referencePanel: editor, direction: 'left' }, { initialWidth: 240 });
      agregar(api, 'pdf', { referencePanel: editor, direction: 'right' });
      const problemas = agregar(api, 'problemas', { referencePanel: editor, direction: 'below' }, { initialHeight: 180 });
      agregar(api, 'salida', { referencePanel: problemas, direction: 'within' });
      problemas.api.setActive();
      break;
    }
    case 'editor-arriba': {
      agregar(api, 'archivos', { referencePanel: editor, direction: 'left' }, { initialWidth: 240 });
      const pdf = agregar(api, 'pdf', { referencePanel: editor, direction: 'below' }, { initialHeight: 320 });
      const problemas = agregar(api, 'problemas', { referencePanel: pdf, direction: 'right' });
      agregar(api, 'salida', { referencePanel: problemas, direction: 'within' });
      problemas.api.setActive();
      break;
    }
    case 'solo-editor':
      agregar(api, 'archivos', { referencePanel: editor, direction: 'left' }, { initialWidth: 240 });
      break;
    case 'enfocada':
      break;
  }
  editor.api.setActive();
}

/** Dónde se agrega un panel que la persona vuelve a mostrar (junto al editor, por omisión). */
export function mostrarPanel(api: DockviewApi, id: IdPanel): void {
  if (api.getPanel(id)) return;
  const editor = api.getPanel('editor');
  const posicion = editor
    ? {
        referencePanel: editor,
        direction: id === 'archivos' ? ('left' as const) : id === 'pdf' ? ('right' as const) : ('below' as const),
      }
    : undefined;
  const panel = agregar(api, id, posicion, id === 'archivos' ? { initialWidth: 240 } : id === 'pdf' ? {} : { initialHeight: 180 });
  panel.api.setActive();
}
