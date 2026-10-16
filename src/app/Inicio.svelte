<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { exportarZip, textoDeError, type Proyecto } from '../almacen';
  import Importar from './inicio/Importar.svelte';
  import {
    cargarCatalogo,
    filtrarPlantillas,
    UNIDADES_PLANTILLAS,
    type Plantilla,
  } from '../plantillas/catalogo';
  import { crearDesdePlantilla } from '../plantillas/crear-desde-plantilla';
  import { AJUSTE_UNIDAD } from './bienvenida/preferencias';
  import { leerDias } from './papelera/purga';
  import { acerca } from '../acerca';
  import { plano } from '../textos/plano';
  import { t } from '../textos/t';
  import type { TiendaHerramientas } from '../herramientas/tienda.svelte';
  import AvisoDescarga from './avisos/AvisoDescarga.svelte';
  import { avisoInicio } from './aviso-inicio.svelte';
  import { crearProyectoDeEjemplo } from './ejemplo/crear-ejemplo';
  import { HASH_PAPELERA, hashDeProyecto } from './ruta';
  import { servicios, type Servicios } from './servicios';

  let { tienda }: { tienda: TiendaHerramientas } = $props();

  let catalogo = $state.raw<Plantilla[]>([]);
  let unidad = $state('otra');
  let todas = $state(false);
  let ocupado = $state(false);
  const plantillas = $derived(filtrarPlantillas(catalogo, unidad, todas));
  let s = $state.raw<Servicios>();
  let activos = $state.raw<Proyecto[]>([]);
  let enPapelera = $state(0);
  let error = $state('');
  let recargaPendiente = false;
  let renombrando = $state<string>();
  let nombreNuevo = $state('');
  let campoNombre = $state<HTMLInputElement>();

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
        unidad = (await x.almacen.leerAjuste<string>(AJUSTE_UNIDAD)) ?? 'otra';
        try {
          catalogo = await cargarCatalogo();
        } catch (e) {
          console.error('Folio: catálogo no disponible', e);
          error = t('plantillas.error_catalogo');
        }
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

  async function ejecutar(accion: () => Promise<void>) {
    if (ocupado) return;
    ocupado = true;
    error = '';
    try {
      await accion();
    } catch (e) {
      console.error('Folio: operación de Inicio fallida', e);
      error = plano(textoDeError(e));
    } finally {
      ocupado = false;
    }
  }

  async function crear(plantilla?: Plantilla) {
    if (!s) return;
    const proyecto = plantilla
      ? await crearDesdePlantilla(s.almacen, plantilla)
      : await s.almacen.crearProyecto({ nombre: t('plantillas.blanco'), principal: 'main.tex' }, [
          {
            ruta: 'main.tex',
            contenido:
              '\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[spanish]{babel}\n\\begin{document}\n\n\\end{document}\n',
          },
        ]);
    location.hash = hashDeProyecto(proyecto.id);
  }

  async function exportar(p: Proyecto) {
    if (!s) return;
    await s.auto.guardarTodo();
    if (s.auto.estado !== 'guardado') throw new Error('guardado_pendiente');
    const bytes = await exportarZip(s.almacen, p.id);
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/zip' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `${p.nombre}.zip`;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function papelera(p: Proyecto) {
    if (!s) return;
    await s.auto.moverAPapelera(p.id);
    const dias = await leerDias(s.almacen, acerca.papelera);
    avisoInicio.mostrar({
      texto: plano(t('proyecto.movido_a_papelera', { nombre: p.nombre, dias })),
      accion: {
        etiqueta: t('archivos.deshacer'),
        ejecutar: async () => {
          await s!.auto.restaurarDePapelera(`proyecto:${p.id}`);
        },
      },
    });
    await recargar();
  }

  async function renombrar(p: Proyecto) {
    if (!nombreNuevo.trim() || !s) return;
    await s.auto.renombrarProyecto(p.id, nombreNuevo.trim());
    renombrando = undefined;
    await recargar();
  }

  async function empezarRenombre(p: Proyecto) {
    renombrando = p.id;
    nombreNuevo = p.nombre;
    await tick();
    campoNombre?.focus();
    campoNombre?.select();
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
  <!-- La región existe desde el inicio, vacía (ver Papelera.svelte). -->
  <div role="status">
    {#if avisoInicio.actual}
      {@const aviso = avisoInicio.actual}
      <div class="aviso">
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
  </div>

  <AvisoDescarga {tienda} />

  <section class="seccion proyectos" aria-labelledby="titulo-proyectos">
    <div class="cabecera">
      <h2 id="titulo-proyectos">{t('inicio.proyectos')}</h2>
      <a class="enlace" href={HASH_PAPELERA}>{t('papelera.enlace', { n: enPapelera })}</a>
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if s && activos.length === 0}
      <p class="vacio">{t('inicio.sin_proyectos')}</p>
    {/if}
    {#if activos.length > 0}
      <ul class="lista">
        {#each activos as p (p.id)}
          <li>
            {#if renombrando === p.id}
              <form
                onsubmit={(e) => {
                  e.preventDefault();
                  void ejecutar(() => renombrar(p));
                }}
              >
                <input
                  bind:this={campoNombre}
                  bind:value={nombreNuevo}
                  aria-label={plano(t('plantillas.renombrar_pregunta', { nombre: p.nombre }))}
                  required
                  onkeydown={(e) => {
                    if (e.key === 'Escape') {
                      renombrando = undefined;
                      void tick().then(() => document.getElementById(`renombrar-${p.id}`)?.focus());
                    }
                  }}
                />
                <button class="boton" disabled={ocupado}>{t('archivos.renombrar')}</button>
              </form>
            {:else}
              <a class="proyecto" href={hashDeProyecto(p.id)}>{p.nombre}</a>
            {/if}
            <time datetime={new Date(p.modificado).toISOString()}
              >{new Date(p.modificado).toLocaleString('es-MX')}</time
            >
            <div class="acciones">
              <button
                id="renombrar-{p.id}"
                class="boton"
                disabled={ocupado}
                onclick={() => void empezarRenombre(p)}>{t('archivos.renombrar')}</button
              >
              <button class="boton" disabled={ocupado} onclick={() => void ejecutar(() => exportar(p))}
                >{t('plantillas.exportar')}</button
              >
              <button class="boton" disabled={ocupado} onclick={() => void ejecutar(() => papelera(p))}
                >{t('plantillas.papelera')}</button
              >
            </div>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="acciones">
      <button
        class="boton boton-primario"
        disabled={!s || ocupado}
        onclick={() => void ejecutar(() => crear())}>{t('plantillas.crear')}</button
      >
    </div>
  </section>
  <section class="seccion" aria-labelledby="titulo-importar">
    <h2 id="titulo-importar">{t('inicio.importar')}</h2>
    {#if s}<Importar
        servicios={s}
        alError={(e) => (error = plano(textoDeError(e)))}
        alAviso={(texto) => avisoInicio.mostrar({ texto })}
      />{/if}
  </section>
  <section class="seccion" aria-labelledby="titulo-plantillas">
    <h2 id="titulo-plantillas">{t('inicio.plantillas')}</h2>
    <div class="filtros">
      <div class="campo-unidad">
        <label for="unidad-plantillas">{t('plantillas.unidad')}</label>
        <select
          id="unidad-plantillas"
          bind:value={unidad}
          onchange={() => {
            todas = false;
          }}
        >
          {#each UNIDADES_PLANTILLAS as u (u.id)}<option value={u.id}>{u.siglas}</option>{/each}
          <option value="otra">{t('bienvenida.unidad.otra')}</option>
        </select>
      </div>
      <button class="boton boton-texto enlace" aria-pressed={todas} onclick={() => (todas = !todas)}
        >{todas ? t('plantillas.ver_unidad') : t('plantillas.ver_todas')}</button
      >
    </div>
    <div class="tarjetas">
      <article>
        <h3>{t('inicio.crear_ejemplo')}</h3>
        <p>{t('inicio.ejemplo.descripcion')}</p>
        <button
          class="boton"
          aria-label={t('plantillas.usar', { nombre: t('inicio.crear_ejemplo') })}
          disabled={!s || ocupado}
          onclick={() => void ejecutar(crearEjemplo)}>{t('plantillas.usar_boton')}</button
        >
      </article>
      {#each plantillas as plantilla (plantilla.id)}
        <article>
          <h3>{plantilla.nombre}</h3>
          <p>{plantilla.descripcion}</p>
          <button
            class="boton"
            aria-label={t('plantillas.usar', { nombre: plantilla.nombre })}
            disabled={!s || ocupado}
            onclick={() => void ejecutar(() => crear(plantilla))}>{t('plantillas.usar_boton')}</button
          >
        </article>
      {/each}
    </div>
    {#if !plantillas.some((p) => p.unidad === unidad)}
      <details>
        <summary>{t('plantillas.proponer')}</summary>
        <p>{t('plantillas.proponer_ayuda')}</p>
      </details>
    {/if}
  </section>
</section>

<style>
  .tarjetas {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--ipn-ancho-tarjeta)), 1fr));
    gap: var(--ipn-esp-4);
    margin-block: var(--ipn-esp-5);
  }
  article {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ipn-esp-3);
    padding: var(--ipn-esp-5);
    border: var(--ipn-borde-fino) solid var(--ipn-linea);
    border-radius: var(--ipn-radio);
    background: var(--ipn-superficie);
  }
  article h3,
  article p {
    margin: 0;
  }
  article h3 {
    font-size: var(--ipn-tamano-m);
  }
  article p,
  time {
    font-size: var(--ipn-tamano-s);
  }
  article p {
    color: var(--ipn-tenue);
  }
  article .boton {
    margin-top: auto;
    font-size: var(--ipn-tamano-s);
  }
  .seccion {
    margin-bottom: var(--ipn-esp-7);
  }
  .cabecera,
  .filtros {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ipn-esp-3) var(--ipn-esp-5);
  }
  .cabecera {
    justify-content: space-between;
    margin-bottom: var(--ipn-esp-4);
  }
  .cabecera h2 {
    margin: 0;
  }
  .campo-unidad {
    display: grid;
    gap: var(--ipn-esp-2);
    max-width: 100%;
  }
  label {
    font-size: var(--ipn-tamano-s);
    color: var(--ipn-tenue);
  }
  .enlace,
  summary {
    display: inline-flex;
    align-items: center;
    min-height: var(--ipn-objetivo-tactil);
  }
  .enlace,
  .boton.enlace,
  summary {
    color: var(--ipn-acento);
    text-decoration: underline;
    text-underline-offset: var(--ipn-foco-separacion);
    font-size: var(--ipn-tamano-s);
  }
  details {
    color: var(--ipn-tenue);
    font-size: var(--ipn-tamano-s);
  }
  summary {
    cursor: pointer;
  }
  summary:focus-visible {
    outline: var(--ipn-foco-ancho) solid var(--ipn-acento);
    outline-offset: var(--ipn-foco-separacion);
  }
  form {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ipn-esp-2);
  }
  input {
    min-width: 0;
    max-width: 100%;
    min-height: var(--ipn-objetivo-tactil);
    font: inherit;
  }
  select {
    min-height: var(--ipn-objetivo-tactil);
    max-width: 100%;
    font: inherit;
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    padding-inline: var(--ipn-esp-3);
    border: var(--ipn-borde-fino) solid var(--ipn-borde-control);
    border-radius: var(--ipn-radio-s);
  }
  time {
    display: block;
    color: var(--ipn-tenue);
  }
  li {
    margin-bottom: var(--ipn-esp-3);
    overflow-wrap: anywhere;
  }
  .inicio {
    padding: var(--ipn-esp-5) var(--ipn-esp-4);
    max-width: var(--ipn-ancho-inicio);
    margin-inline: auto;
  }

  h2 {
    margin: 0 0 var(--ipn-esp-3);
    font-size: var(--ipn-tamano-l);
  }
  .proyectos h2 {
    font-size: var(--ipn-tamano-xl);
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
    border: var(--ipn-borde-fino) solid var(--ipn-info);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-info-suave);
  }

  .aviso .texto {
    flex: 1 1 var(--ipn-ancho-tarjeta);
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
    padding: 0;
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
    border: var(--ipn-borde-fino) solid var(--ipn-borde-control);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    font: inherit;
    text-decoration: none;
    cursor: pointer;
  }
  .boton {
    max-width: 100%;
    padding-block: var(--ipn-esp-2);
    text-align: center;
  }
  .boton-primario {
    background: var(--ipn-acento);
    color: var(--ipn-sobre-acento);
    border-color: var(--ipn-acento);
  }
  .boton-primario:hover:not(:disabled) {
    background: var(--ipn-acento-fuerte);
  }
  .boton-texto {
    background: transparent;
    border-color: transparent;
    padding-inline: var(--ipn-esp-2);
  }

  .cerrar {
    min-width: var(--ipn-objetivo-tactil);
    padding: 0;
    border-color: transparent;
    background: none;
    font-size: var(--ipn-tamano-l);
    line-height: 1;
  }

  .boton:hover:not(:disabled):not(.boton-primario) {
    background: var(--ipn-acento-suave);
  }

  .proyecto:focus-visible,
  .boton:focus-visible,
  .cerrar:focus-visible {
    outline: var(--ipn-foco-ancho) solid var(--ipn-acento);
    outline-offset: var(--ipn-foco-separacion);
  }
</style>
