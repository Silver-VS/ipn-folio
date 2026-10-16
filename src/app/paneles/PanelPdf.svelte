<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { plano } from '../../textos/plano';
  import { t } from '../../textos/t';
  import type { EstadoProyecto } from '../proyecto/estado.svelte';
  import { VisorPdf, type EstadoVisor } from './visor-pdf';

  let { estado }: { estado: EstadoProyecto } = $props();

  let raiz = $state<HTMLElement>();
  let selector = $state<HTMLInputElement>();
  let visor = $state.raw<VisorPdf>();
  let info = $state<EstadoVisor>({ pagina: 1, total: 0, zoom: 1, modo: 'ancho' });
  let error = $state('');

  $effect(() => {
    if (!raiz) return;
    const nuevo = new VisorPdf(raiz, {
      alCambiar: (e) => (info = e),
      etiquetaPagina: (n, total) => plano(t('pdf.pagina_aria', { n, total })),
    });
    visor = nuevo;
    return () => {
      nuevo.dispose();
      visor = undefined;
    };
  });

  // Al pasar el panel a otra ventana (o volver) el visor se vuelve a medir y a dibujar.
  $effect(() => {
    void estado.generacionVentanas;
    visor?.remedir();
  });

  // Cada PDF recibido (aunque sea idéntico) se carga conservando página y zoom.
  $effect(() => {
    const pdf = estado.pdf;
    const actual = visor;
    if (!pdf || !actual) return;
    error = '';
    actual.cargar(pdf.bytes).catch(() => {
      error = t('pdf.error_abrir');
    });
  });

  async function abrirDelEquipo(e: Event) {
    const entrada = e.currentTarget as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;
    estado.mostrarPdf(new Uint8Array(await archivo.arrayBuffer()), archivo.name);
  }

  function descargar() {
    const pdf = estado.pdf;
    if (!pdf) return;
    const url = URL.createObjectURL(new Blob([pdf.bytes.slice()], { type: 'application/pdf' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = pdf.nombre.endsWith('.pdf') ? pdf.nombre : `${pdf.nombre}.pdf`;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function irA(e: Event) {
    const entrada = e.currentTarget as HTMLInputElement;
    visor?.irAPagina(Number(entrada.value));
  }
</script>

<section class="pdf" aria-label={t('pdf.aria')}>
  <div class="barra" role="toolbar" aria-label={t('pdf.barra_aria')}>
    <button type="button" class="boton" onclick={() => selector?.click()}>{t('pdf.abrir')}</button>
    <input
      bind:this={selector}
      class="oculto"
      type="file"
      accept="application/pdf,.pdf"
      tabindex="-1"
      aria-hidden="true"
      onchange={abrirDelEquipo}
    />
    {#if estado.pdf}
      {@const porcentaje = Math.round(info.zoom * 100)}
      <label class="pagina">
        <span class="etiqueta">{t('pdf.pagina')}</span>
        <input
          class="campo"
          type="number"
          min="1"
          max={info.total}
          value={info.pagina}
          onchange={irA}
        />
        <span>{t('pdf.de_total', { total: info.total })}</span>
      </label>
      <button type="button" class="boton icono" aria-label={t('pdf.alejar')} onclick={() => visor?.alejar()}
        >&minus;</button
      >
      <span class="zoom" aria-live="polite">{t('pdf.zoom', { porcentaje })}</span>
      <button type="button" class="boton icono" aria-label={t('pdf.acercar')} onclick={() => visor?.acercar()}
        >+</button
      >
      <button
        type="button"
        class="boton"
        aria-pressed={info.modo === 'ancho'}
        onclick={() => visor?.ajustarAncho()}>{t('pdf.ajustar_ancho')}</button
      >
      <button type="button" class="boton" onclick={descargar}>{t('pdf.descargar')}</button>
    {/if}
  </div>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="visor" bind:this={raiz} tabindex="0" role="region" aria-label={t('pdf.vista_aria')}></div>
  {#if !estado.pdf}
    <p class="vacio">{t('pdf.vacio')}</p>
  {/if}
</section>

<style>
  .pdf {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--ipn-hundido);
    color: var(--ipn-texto);
  }

  .barra {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ipn-esp-2);
    padding: var(--ipn-esp-2);
    border-bottom: 1px solid var(--ipn-linea);
    background: var(--ipn-superficie);
    font-size: var(--ipn-tamano-s);
  }

  .boton {
    min-height: var(--ipn-objetivo-tactil);
    min-width: var(--ipn-objetivo-tactil);
    padding: 0 var(--ipn-esp-3);
    border: 1px solid var(--ipn-borde-control);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    font: inherit;
    cursor: pointer;
  }

  .boton:hover {
    background: var(--ipn-acento-suave);
  }

  .boton[aria-pressed='true'] {
    background: var(--ipn-acento-suave);
    border-color: var(--ipn-acento);
  }

  .boton:focus-visible,
  .campo:focus-visible,
  .visor:focus-visible {
    outline: 0.1875rem solid var(--ipn-acento);
    outline-offset: 0.125rem;
  }

  .icono {
    padding: 0;
    font-size: var(--ipn-tamano-l);
    line-height: 1;
  }

  .oculto {
    display: none;
  }

  .pagina {
    display: inline-flex;
    align-items: center;
    gap: var(--ipn-esp-1);
  }

  .etiqueta {
    color: var(--ipn-tenue);
  }

  .campo {
    width: 4.5rem;
    min-height: var(--ipn-objetivo-tactil);
    padding: 0 var(--ipn-esp-2);
    border: 1px solid var(--ipn-borde-control);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    font: inherit;
  }

  .zoom {
    min-width: 3.5rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .error {
    margin: 0;
    padding: var(--ipn-esp-2) var(--ipn-esp-3);
    background: var(--ipn-error-suave);
    color: var(--ipn-error);
  }

  .visor {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0;
  }

  .vacio {
    position: absolute;
    inset: calc(var(--ipn-objetivo-tactil) + var(--ipn-esp-4)) 0 0;
    margin: 0;
    padding: var(--ipn-esp-5);
    color: var(--ipn-tenue);
    pointer-events: none;
  }

  /* Elementos que arma visor-pdf.ts con el DOM directo. */
  .visor :global(.visor-paginas) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 12px;
    width: max-content;
    min-width: 100%;
    box-sizing: border-box;
  }

  .visor :global(.visor-pagina) {
    flex: none;
    background: var(--ipn-superficie);
    box-shadow: 0 0 0 1px var(--ipn-linea);
  }

  .visor :global(.visor-pagina canvas) {
    display: block;
  }
</style>
