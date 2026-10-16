<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  // Ajustes › Herramientas: instalar o quitar herramientas y el ajuste «Solo con Wi-Fi» (D15).
  import { CATALOGO, megasDeHerramienta, textosDe, type Herramienta } from '../../herramientas/catalogo';
  import type { TiendaHerramientas } from '../../herramientas/tienda.svelte';
  import { t } from '../../textos/t';
  import { tick } from 'svelte';
  import PanelDescarga from '../avisos/PanelDescarga.svelte';

  let { tienda }: { tienda: TiendaHerramientas } = $props();

  let confirmandoQuitar = $state(false);
  let falloQuitar = $state(false);
  const megas = megasDeHerramienta('latex');
  const usadoMb = $derived(tienda.espacioUsado ? Math.round(tienda.espacioUsado.usado / 1e6) : undefined);
  const enNavegador = CATALOGO.filter((h) => h.disponibilidad !== 'escritorio');
  const enEscritorio = CATALOGO.filter((h) => h.disponibilidad === 'escritorio');

  function estadoTexto(h: Herramienta): string {
    if (h.disponibilidad === 'proximamente') return t('herramientas.proximamente');
    if (h.disponibilidad === 'escritorio') return t('herramientas.app_escritorio');
    if (tienda.error) return t('herramientas.estado.error');
    if (tienda.latex.estado === 'descargando') {
      return tienda.pausada ? t('herramientas.estado.pausada') : t('herramientas.estado.descargando');
    }
    return tienda.instalada ? t('herramientas.estado.instalada') : t('herramientas.estado.no_instalada');
  }

  async function quitar() {
    confirmandoQuitar = false;
    falloQuitar = false;
    try {
      await tienda.quitar('latex');
    } catch (error) {
      console.error('Folio: fallo al quitar LaTeX', error);
      falloQuitar = true;
    }
  }
  function enfocar(nodo: HTMLElement) {
    const anterior = document.activeElement as HTMLElement | null;
    nodo.querySelector('button')?.focus();
    return {
      destroy() {
        void tick().then(() => anterior?.isConnected && anterior.focus());
      },
    };
  }
</script>

<section class="herramientas" aria-labelledby="titulo-herramientas">
  <h2 id="titulo-herramientas">{t('herramientas.titulo')}</h2>

  <div class="solo-wifi">
    <label class="casilla">
      <input
        type="checkbox"
        checked={tienda.soloWifi}
        onchange={(e) => void tienda.cambiarSoloWifi(e.currentTarget.checked)}
      />
      <span class="texto"
        ><strong>{t('ajustes.solo_wifi.titulo')}</strong>
        <span class="ayuda">{t('ajustes.solo_wifi.ayuda')}</span></span
      >
    </label>
  </div>

  <h3>{t('herramientas.en_navegador')}</h3>
  <p class="ayuda">{t('herramientas.en_navegador_ayuda')}</p>
  <ul class="lista">
    {#each enNavegador as h (h.id)}
      {@const textos = textosDe(h.id)}
      <li class="fila" data-herramienta={h.id}>
        <span class="sigla" aria-hidden="true">{textos.sigla}</span>
        <div class="datos">
          <strong>{textos.nombre}</strong>
          <span class="ayuda">{textos.descripcion}</span>
          <span class="estado">
            {estadoTexto(h)}{#if h.disponibilidad === 'instalable'}
              · {t('herramientas.tamano', { megas })}{/if}
          </span>
        </div>
        {#if h.disponibilidad === 'instalable'}
          {#if tienda.instalada}
            <button type="button" class="boton" onclick={() => (confirmandoQuitar = true)}
              >{t('herramientas.quitar')}</button
            >
          {:else if tienda.latex.estado !== 'descargando' && !tienda.pregunta}
            <button
              type="button"
              class="boton boton-primario"
              data-solicitar-descarga
              onclick={() => void tienda.solicitar()}>{t('herramientas.instalar')}</button
            >
          {/if}
        {/if}
      </li>
    {/each}
  </ul>

  {#if confirmandoQuitar}
    <div class="panel" role="alertdialog" aria-labelledby="quitar-aviso" use:enfocar>
      <p id="quitar-aviso">{t('herramientas.quitar_aviso', { nombre: textosDe('latex').nombre, megas })}</p>
      <div class="acciones">
        <button type="button" class="boton boton-primario" onclick={() => void quitar()}
          >{t('herramientas.quitar')}</button
        >
        <button type="button" class="boton" onclick={() => (confirmandoQuitar = false)}
          >{t('descarga.confirmar.no')}</button
        >
      </div>
    </div>
  {/if}

  {#if falloQuitar}<p role="alert">{t('herramientas.error_quitar')}</p>{/if}
  <PanelDescarga {tienda} />

  <h3>{t('herramientas.solo_escritorio')}</h3>
  <p class="ayuda">{t('herramientas.solo_escritorio_ayuda')}</p>
  <ul class="lista">
    {#each enEscritorio as h (h.id)}
      {@const textos = textosDe(h.id)}
      <li class="fila" data-herramienta={h.id}>
        <span class="sigla" aria-hidden="true">{textos.sigla}</span>
        <div class="datos">
          <strong>{textos.nombre}</strong>
          <span class="ayuda">{textos.descripcion}</span>
          <span class="estado">{estadoTexto(h)}</span>
        </div>
      </li>
    {/each}
  </ul>

  {#if usadoMb !== undefined}
    <p class="ayuda" data-espacio>{t('herramientas.espacio', { usado: usadoMb })}</p>
  {/if}
  {#if tienda.persistente !== undefined}
    <p class="ayuda">
      {tienda.persistente ? t('herramientas.persistencia_si') : t('herramientas.persistencia_no')}
    </p>
  {/if}
</section>

<style>
  .herramientas {
    display: grid;
    gap: var(--ipn-esp-3);
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: var(--ipn-tamano-l);
  }

  h3 {
    margin-top: var(--ipn-esp-3);
    font-size: var(--ipn-tamano-m);
  }

  .ayuda {
    color: var(--ipn-tenue);
    font-size: var(--ipn-tamano-s);
  }

  .casilla {
    display: flex;
    align-items: flex-start;
    gap: var(--ipn-esp-3);
    min-height: var(--ipn-objetivo-tactil);
  }

  .casilla input {
    flex: none;
    width: var(--ipn-esp-5);
    height: var(--ipn-esp-5);
    margin-top: var(--ipn-esp-1);
    accent-color: var(--ipn-acento);
  }

  .texto {
    display: grid;
    gap: var(--ipn-esp-1);
  }

  .lista {
    display: grid;
    gap: var(--ipn-esp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .fila {
    display: flex;
    align-items: center;
    gap: var(--ipn-esp-3);
    padding: var(--ipn-esp-3);
    border: 1px solid var(--ipn-linea);
    border-radius: var(--ipn-radio);
    background: var(--ipn-superficie);
  }

  .sigla {
    display: grid;
    place-items: center;
    flex: none;
    width: var(--ipn-objetivo-tactil);
    height: var(--ipn-objetivo-tactil);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-acento-suave);
    color: var(--ipn-acento);
    font-weight: 700;
    font-size: var(--ipn-tamano-s);
  }

  .datos {
    display: grid;
    flex: 1;
    gap: var(--ipn-esp-1);
    min-width: 0;
  }

  .estado {
    font-size: var(--ipn-tamano-s);
  }

  .panel {
    display: grid;
    gap: var(--ipn-esp-3);
    padding: var(--ipn-esp-4);
    border: 1px solid var(--ipn-linea);
    border-radius: var(--ipn-radio);
    background: var(--ipn-aviso-suave);
  }

  .acciones {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ipn-esp-3);
  }
</style>
