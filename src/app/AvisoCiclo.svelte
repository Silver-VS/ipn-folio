<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { t } from '../textos/t';
  import { ciclo } from './ciclo.svelte';

  // Avisos persistentes sobre la base de datos compartida entre pestañas (M4). No se quitan solos: lo que dicen hay
  // que resolverlo (recargar o cerrar otras pestañas).
  const texto = $derived.by(() => {
    switch (ciclo.aviso) {
      case 'version-nueva':
        return t('almacen.aviso.version_nueva');
      case 'bloqueada':
        return t('almacen.aviso.bloqueada');
      case 'cerrada':
        return t('almacen.aviso.cerrada');
      case 'version-nueva-sin-guardar':
        return t('almacen.aviso.version_nueva_sin_guardar');
      case 'apertura-fallida':
        return t('almacen.error.apertura_fallida');
      case 'version-vieja':
        return t('almacen.error.version_nueva');
      default:
        return '';
    }
  });
  const conRecarga = $derived(ciclo.aviso !== undefined && ciclo.aviso !== 'bloqueada');
</script>

<!-- La región existe desde el inicio, vacía: así los lectores de pantalla anuncian el aviso cuando aparece. -->
<div role="status">
  {#if ciclo.aviso}
    <div class="ciclo" data-aviso={ciclo.aviso}>
      <p class="texto">{texto}</p>
      {#if conRecarga}
        <button type="button" class="boton" onclick={() => location.reload()}
          >{t('almacen.aviso.recargar')}</button
        >
      {/if}
    </div>
  {/if}
</div>

<style>
  .ciclo {
    position: fixed;
    inset-inline: 0;
    top: 0;
    z-index: 3000;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ipn-esp-2) var(--ipn-esp-3);
    padding: var(--ipn-esp-2) var(--ipn-esp-4);
    border-bottom: 1px solid var(--ipn-aviso);
    background: var(--ipn-aviso-suave);
    color: var(--ipn-texto);
    font-size: var(--ipn-tamano-s);
  }

  .texto {
    flex: 1 1 16rem;
    margin: 0;
  }

  .boton {
    min-height: var(--ipn-objetivo-tactil);
    padding: 0 var(--ipn-esp-4);
    border: 1px solid var(--ipn-borde-control);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    font: inherit;
    cursor: pointer;
  }

  .boton:focus-visible {
    outline: 0.1875rem solid var(--ipn-acento);
    outline-offset: 0.125rem;
  }
</style>
