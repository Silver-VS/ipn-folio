<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '../../textos/t';
  import type { EstadoProyecto } from './estado.svelte';

  // Esqueleto de la paleta de comandos (Ctrl+K): en esta sesión solo se abre y se cierra; los comandos llegan después.
  let { estado }: { estado: EstadoProyecto } = $props();

  let campo = $state<HTMLInputElement>();
  let anterior: Element | null = null;

  $effect(() => {
    if (!estado.paletaAbierta) return;
    anterior = document.activeElement;
    void tick().then(() => campo?.focus());
    return () => {
      if (anterior instanceof HTMLElement) anterior.focus();
    };
  });

  function cerrar() {
    estado.paletaAbierta = false;
  }

  function alTecla(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cerrar();
    } else if (e.key === 'Tab') {
      // Un solo elemento enfocable: el foco se queda dentro del cuadro mientras esté abierto.
      e.preventDefault();
    }
  }
</script>

{#if estado.paletaAbierta}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fondo" onclick={cerrar}>
    <div
      class="paleta"
      role="dialog"
      aria-modal="true"
      aria-label={t('paleta.aria')}
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={alTecla}
    >
      <input
        bind:this={campo}
        class="campo"
        type="search"
        aria-label={t('paleta.campo')}
        placeholder={t('paleta.marcador')}
        autocomplete="off"
      />
      <p class="vacio">{t('paleta.vacia')}</p>
    </div>
  </div>
{/if}

<style>
  .fondo {
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: grid;
    align-items: start;
    justify-items: center;
    padding: var(--ipn-esp-7) var(--ipn-esp-3) 0;
    background: var(--ipn-hundido);
    background: color-mix(in srgb, var(--ipn-fondo) 70%, transparent);
  }

  .paleta {
    width: min(36rem, 100%);
    padding: var(--ipn-esp-3);
    border: 1px solid var(--ipn-linea);
    border-radius: var(--ipn-radio);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
  }

  .campo {
    width: 100%;
    min-height: var(--ipn-objetivo-tactil);
    padding: 0 var(--ipn-esp-3);
    border: 1px solid var(--ipn-borde-control);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    font: inherit;
  }

  .campo:focus-visible {
    outline: 0.1875rem solid var(--ipn-acento);
    outline-offset: 0.125rem;
  }

  .vacio {
    margin: var(--ipn-esp-3) 0 0;
    color: var(--ipn-tenue);
  }
</style>
