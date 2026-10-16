// SPDX-License-Identifier: AGPL-3.0-or-later
// Une cada panel con su componente de Svelte. Lo usan el espacio con dockview (modo amplio) y el compacto.
import { mount, unmount } from 'svelte';
import type { Component } from 'svelte';
import type { EstadoProyecto } from '../proyecto/estado.svelte';
import type { IdPanel } from './distribuciones';
import PanelArchivos from './PanelArchivos.svelte';
import PanelEditor from './PanelEditor.svelte';
import PanelPdf from './PanelPdf.svelte';
import PanelProblemas from './PanelProblemas.svelte';
import PanelSalida from './PanelSalida.svelte';

type ComponentePanel = Component<{ estado: EstadoProyecto }>;

const COMPONENTES: Record<IdPanel, ComponentePanel> = {
  archivos: PanelArchivos,
  editor: PanelEditor,
  pdf: PanelPdf,
  problemas: PanelProblemas,
  salida: PanelSalida,
};

/** Monta el panel dentro de `elemento` y devuelve la función que lo desmonta. */
export function montarPanel(id: IdPanel, estado: EstadoProyecto, elemento: HTMLElement): () => void {
  const instancia = mount(COMPONENTES[id], { target: elemento, props: { estado } });
  return () => void unmount(instancia);
}
