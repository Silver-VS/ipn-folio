<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { t } from '../../textos/t';
  import type { EstadoProyecto } from '../proyecto/estado.svelte';
  import { LIMITE_VIRTUAL, lineasDe, rangoVisible } from './ventana-virtual';

  let { estado }: { estado: EstadoProyecto } = $props();

  const lineas = $derived(lineasDe(estado.salida));
  const virtual = $derived(lineas.length > LIMITE_VIRTUAL);

  let contenedor = $state<HTMLElement>();
  let muestra = $state<HTMLElement>();
  let scrollTop = $state(0);
  let altoVisible = $state(0);
  let altoLinea = $state(20);

  $effect(() => {
    if (!contenedor) return;
    const observador = new ResizeObserver(() => {
      altoVisible = contenedor?.clientHeight ?? 0;
      altoLinea = muestra?.getBoundingClientRect().height || altoLinea;
    });
    observador.observe(contenedor);
    if (muestra) observador.observe(muestra);
    return () => observador.disconnect();
  });

  const rango = $derived(rangoVisible(scrollTop, altoVisible, altoLinea, lineas.length));
  const visibles = $derived(virtual ? lineas.slice(rango.desde, rango.hasta) : lineas);
</script>

<section class="salida" aria-label={t('paneles.salida')}>
  {#if lineas.length === 0}
    <p class="vacio">{t('salida.vacio')}</p>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="registro"
      role="log"
      tabindex="0"
      aria-label={t('salida.registro_aria')}
      bind:this={contenedor}
      onscroll={() => (scrollTop = contenedor?.scrollTop ?? 0)}
    >
      <pre class="muestra" aria-hidden="true" bind:this={muestra}>X</pre>
      {#if virtual}<div style:height="{rango.antes}px"></div>{/if}
      <pre class="texto">{visibles.join('\n')}</pre>
      {#if virtual}<div style:height="{rango.despues}px"></div>{/if}
    </div>
  {/if}
</section>

<style>
  .salida {
    height: 100%;
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
  }

  .vacio {
    margin: 0;
    padding: var(--ipn-esp-3);
    color: var(--ipn-tenue);
  }

  .registro {
    position: relative;
    height: 100%;
    overflow: auto;
    padding: var(--ipn-esp-2) var(--ipn-esp-3);
  }

  .registro:focus-visible {
    outline: 0.1875rem solid var(--ipn-acento);
    outline-offset: -0.1875rem;
  }

  pre {
    margin: 0;
    font-family: var(--ipn-fuente-mono);
    font-variant-ligatures: none;
    font-size: var(--ipn-tamano-xs);
    line-height: 1.5;
    white-space: pre;
  }

  /* Mide el alto real de una línea (con el interlineado y la fuente del momento). */
  .muestra {
    position: absolute;
    visibility: hidden;
    pointer-events: none;
  }
</style>
