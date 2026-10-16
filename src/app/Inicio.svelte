<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { textoDeError, type Proyecto } from '../almacen';
  import { plano } from '../textos/plano';
  import { t } from '../textos/t';
  import { avisoInicio } from './aviso-inicio.svelte';
  import { crearProyectoDeEjemplo } from './ejemplo/crear-ejemplo';
  import { HASH_PAPELERA, hashDeProyecto } from './ruta';
  import { servicios, type Servicios } from './servicios';

  // Inicio mínimo: lista de proyectos, uno de ejemplo ficticio y el enlace a la papelera. El inicio real (plantillas,
  // importar) es de la sesión 09.
  let s = $state.raw<Servicios>();
  let activos = $state.raw<Proyecto[]>([]);
  let enPapelera = $state(0);
  let error = $state('');
  let recargaPendiente = false;

  async function recargar() {
    if (!s) return;
    try {
      [activos, enPapelera] = await Promise.all([
        s.almacen.listarProyectos('activos'),
        s.almacen.listarPapelera().then((lista) => lista.length),
      ]);
    } catch (e) {
      error = plano(textoDeError(e));
    }
  }

  function pedirRecarga() {
    if (recargaPendiente) return;
    recargaPendiente = true;
    queueMicrotask(() => {
      recargaPendiente = false;
      void recargar();
    });
  }

  onMount(() => {
    let vivo = true;
    const quitar: Array<() => void> = [];
    void servicios()
      .then(async (x) => {
        if (!vivo) return;
        s = x;
        quitar.push(
          // La purga, otra pestaña o «Deshacer» cambian lo que hay: la lista y el contador se actualizan.
          x.almacen.al('cambio-papelera', pedirRecarga),
          x.avisos.escuchar((a) => {
            if (a.tipo !== 'cambio-archivo') pedirRecarga();
          }),
        );
        await recargar();
      })
      .catch((e: unknown) => (error = plano(textoDeError(e))));
    return () => {
      vivo = false;
      quitar.forEach((q) => q());
    };
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

  async function ejecutarAviso() {
    const accion = avisoInicio.actual?.accion;
    avisoInicio.quitar();
    try {
      await accion?.ejecutar();
      await recargar();
    } catch (e) {
      error = plano(textoDeError(e));
    }
  }
</script>

<section class="inicio" aria-labelledby="titulo-proyectos">
  {#if avisoInicio.actual}
    {@const aviso = avisoInicio.actual}
    <div class="aviso" role="status">
      <p class="texto">{aviso.texto}</p>
      {#if aviso.accion}
        <button type="button" class="boton" onclick={() => void ejecutarAviso()}
          >{aviso.accion.etiqueta}</button
        >
      {/if}
      <button
        type="button"
        class="cerrar"
        aria-label={t('aviso.cerrar.boton')}
        onclick={() => avisoInicio.quitar()}>&times;</button
      >
    </div>
  {/if}

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
  <div class="acciones">
    <button type="button" class="boton" disabled={!s} onclick={() => void crearEjemplo()}
      >{t('inicio.crear_ejemplo')}</button
    >
    <a class="boton enlace" href={HASH_PAPELERA}>{t('papelera.enlace', { n: enPapelera })}</a>
  </div>
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

  .vacio {
    color: var(--ipn-tenue);
  }

  .error {
    padding: var(--ipn-esp-2) var(--ipn-esp-3);
    background: var(--ipn-error-suave);
    color: var(--ipn-error);
    border-radius: var(--ipn-radio-s);
  }

  .aviso {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ipn-esp-2);
    margin-bottom: var(--ipn-esp-4);
    padding: var(--ipn-esp-1) var(--ipn-esp-1) var(--ipn-esp-1) var(--ipn-esp-3);
    border: 1px solid var(--ipn-info);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-info-suave);
  }

  .aviso .texto {
    flex: 1 1 14rem;
    margin: 0;
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

  .acciones {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ipn-esp-3);
  }

  .boton,
  .cerrar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--ipn-objetivo-tactil);
    padding: 0 var(--ipn-esp-4);
    border: 1px solid var(--ipn-borde-control);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    font: inherit;
    text-decoration: none;
    cursor: pointer;
  }

  .cerrar {
    min-width: var(--ipn-objetivo-tactil);
    padding: 0;
    border-color: transparent;
    background: none;
    font-size: var(--ipn-tamano-l);
    line-height: 1;
  }

  .boton:hover:not(:disabled) {
    background: var(--ipn-acento-suave);
  }

  .proyecto:focus-visible,
  .boton:focus-visible,
  .cerrar:focus-visible {
    outline: 0.1875rem solid var(--ipn-acento);
    outline-offset: 0.125rem;
  }
</style>
