<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { EditorView } from '@codemirror/view';
  import { tick } from 'svelte';
  import { t } from '../../textos/t';
  import { PESTANAS_COMPACTAS, type EstadoProyecto, type PestanaCompacta } from '../proyecto/estado.svelte';
  import PanelArchivos from './PanelArchivos.svelte';
  import PanelEditor from './PanelEditor.svelte';
  import PanelPdf from './PanelPdf.svelte';
  import PanelProblemas from './PanelProblemas.svelte';
  import PanelSalida from './PanelSalida.svelte';

  // Modo compacto (teléfonos): un panel a la vez a pantalla completa y pestañas abajo. Todos los paneles quedan
  // montados (solo se ocultan) para no perder el cursor ni el scroll al cambiar de pestaña.
  let { estado }: { estado: EstadoProyecto } = $props();

  let contenedor = $state<HTMLElement>();

  function etiqueta(p: PestanaCompacta): string {
    switch (p) {
      case 'editor':
        return t('paneles.editor');
      case 'pdf':
        return t('paneles.pdf');
      case 'archivos':
        return t('paneles.archivos');
      case 'problemas':
        return t('paneles.problemas');
    }
  }

  async function elegir(p: PestanaCompacta) {
    estado.seleccionarPestanaCompacta(p);
    if (p === 'editor') {
      await tick();
      const ruta = estado.activo;
      if (ruta) estado.vistas.get(ruta)?.focus();
    }
  }

  function teclas(e: KeyboardEvent, i: number) {
    const total = PESTANAS_COMPACTAS.length;
    let destino = -1;
    if (e.key === 'ArrowRight') destino = (i + 1) % total;
    else if (e.key === 'ArrowLeft') destino = (i - 1 + total) % total;
    else if (e.key === 'Home') destino = 0;
    else if (e.key === 'End') destino = total - 1;
    if (destino < 0) return;
    e.preventDefault();
    const p = PESTANAS_COMPACTAS[destino];
    if (!p) return;
    estado.seleccionarPestanaCompacta(p);
    void tick().then(() => document.getElementById(`compacta-${estado.id}-${p}`)?.focus());
  }

  // El teclado virtual no debe tapar la línea activa: la altura sigue a `visualViewport` y, al cambiar, se vuelve a
  // mostrar el cursor del editor.
  $effect(() => {
    const vv = window.visualViewport;
    const el = contenedor;
    if (!vv || !el) return;
    const ajustar = () => {
      el.style.setProperty('--alto-visible', `${vv.height}px`);
      const vista = estado.activo ? estado.vistas.get(estado.activo) : undefined;
      if (vista?.hasFocus) {
        vista.dispatch({ effects: EditorView.scrollIntoView(vista.state.selection.main.head, { y: 'nearest', yMargin: 24 }) });
      }
    };
    ajustar();
    vv.addEventListener('resize', ajustar);
    vv.addEventListener('scroll', ajustar);
    return () => {
      vv.removeEventListener('resize', ajustar);
      vv.removeEventListener('scroll', ajustar);
      el.style.removeProperty('--alto-visible');
    };
  });
</script>

<div class="compacto" bind:this={contenedor}>
  <div class="paneles">
    <div
      class="panel"
      role="tabpanel"
      id="panel-compacto-{estado.id}-editor"
      aria-labelledby="compacta-{estado.id}-editor"
      hidden={estado.pestanaCompacta !== 'editor'}
    >
      <PanelEditor {estado} />
    </div>
    <div
      class="panel"
      role="tabpanel"
      id="panel-compacto-{estado.id}-pdf"
      aria-labelledby="compacta-{estado.id}-pdf"
      hidden={estado.pestanaCompacta !== 'pdf'}
    >
      <PanelPdf {estado} />
    </div>
    <div
      class="panel"
      role="tabpanel"
      id="panel-compacto-{estado.id}-archivos"
      aria-labelledby="compacta-{estado.id}-archivos"
      hidden={estado.pestanaCompacta !== 'archivos'}
    >
      <PanelArchivos {estado} />
    </div>
    <div
      class="panel doble"
      role="tabpanel"
      id="panel-compacto-{estado.id}-problemas"
      aria-labelledby="compacta-{estado.id}-problemas"
      hidden={estado.pestanaCompacta !== 'problemas'}
    >
      <div class="mitad"><PanelProblemas {estado} /></div>
      <div class="mitad"><PanelSalida {estado} /></div>
    </div>
  </div>

  <div class="pestanas" role="tablist" aria-label={t('compacto.pestanas_aria')}>
    {#each PESTANAS_COMPACTAS as p, i (p)}
      <button
        type="button"
        role="tab"
        class="pestana"
        id="compacta-{estado.id}-{p}"
        aria-selected={estado.pestanaCompacta === p}
        aria-controls="panel-compacto-{estado.id}-{p}"
        tabindex={estado.pestanaCompacta === p ? 0 : -1}
        onclick={() => void elegir(p)}
        onkeydown={(e) => teclas(e, i)}>{etiqueta(p)}</button
      >
    {/each}
  </div>
</div>

<style>
  .compacto {
    display: flex;
    flex-direction: column;
    height: var(--alto-visible, 100%);
    min-height: 0;
  }

  .paneles {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .panel {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .panel[hidden] {
    display: none;
  }

  .doble {
    display: flex;
    flex-direction: column;
  }

  .mitad {
    flex: 1;
    min-height: 0;
    border-bottom: 1px solid var(--ipn-linea);
  }

  .pestanas {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    flex: none;
    border-top: 1px solid var(--ipn-linea);
    background: var(--ipn-superficie);
  }

  .pestana {
    min-height: var(--ipn-objetivo-tactil);
    padding: 0 var(--ipn-esp-1);
    border: none;
    border-top: 0.1875rem solid transparent;
    background: none;
    color: var(--ipn-tenue);
    font: inherit;
    font-size: var(--ipn-tamano-s);
    cursor: pointer;
  }

  .pestana[aria-selected='true'] {
    border-top-color: var(--ipn-acento);
    background: var(--ipn-acento-suave);
    color: var(--ipn-texto);
    font-weight: 700;
  }

  .pestana:focus-visible {
    outline: 0.1875rem solid var(--ipn-acento);
    outline-offset: -0.1875rem;
  }
</style>
