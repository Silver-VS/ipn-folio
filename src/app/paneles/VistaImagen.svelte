<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { plano } from '../../textos/plano';
  import { t } from '../../textos/t';
  import { mimeDeImagen } from '../proyecto/arbol';
  import type { EstadoProyecto } from '../proyecto/estado.svelte';

  let { estado, ruta }: { estado: EstadoProyecto; ruta: string } = $props();

  let url = $state('');

  $effect(() => {
    const actual = ruta;
    let objeto = '';
    let vivo = true;
    void estado.servicios.almacen.leer(estado.id, actual).then((archivo) => {
      if (!vivo || !archivo || typeof archivo.contenido === 'string') return;
      objeto = URL.createObjectURL(new Blob([archivo.contenido.slice()], { type: mimeDeImagen(actual) }));
      url = objeto;
    });
    return () => {
      vivo = false;
      if (objeto) URL.revokeObjectURL(objeto);
      url = '';
    };
  });
</script>

<div class="imagen">
  {#if url}
    <img src={url} alt={plano(t('editor.imagen_alt', { ruta }))} />
  {/if}
</div>

<style>
  .imagen {
    display: grid;
    place-items: center;
    height: 100%;
    padding: var(--ipn-esp-4);
    overflow: auto;
    background: var(--ipn-hundido);
  }

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
</style>
