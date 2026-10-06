<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { t } from '../../textos/t';
  import type { EstadoProyecto } from './estado.svelte';

  let { estado }: { estado: EstadoProyecto } = $props();
</script>

<div class="mensajes" role="region" aria-label={t('mensajes.aria')}>
  {#each estado.mensajes as mensaje (mensaje.id)}
    <div
      class="mensaje {mensaje.tipo}"
      role={mensaje.tipo === 'error' ? 'alert' : 'status'}
    >
      <p class="texto">{mensaje.texto}</p>
      {#if mensaje.accion}
        {@const accion = mensaje.accion}
        <button
          type="button"
          class="boton"
          onclick={() => {
            accion.ejecutar();
            estado.quitarMensaje(mensaje.id);
          }}>{accion.etiqueta}</button
        >
      {/if}
      <button
        type="button"
        class="cerrar"
        aria-label={t('aviso.cerrar.boton')}
        onclick={() => estado.quitarMensaje(mensaje.id)}>&times;</button
      >
    </div>
  {/each}
</div>

<style>
  .mensajes {
    position: fixed;
    inset-inline: var(--ipn-esp-3);
    bottom: var(--ipn-esp-3);
    z-index: 2000;
    display: grid;
    gap: var(--ipn-esp-2);
    justify-items: end;
    pointer-events: none;
  }

  .mensaje {
    display: flex;
    align-items: center;
    gap: var(--ipn-esp-2);
    max-width: 36rem;
    padding: var(--ipn-esp-1) var(--ipn-esp-1) var(--ipn-esp-1) var(--ipn-esp-3);
    border: 1px solid var(--ipn-info);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-info-suave);
    color: var(--ipn-texto);
    font-size: var(--ipn-tamano-s);
    pointer-events: auto;
  }

  .mensaje.aviso {
    border-color: var(--ipn-aviso);
    background: var(--ipn-aviso-suave);
  }

  .mensaje.error {
    border-color: var(--ipn-error);
    background: var(--ipn-error-suave);
  }

  .texto {
    margin: 0;
    flex: 1;
  }

  .boton,
  .cerrar {
    min-height: var(--ipn-objetivo-tactil);
    min-width: var(--ipn-objetivo-tactil);
    border: 1px solid var(--ipn-borde-control);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    font: inherit;
    cursor: pointer;
  }

  .boton {
    padding: 0 var(--ipn-esp-3);
  }

  .cerrar {
    border-color: transparent;
    background: none;
    font-size: var(--ipn-tamano-l);
    line-height: 1;
  }

  .boton:focus-visible,
  .cerrar:focus-visible {
    outline: 0.1875rem solid var(--ipn-acento);
    outline-offset: 0.125rem;
  }
</style>
