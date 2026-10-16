<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { acerca } from './acerca';
  import AvisoCiclo from './app/AvisoCiclo.svelte';
  import Inicio from './app/Inicio.svelte';
  import Ajustes from './app/ajustes/Ajustes.svelte';
  import AvisoActualizacion from './app/avisos/AvisoActualizacion.svelte';
  import Bienvenida from './app/bienvenida/Bienvenida.svelte';
  import { bienvenidaVista } from './app/bienvenida/preferencias';
  import Papelera from './app/papelera/Papelera.svelte';
  import { HASH_AJUSTES, rutaDeHash, type Ruta } from './app/ruta';
  import { servicios, type Servicios } from './app/servicios';
  import { tienda as crearTienda, type TiendaHerramientas } from './herramientas/tienda.svelte';
  import { registrarServiceWorker } from './pwa/registro';
  import { t } from './textos/t';

  let ruta = $state<Ruta>(rutaDeHash(location.hash));
  let hashActual = location.hash;
  let comprobarSalida: (() => boolean) | undefined;
  const protegerSalida = (comprobar?: () => boolean) => {
    comprobarSalida = comprobar;
  };
  // La pantalla de proyecto (CodeMirror, paneles) se descarga solo al abrir un proyecto: el inicio queda ligero.
  let cargaProyecto: Promise<typeof import('./app/proyecto/Proyecto.svelte')> | undefined;
  const cargarProyecto = () => (cargaProyecto ??= import('./app/proyecto/Proyecto.svelte'));

  // Bienvenida de primer uso: hasta saber si ya se vio, el espacio de trabajo queda vacío (sin parpadeo).
  let fase = $state<'cargando' | 'bienvenida' | 'listo'>('cargando');
  let s = $state.raw<Servicios>();
  let herramientas = $state.raw<TiendaHerramientas>();
  let activarActualizacion = $state.raw<(() => void) | undefined>();
  let requiereRecarga = $state(false);
  let errorCarga = $state(false);
  const recargar = () => location.reload();
  const anuncio = $derived(
    activarActualizacion
      ? requiereRecarga
        ? t('pwa.actualizacion.recargar')
        : t('pwa.actualizacion.aviso')
      : !herramientas
        ? ''
        : herramientas.instalada
          ? t('descarga.anuncio.fin')
          : herramientas.pausada
            ? t('descarga.anuncio.pausa')
            : herramientas.descargando
              ? t('descarga.anuncio.inicio')
              : '',
  );

  onMount(() => {
    let indiceHistorial = Number(history.state?.folioIndice ?? 0);
    history.replaceState({ ...history.state, folioIndice: indiceHistorial }, '');
    void Promise.all([servicios(), crearTienda()])
      .then(async ([servicio, tienda]) => {
        s = servicio;
        herramientas = tienda;
        fase = (await bienvenidaVista(servicio.almacen)) ? 'listo' : 'bienvenida';
      })
      .catch((error: unknown) => {
        console.error('Folio: fallo al iniciar los servicios', error);
        errorCarga = true;
      });
    // El service worker solo se registra en el sitio construido; en desarrollo estorbaría a la recarga en caliente.
    if (import.meta.env.PROD) {
      void registrarServiceWorker({
        alHaberActualizacion: (activar, recargar) => {
          activarActualizacion = activar;
          requiereRecarga = !!recargar;
        },
      });
    }
    const alCambiarHash = () => {
      if (location.hash === hashActual) return;
      const destino = Number(history.state?.folioIndice ?? indiceHistorial + 1);
      history.replaceState({ ...history.state, folioIndice: destino }, '');
      if (comprobarSalida && !comprobarSalida()) {
        // Restaurar la posición evita duplicar el proyecto al cancelar un enlace, Atrás o Adelante.
        history.go(indiceHistorial - destino);
        return;
      }
      indiceHistorial = destino;
      hashActual = location.hash;
      ruta = rutaDeHash(hashActual);
    };
    window.addEventListener('hashchange', alCambiarHash);
    return () => window.removeEventListener('hashchange', alCambiarHash);
  });
</script>

<p class="anuncio" role="status" aria-live="polite">{anuncio}</p>
<AvisoCiclo />
{#if activarActualizacion}
  <AvisoActualizacion activar={activarActualizacion} recargar={requiereRecarga} />
{/if}

{#if errorCarga}
  <p role="alert">{t('pwa.error_carga')}</p>
  <button type="button" class="boton" onclick={recargar}>{t('pwa.recargar')}</button>
{:else if ruta.pantalla === 'proyecto'}
  {#await cargarProyecto() then modulo}
    {#key ruta.id}
      <modulo.default id={ruta.id} alProtegerSalida={protegerSalida} />
    {/key}
  {:catch}
    <p role="alert">{t('pwa.error_carga')}</p>
    <button type="button" class="boton" onclick={recargar}>{t('pwa.recargar')}</button>
  {/await}
{:else}
  <div class="cascaron">
    <header class="encabezado">
      <div>
        <h1 class="marca">{t('app.nombre')}</h1>
        <p class="lema">{t('app.lema')}</p>
      </div>
      <nav>
        <a class="enlace-ajustes" href={HASH_AJUSTES}>{t('ajustes.enlace')}</a>
      </nav>
    </header>

    <main id="espacio-de-trabajo" aria-label={t('inicio.espacio.aria')}>
      {#if herramientas && ruta.pantalla === 'ajustes'}
        <Ajustes tienda={herramientas} />
      {:else if fase === 'bienvenida' && s && herramientas}
        <Bienvenida almacen={s.almacen} tienda={herramientas} alTerminar={() => (fase = 'listo')} />
      {:else if fase === 'listo' && ruta.pantalla === 'papelera'}
        <Papelera />
      {:else if fase === 'listo' && herramientas}
        <Inicio tienda={herramientas} />
      {/if}
    </main>

    <footer class="pie">
      <a href={acerca.REPO_URL} rel="noopener"
        >{t('pie.codigo_fuente_licencia', { licencia: acerca.LICENCIA })}</a
      >
    </footer>
  </div>
{/if}

<style>
  .anuncio {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .cascaron {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    min-height: 100dvh;
  }

  .encabezado {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--ipn-esp-3);
    padding: var(--ipn-esp-5) var(--ipn-esp-4) var(--ipn-esp-3);
  }

  .enlace-ajustes {
    display: inline-flex;
    align-items: center;
    min-height: var(--ipn-objetivo-tactil);
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
