<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { t } from '../../textos/t';

  let { activar, recargar = false }: { activar: () => void; recargar?: boolean } = $props();
</script>

<div class="aviso" aria-label={t('pwa.actualizacion.aria')}>
  <span>{recargar ? t('pwa.actualizacion.recargar') : t('pwa.actualizacion.aviso')}</span>
  <button type="button" class="boton boton-primario" onclick={activar}>{t('pwa.actualizacion.boton')}</button>
</div>

<style>
  .aviso {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--ipn-esp-3);
    padding: var(--ipn-esp-2) var(--ipn-esp-4);
    background: var(--ipn-info-suave);
    color: var(--ipn-texto);
    border-bottom: 1px solid var(--ipn-linea);
  }
</style>
