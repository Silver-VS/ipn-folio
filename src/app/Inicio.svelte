<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from 'svelte';
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
    const nombre = window.prompt(plano(t('plantillas.renombrar_pregunta', { nombre: p.nombre })), p.nombre);
    if (!nombre?.trim() || !s) return;
    await s.almacen.renombrarProyecto(p.id, nombre.trim());
    await recargar();
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
  <AvisoDescarga {tienda} />
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

  <h2 id="titulo-proyectos">{t('inicio.proyectos')}</h2>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if s && activos.length === 0}
    <p class="vacio">{t('inicio.sin_proyectos')}</p>
  {/if}
  {#if activos.length > 0}
    <ul class="lista">
      {#each activos as p (p.id)}
        <li>
          <a class="proyecto" href={hashDeProyecto(p.id)}>{p.nombre}</a>
          <time datetime={new Date(p.modificado).toISOString()}
            >{new Date(p.modificado).toLocaleString('es-MX')}</time
          >
          <div class="acciones">
            <button class="boton" disabled={ocupado} onclick={() => void ejecutar(() => renombrar(p))}
              >{t('archivos.renombrar')}</button
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
    <button type="button" class="boton" disabled={!s} onclick={() => void crearEjemplo()}
      >{t('inicio.crear_ejemplo')}</button
    >
    <a class="boton enlace" href={HASH_PAPELERA}>{t('papelera.enlace', { n: enPapelera })}</a>
  </div>
  <h2>{t('plantillas.crear')}</h2>
  <button class="boton" disabled={!s || ocupado} onclick={() => void ejecutar(() => crear())}
    >{t('plantillas.blanco')}</button
  >
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
  <button class="boton" onclick={() => (todas = !todas)}
    >{todas ? t('plantillas.ver_unidad') : t('plantillas.ver_todas')}</button
  >
  <div class="tarjetas">
    {#each plantillas as plantilla (plantilla.id)}
      <article>
        <h3>{plantilla.nombre}</h3>
        <p>{plantilla.descripcion}</p>
        <small>{plantilla.licencia}</small>
        <button class="boton" disabled={!s || ocupado} onclick={() => void ejecutar(() => crear(plantilla))}
          >{t('plantillas.usar', { nombre: plantilla.nombre })}</button
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
  {#if s}<Importar
      servicios={s}
      alError={(e) => (error = plano(textoDeError(e)))}
      alAviso={(texto) => avisoInicio.mostrar({ texto })}
    />{/if}
</section>

<style>
  .tarjetas {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
    gap: var(--ipn-esp-3);
    margin-block: var(--ipn-esp-4);
  }
  article {
    padding: var(--ipn-esp-3);
    border: 1px solid var(--ipn-linea);
    border-radius: var(--ipn-radio);
    background: var(--ipn-superficie);
  }
  select {
    min-height: var(--ipn-objetivo-tactil);
    max-width: 100%;
    font: inherit;
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
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
