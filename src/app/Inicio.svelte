<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { textoDeError, type Proyecto } from '../almacen';
  import { plano } from '../textos/plano';
  import { t } from '../textos/t';
  import type { TiendaHerramientas } from '../herramientas/tienda.svelte';
  import AvisoDescarga from './avisos/AvisoDescarga.svelte';
  import { crearProyectoDeEjemplo } from './ejemplo/crear-ejemplo';
  import { hashDeProyecto } from './ruta';
  import { servicios, type Servicios } from './servicios';

  let { tienda }: { tienda: TiendaHerramientas } = $props();

  // Inicio mínimo: lista de proyectos y uno de ejemplo ficticio. El inicio real (plantillas, importar) es de la sesión 09.
  let s = $state.raw<Servicios>();
  let activos = $state.raw<Proyecto[]>([]);
  let papelera = $state.raw<Proyecto[]>([]);
  let error = $state('');

  async function recargar() {
    if (!s) return;
    activos = await s.almacen.listarProyectos('activos');
    papelera = await s.almacen.listarProyectos('papelera');
  }

  onMount(() => {
    void servicios()
      .then(async (x) => {
        s = x;
        await recargar();
      })
      .catch((e: unknown) => (error = plano(textoDeError(e))));
  });

  async function crearEjemplo() {
    if (!s) return;
    try {
      const proyecto = await crearProyectoDeEjemplo(s.almacen);
      location.hash = hashDeProyecto(proyecto.id);
    } catch (e) {
      error = plano(textoDeError(e));
    }
  }

  async function restaurar(id: string) {
    if (!s) return;
    await s.almacen.restaurar(id);
    await recargar();
  }
</script>

<section class="inicio" aria-labelledby="titulo-proyectos">
  <AvisoDescarga {tienda} />
  <h2 id="titulo-proyectos">{t('inicio.proyectos')}</h2>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if s && activos.length === 0}
    <p class="vacio">{t('inicio.sin_proyectos')}</p>
  {/if}
  {#if activos.length > 0}
    <ul class="lista">
      {#each activos as p (p.id)}
        <li><a class="proyecto" href={hashDeProyecto(p.id)}>{p.nombre}</a></li>
      {/each}
    </ul>
  {/if}
  <button type="button" class="boton" disabled={!s} onclick={() => void crearEjemplo()}
    >{t('inicio.crear_ejemplo')}</button
  >

  {#if papelera.length > 0}
    <h2 class="subtitulo">{t('inicio.papelera')}</h2>
    <ul class="lista">
      {#each papelera as p (p.id)}
        <li class="en-papelera">
          <span>{p.nombre}</span>
          <button type="button" class="boton" onclick={() => void restaurar(p.id)}
            >{t('inicio.restaurar')}</button
          >
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .inicio {
    padding: var(--ipn-esp-4);
    max-width: 48rem;
  }

  h2 {
    margin: 0 0 var(--ipn-esp-3);
    font-size: var(--ipn-tamano-l);
  }

  .subtitulo {
    margin-top: var(--ipn-esp-6);
  }

  .vacio {
    color: var(--ipn-tenue);
  }

  .error {
    padding: var(--ipn-esp-2) var(--ipn-esp-3);
    background: var(--ipn-error-suave);
    color: var(--ipn-error);
    border-radius: var(--ipn-radio-s);
  }

  .lista {
    display: grid;
    gap: var(--ipn-esp-2);
    margin: 0 0 var(--ipn-esp-4);
    padding: 0;
    list-style: none;
  }

  .proyecto {
    display: flex;
    align-items: center;
    min-height: var(--ipn-objetivo-tactil);
    padding: 0 var(--ipn-esp-3);
    border: 1px solid var(--ipn-linea);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    text-decoration: none;
  }

  .proyecto:hover {
    background: var(--ipn-acento-suave);
  }

  .en-papelera {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ipn-esp-3);
    min-height: var(--ipn-objetivo-tactil);
    padding: 0 var(--ipn-esp-3);
    color: var(--ipn-tenue);
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

  .boton:hover:not(:disabled) {
    background: var(--ipn-acento-suave);
  }

  .proyecto:focus-visible,
  .boton:focus-visible {
    outline: 0.1875rem solid var(--ipn-acento);
    outline-offset: 0.125rem;
  }
</style>
