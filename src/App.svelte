<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { acerca } from './acerca';
  import { t } from './textos/t';
</script>

<div class="cascaron">
  <header class="encabezado">
    <h1 class="marca">{t('app.nombre')}</h1>
    <p class="lema">{t('app.lema')}</p>
  </header>

  <main id="espacio-de-trabajo" aria-label={t('inicio.espacio.aria')}></main>

  <footer class="pie">
    <a href={acerca.REPO_URL} rel="noopener">{t('pie.codigo_fuente')}</a>
    <span class="licencia">({acerca.LICENCIA})</span>
  </footer>
</div>

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

  .licencia {
    color: var(--ipn-tenue);
  }
</style>
