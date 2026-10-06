<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { plano } from '../../textos/plano';
  import { t } from '../../textos/t';
  import type { EstadoProyecto } from '../proyecto/estado.svelte';

  let { estado }: { estado: EstadoProyecto } = $props();
</script>

<section class="problemas" aria-label={t('paneles.problemas')}>
  {#if estado.problemas.length === 0}
    <p class="vacio">{t('problemas.vacio')}</p>
  {:else}
    <ul class="lista">
      {#each estado.problemas as problema, i (i)}
        <li class="problema {problema.severidad}">
          <span class="etiqueta"
            >{problema.severidad === 'error' ? t('problemas.error') : t('problemas.aviso')}</span
          >
          <span class="texto">{problema.texto}</span>
          {#if problema.ruta}
            <span class="donde"
              >{plano(
                problema.linea
                  ? t('problemas.donde_linea', { ruta: problema.ruta, linea: problema.linea })
                  : t('problemas.donde', { ruta: problema.ruta }),
              )}</span
            >
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .problemas {
    height: 100%;
    overflow: auto;
    padding: var(--ipn-esp-3);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
  }

  .vacio {
    margin: 0;
    color: var(--ipn-tenue);
  }

  .lista {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: var(--ipn-esp-2);
  }

  .problema {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ipn-esp-2);
    align-items: baseline;
    padding: var(--ipn-esp-2) var(--ipn-esp-3);
    border-radius: var(--ipn-radio-s);
    border-left: 0.25rem solid var(--ipn-linea);
    background: var(--ipn-hundido);
  }

  .problema.error {
    border-left-color: var(--ipn-error);
    background: var(--ipn-error-suave);
  }

  .problema.aviso {
    border-left-color: var(--ipn-aviso);
    background: var(--ipn-aviso-suave);
  }

  .etiqueta {
    font-weight: 700;
    font-size: var(--ipn-tamano-xs);
  }

  .donde {
    color: var(--ipn-tenue);
    font-size: var(--ipn-tamano-xs);
  }
</style>
