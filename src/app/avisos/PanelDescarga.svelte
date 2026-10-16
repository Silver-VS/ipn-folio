<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  // Lo que se ve mientras LaTeX se descarga (o espera una respuesta sobre la red, o falló): progreso real en bytes,
  // «Pausar», «Reanudar» y «Cancelar» (Main.dc.html). Los tamaños salen del manifiesto medido, no de cifras fijas.
  import { megasDeHerramienta } from '../../herramientas/catalogo';
  import type { TiendaHerramientas } from '../../herramientas/tienda.svelte';
  import { t } from '../../textos/t';
  import { tick } from 'svelte';

  let { tienda }: { tienda: TiendaHerramientas } = $props();

  const megas = megasDeHerramienta('latex');
  const cargados = $derived(Math.round((tienda.progreso?.cargados ?? tienda.latex.bytes) / 1e6));
  const total = $derived(tienda.progreso?.total ?? 0);
  const valor = $derived(tienda.progreso?.cargados ?? tienda.latex.bytes);
  function enfocar(nodo: HTMLElement) {
    const anterior = document.activeElement as HTMLElement | null;
    nodo.querySelector('button')?.focus();
    return {
      destroy() {
        void tick().then(() => {
          if (anterior?.isConnected && anterior !== document.body) anterior.focus();
          else document.querySelector<HTMLElement>('[data-solicitar-descarga]')?.focus();
        });
      },
    };
  }
</script>

{#if tienda.pregunta}
  <div class="panel" role="alertdialog" aria-labelledby="pregunta-red" use:enfocar>
    <p id="pregunta-red">
      {#if tienda.pregunta === 'datos-moviles'}
        {t('descarga.confirmar.datos_moviles', { megas })}
      {:else if tienda.pregunta === 'desconocida'}
        {t('descarga.confirmar.desconocida', { megas })}
      {:else}
        {t('descarga.confirmar.ahorro', { megas })}
      {/if}
    </p>
    <div class="acciones">
      <button type="button" class="boton boton-primario" onclick={() => void tienda.confirmar()}
        >{t('descarga.confirmar.si')}</button
      >
      <button type="button" class="boton" onclick={() => tienda.rechazar()}
        >{t('descarga.confirmar.no')}</button
      >
    </div>
  </div>
{:else if tienda.error}
  <div class="panel error" role="alert">
    <p>
      {#if tienda.error === 'red'}
        {t('descarga.error.red')}
      {:else if tienda.error === 'version'}
        {t('descarga.error.version', { megas })}
      {:else if tienda.error === 'espacio'}
        {t('descarga.error.espacio')}
      {:else}
        {t('descarga.error.otro')}
      {/if}
    </p>
    <div class="acciones">
      <button type="button" class="boton boton-primario" onclick={() => void tienda.reanudar()}
        >{t('herramientas.reintentar')}</button
      >
    </div>
  </div>
{:else if tienda.latex.estado === 'descargando'}
  <div class="panel" data-descarga={tienda.pausada ? 'pausada' : 'en-curso'}>
    <p class="titulo">
      {#if tienda.pausada}
        {t('descarga.en_pausa', { cargados, megas })}
      {:else}
        {t('descarga.en_curso', { cargados, megas })}
      {/if}
    </p>
    <progress aria-label={t('descarga.barra.aria')} max={total || undefined} value={total ? valor : undefined}
    ></progress>
    <p class="ayuda">{t('descarga.ayuda')}</p>
    <div class="acciones">
      {#if tienda.pausada}
        <button type="button" class="boton boton-primario" onclick={() => void tienda.reanudar()}
          >{t('descarga.reanudar')}</button
        >
      {:else}
        <button type="button" class="boton" onclick={() => tienda.pausar()}>{t('descarga.pausar')}</button>
      {/if}
      <button type="button" class="boton" onclick={() => void tienda.cancelar()}
        >{t('descarga.cancelar')}</button
      >
    </div>
  </div>
{/if}

<style>
  .panel {
    display: grid;
    gap: var(--ipn-esp-3);
    padding: var(--ipn-esp-4);
    border: 1px solid var(--ipn-linea);
    border-radius: var(--ipn-radio);
    background: var(--ipn-superficie);
  }

  .panel.error {
    border-color: var(--ipn-error);
    background: var(--ipn-error-suave);
  }

  p {
    margin: 0;
  }

  .titulo {
    font-weight: 600;
  }

  .ayuda {
    color: var(--ipn-tenue);
    font-size: var(--ipn-tamano-s);
  }

  progress {
    width: 100%;
    height: var(--ipn-esp-3);
    accent-color: var(--ipn-acento);
  }

  .acciones {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ipn-esp-3);
  }
</style>
