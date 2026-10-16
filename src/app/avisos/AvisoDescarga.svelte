<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  // «Antes de crear tu primer PDF…» (Main.dc.html): invita a descargar el compilador de LaTeX, sin hacerlo solo.
  // Mientras se descarga, o si la red necesita una respuesta, o si falló, muestra el panel de descarga.
  import { megasDeHerramienta } from '../../herramientas/catalogo';
  import type { TiendaHerramientas } from '../../herramientas/tienda.svelte';
  import { t } from '../../textos/t';
  import PanelDescarga from './PanelDescarga.svelte';

  let { tienda }: { tienda: TiendaHerramientas } = $props();

  const megas = megasDeHerramienta('latex');
  let pospuesto = $state(false);
  let terminoAhora = $state(false);
  let veniaDescargando = false;

  $effect(() => {
    if (tienda.descargando || tienda.pausada) veniaDescargando = true;
    else if (tienda.instalada && veniaDescargando) terminoAhora = true;
  });

  const ocupado = $derived(
    tienda.pregunta !== null || tienda.error !== null || tienda.latex.estado === 'descargando',
  );
</script>

{#if ocupado}
  <section class="aviso" aria-labelledby="aviso-descarga-titulo">
    <h2 id="aviso-descarga-titulo">{t('descarga.aviso.titulo')}</h2>
    <PanelDescarga {tienda} />
  </section>
{:else if terminoAhora}
  <p class="listo">{t('descarga.lista')}</p>
{:else if !tienda.instalada && !pospuesto}
  <section class="aviso" aria-labelledby="aviso-descarga-titulo">
    <h2 id="aviso-descarga-titulo">{t('descarga.aviso.titulo')}</h2>
    <p>{t('descarga.aviso.cuerpo', { megas })}</p>
    <div class="acciones">
      <button type="button" class="boton" data-solicitar-descarga onclick={() => void tienda.solicitar()}
        >{t('descarga.aviso.ahora')}</button
      >
      <button type="button" class="boton" onclick={() => (pospuesto = true)}
        >{t('descarga.aviso.esperar')}</button
      >
    </div>
  </section>
{/if}

<style>
  .aviso {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ipn-esp-3);
    margin-bottom: var(--ipn-esp-5);
    padding-block: var(--ipn-esp-3);
    border-bottom: var(--ipn-borde-fino) solid var(--ipn-linea);
  }

  h2 {
    margin: 0;
    font-size: var(--ipn-tamano-m);
  }

  p {
    margin: 0;
  }

  .aviso > p {
    color: var(--ipn-tenue);
    font-size: var(--ipn-tamano-s);
  }

  .listo {
    margin: 0 0 var(--ipn-esp-5);
    padding: var(--ipn-esp-3) var(--ipn-esp-4);
    border-radius: var(--ipn-radio);
    background: var(--ipn-ok-suave);
    color: var(--ipn-ok);
  }

  .acciones {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ipn-esp-3);
  }
  .boton {
    max-width: 100%;
    padding-block: var(--ipn-esp-2);
    text-align: center;
  }
</style>
