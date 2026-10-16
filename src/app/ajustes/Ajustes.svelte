<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { TiendaHerramientas } from '../../herramientas/tienda.svelte';
  import { t } from '../../textos/t';
  import Herramientas from './Herramientas.svelte';

  let { tienda }: { tienda: TiendaHerramientas } = $props();
</script>

<section class="ajustes" aria-labelledby="titulo-ajustes">
  <h2 id="titulo-ajustes">{t('ajustes.titulo')}</h2>
  <Herramientas {tienda} />
  <!-- Lugar para «Conectar con Microsoft» (sesión 10). -->
  <div data-montaje="cuenta-microsoft"></div>
  <a class="boton" href="#/">{t('ajustes.volver')}</a>
</section>

<style>
  .ajustes {
    display: grid;
    gap: var(--ipn-esp-5);
    max-width: 48rem;
    padding: var(--ipn-esp-4);
  }

  h2 {
    margin: 0;
    font-size: var(--ipn-tamano-xl);
  }

  .boton {
    justify-self: start;
  }
</style>
