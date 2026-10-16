<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { acerca } from './acerca';
  import Inicio from './app/Inicio.svelte';
  import { rutaDeHash, type Ruta } from './app/ruta';
  import { t } from './textos/t';

  let ruta = $state<Ruta>(rutaDeHash(location.hash));
  // La pantalla de proyecto (CodeMirror, paneles) se descarga solo al abrir un proyecto: el inicio queda ligero.
  let cargaProyecto: Promise<typeof import('./app/proyecto/Proyecto.svelte')> | undefined;
  const cargarProyecto = () => (cargaProyecto ??= import('./app/proyecto/Proyecto.svelte'));

  onMount(() => {
    const alCambiarHash = () => (ruta = rutaDeHash(location.hash));
    window.addEventListener('hashchange', alCambiarHash);
    return () => window.removeEventListener('hashchange', alCambiarHash);
  });
</script>

{#if ruta.pantalla === 'proyecto'}
  {#await cargarProyecto() then modulo}
    {#key ruta.id}
      <modulo.default id={ruta.id} />
    {/key}
  {/await}
{:else}
  <div class="cascaron">
    <header class="encabezado">
      <h1 class="marca">{t('app.nombre')}</h1>
      <p class="lema">{t('app.lema')}</p>
    </header>

    <main id="espacio-de-trabajo" aria-label={t('inicio.espacio.aria')}>
      <Inicio />
    </main>

    <footer class="pie">
      <a href={acerca.REPO_URL} rel="noopener"
        >{t('pie.codigo_fuente_licencia', { licencia: acerca.LICENCIA })}</a
      >
    </footer>
  </div>
{/if}

<style>
  .cascaron {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-height: 100dvh;
  }

  .encabezado {
    padding: var(--ipn-esp-5) var(--ipn-esp-4) var(--ipn-esp-3);
  }

  .marca {
    margin: 0;
    font-size: var(--ipn-tamano-xl);
    color: var(--ipn-acento);
  }

  .lema {
    margin: var(--ipn-esp-1) 0 0;
    color: var(--ipn-tenue);
  }

  main {
    flex: 1;
  }

  .pie {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ipn-esp-2);
    padding: var(--ipn-esp-3) var(--ipn-esp-4);
    border-top: 1px solid var(--ipn-linea);
    background: var(--ipn-superficie);
    font-size: var(--ipn-tamano-s);
  }

  .pie a {
    display: inline-flex;
    align-items: center;
    min-height: calc(var(--ipn-esp-6) + var(--ipn-esp-3));
  }
</style>
