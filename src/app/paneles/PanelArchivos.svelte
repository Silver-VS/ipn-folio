<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { plano } from '../../textos/plano';
  import { t } from '../../textos/t';
  import { nombreDe } from '../papelera/restauracion';
  import { HASH_PAPELERA } from '../ruta';
  import {
    aplanarVisibles,
    carpetasDe,
    construirArbol,
    esImagen,
    unirRuta,
    type NodoArbol,
  } from '../proyecto/arbol';
  import type { EstadoProyecto } from '../proyecto/estado.svelte';

  let { estado }: { estado: EstadoProyecto } = $props();

  let expandidas = $state.raw<Set<string>>(new Set());
  let seleccion = $state<string | undefined>();
  let renombrando = $state<string | undefined>();
  let valorRenombre = $state('');
  let creando = $state(false);
  let valorNuevo = $state('');
  let arrastrando = $state(false);
  let selector = $state<HTMLInputElement>();
  let lista = $state<HTMLElement>();
  let papeleraAbierta = $state(false);

  const arbol = $derived(construirArbol(estado.archivos));
  const visibles = $derived(aplanarVisibles(arbol, expandidas));
  const nodoSeleccionado = $derived(visibles.find((n) => n.ruta === seleccion));
  const foco = $derived(nodoSeleccionado?.ruta ?? visibles[0]?.ruta);

  // Al abrir un archivo desde otra parte, su carpeta se expande y la fila queda marcada.
  $effect(() => {
    const ruta = estado.activo;
    if (!ruta) return;
    const faltan = carpetasDe(ruta).filter((c) => !expandidas.has(c));
    if (faltan.length) expandidas = new Set([...expandidas, ...faltan]);
  });

  // Tras «Deshacer» o «Restaurar», el foco vuelve a la fila restaurada (su carpeta se expande si hace falta).
  $effect(() => {
    const pedido = estado.enfocarArbol;
    if (!pedido) return;
    const faltan = untrack(() => carpetasDe(pedido.ruta).filter((c) => !expandidas.has(c)));
    if (faltan.length) expandidas = new Set([...untrack(() => expandidas), ...faltan]);
    void enfocar(pedido.ruta);
  });

  function carpetaDestino(): string {
    const n = nodoSeleccionado;
    if (!n) return '';
    if (n.tipo === 'carpeta') return n.ruta;
    return carpetasDe(n.ruta).at(-1) ?? '';
  }

  function alternarCarpeta(ruta: string) {
    const nuevas = new Set(expandidas);
    if (nuevas.has(ruta)) nuevas.delete(ruta);
    else nuevas.add(ruta);
    expandidas = nuevas;
  }

  function activar(n: NodoArbol) {
    seleccion = n.ruta;
    if (n.tipo === 'carpeta') alternarCarpeta(n.ruta);
    else estado.abrirArchivo(n.ruta);
  }

  async function enfocar(ruta: string | undefined) {
    if (!ruta) return;
    seleccion = ruta;
    await tick();
    lista?.querySelector<HTMLElement>(`[data-ruta="${CSS.escape(ruta)}"]`)?.focus();
  }

  async function borrar(n: NodoArbol) {
    // Sin confirmación: mandar a la papelera se puede deshacer (D29).
    const i = visibles.findIndex((fila) => fila.ruta === n.ruta);
    await estado.borrarArchivo(n.ruta);
    await tick();
    await enfocar(visibles[Math.min(i, visibles.length - 1)]?.ruta);
  }

  function teclas(e: KeyboardEvent, n: NodoArbol, i: number) {
    if (renombrando) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        void enfocar(visibles[i + 1]?.ruta);
        break;
      case 'ArrowUp':
        e.preventDefault();
        void enfocar(visibles[i - 1]?.ruta);
        break;
      case 'Home':
        e.preventDefault();
        void enfocar(visibles[0]?.ruta);
        break;
      case 'End':
        e.preventDefault();
        void enfocar(visibles.at(-1)?.ruta);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (n.tipo === 'carpeta') {
          if (!expandidas.has(n.ruta)) alternarCarpeta(n.ruta);
          else void enfocar(n.hijos[0]?.ruta);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (n.tipo === 'carpeta' && expandidas.has(n.ruta)) alternarCarpeta(n.ruta);
        else void enfocar(carpetasDe(n.ruta).at(-1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        activar(n);
        break;
      case 'F2':
        e.preventDefault();
        empezarRenombre(n);
        break;
      case 'Delete':
        e.preventDefault();
        void borrar(n);
        break;
    }
  }

  async function empezarRenombre(n: NodoArbol | undefined) {
    if (!n) return;
    renombrando = n.ruta;
    valorRenombre = n.nombre;
    await tick();
    const campo = lista?.querySelector<HTMLInputElement>('input.renombre');
    campo?.focus();
    campo?.select();
  }

  async function confirmarRenombre(n: NodoArbol) {
    const nombre = valorRenombre.trim();
    renombrando = undefined;
    if (!nombre || nombre === n.nombre) {
      void enfocar(n.ruta);
      return;
    }
    const carpeta = carpetasDe(n.ruta).at(-1) ?? '';
    const nueva = unirRuta(carpeta, nombre);
    if (await estado.renombrarArchivo(n.ruta, nueva)) void enfocar(nueva);
  }

  function teclasRenombre(e: KeyboardEvent, n: NodoArbol) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void confirmarRenombre(n);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      renombrando = undefined;
      void enfocar(n.ruta);
    }
    e.stopPropagation();
  }

  async function empezarNuevo() {
    const carpeta = carpetaDestino();
    valorNuevo = carpeta ? `${carpeta}/` : '';
    creando = true;
    await tick();
    const campo = lista?.parentElement?.querySelector<HTMLInputElement>('input.nuevo');
    campo?.focus();
  }

  async function confirmarNuevo() {
    const ruta = valorNuevo.trim();
    if (!ruta) {
      creando = false;
      return;
    }
    if (await estado.crearArchivo(ruta)) creando = false;
  }

  function teclasNuevo(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void confirmarNuevo();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      creando = false;
    }
  }

  async function subirDeSelector(e: Event) {
    const entrada = e.currentTarget as HTMLInputElement;
    const archivos = [...(entrada.files ?? [])];
    entrada.value = '';
    await estado.subirArchivos(archivos, carpetaDestino());
  }

  const llevaArchivos = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');

  function alArrastrar(e: DragEvent) {
    if (!llevaArchivos(e)) return;
    e.preventDefault();
    arrastrando = true;
  }

  async function alSoltar(e: DragEvent) {
    if (!llevaArchivos(e)) return;
    e.preventDefault();
    arrastrando = false;
    await estado.subirArchivos([...(e.dataTransfer?.files ?? [])], carpetaDestino());
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<section
  class="archivos"
  class:arrastrando
  aria-label={t('archivos.aria')}
  ondragover={alArrastrar}
  ondragleave={() => (arrastrando = false)}
  ondrop={alSoltar}
>
  <div class="barra" role="toolbar" aria-label={t('archivos.barra_aria')}>
    <button type="button" class="boton" onclick={() => void empezarNuevo()}>{t('archivos.nuevo')}</button>
    <button type="button" class="boton" onclick={() => selector?.click()}>{t('archivos.subir')}</button>
    <input
      bind:this={selector}
      class="oculto"
      type="file"
      multiple
      tabindex="-1"
      aria-hidden="true"
      onchange={subirDeSelector}
    />
    <button type="button" class="boton" disabled={!nodoSeleccionado} onclick={() => void empezarRenombre(nodoSeleccionado)}
      >{t('archivos.renombrar')}</button
    >
    <button
      type="button"
      class="boton"
      disabled={!nodoSeleccionado}
      onclick={() => nodoSeleccionado && void borrar(nodoSeleccionado)}>{t('archivos.borrar')}</button
    >
  </div>

  {#if creando}
    <div class="fila-nueva">
      <label class="etiqueta-campo" for="nuevo-archivo-{estado.id}">{t('archivos.nuevo_etiqueta')}</label>
      <input
        id="nuevo-archivo-{estado.id}"
        class="campo nuevo"
        type="text"
        autocomplete="off"
        spellcheck="false"
        bind:value={valorNuevo}
        onkeydown={teclasNuevo}
      />
      <p class="ayuda">{t('archivos.nuevo_ayuda')}</p>
    </div>
  {/if}

  {#if visibles.length === 0}
    <p class="vacio">{t('archivos.vacio')}</p>
  {:else}
    <ul class="arbol" role="tree" aria-label={t('archivos.arbol_aria')} bind:this={lista}>
      {#each visibles as n, i (n.ruta)}
        <li
          role="treeitem"
          class="fila"
          class:activo={n.ruta === estado.activo}
          class:seleccionado={n.ruta === seleccion}
          aria-level={n.nivel + 1}
          aria-selected={n.ruta === seleccion}
          aria-expanded={n.tipo === 'carpeta' ? expandidas.has(n.ruta) : undefined}
          tabindex={n.ruta === foco ? 0 : -1}
          data-ruta={n.ruta}
          style:padding-inline-start="calc(var(--ipn-esp-2) + {n.nivel} * var(--ipn-esp-4))"
          onkeydown={(e) => teclas(e, n, i)}
          onfocus={() => (seleccion = n.ruta)}
        >
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span class="contenido" onclick={() => activar(n)}>
            <svg class="icono" viewBox="0 0 16 16" aria-hidden="true">
              {#if n.tipo === 'carpeta'}
                <path
                  d="M1.5 3.5h4.2l1.4 1.5h7.4v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"
                  fill={expandidas.has(n.ruta) ? 'currentColor' : 'none'}
                  stroke="currentColor"
                />
              {:else if esImagen(n.ruta)}
                <rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="none" stroke="currentColor" />
                <path d="M2 12l4-4 3 3 2-2 3 3" fill="none" stroke="currentColor" />
              {:else}
                <path d="M3.5 1.5h6l3 3v10h-9z" fill="none" stroke="currentColor" />
                <path d="M9.5 1.5v3h3" fill="none" stroke="currentColor" />
              {/if}
            </svg>
            {#if renombrando === n.ruta}
              <input
                class="campo renombre"
                type="text"
                aria-label={plano(t('archivos.renombrar_aria', { nombre: n.nombre }))}
                autocomplete="off"
                spellcheck="false"
                bind:value={valorRenombre}
                onkeydown={(e) => teclasRenombre(e, n)}
                onblur={() => (renombrando = undefined)}
                onclick={(e) => e.stopPropagation()}
              />
            {:else}
              <span class="nombre">{n.nombre}</span>
              {#if n.ruta === estado.proyecto.principal}
                <span class="insignia">{t('archivos.principal')}</span>
              {/if}
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="papelera">
    <div class="papelera-barra">
      <button
        type="button"
        class="boton despliegue"
        aria-expanded={papeleraAbierta}
        aria-controls="papelera-proyecto-{estado.id}"
        onclick={() => (papeleraAbierta = !papeleraAbierta)}
        >{t('papelera.del_proyecto', { n: estado.papelera.length })}</button
      >
      <a class="boton" href={HASH_PAPELERA}>{t('papelera.ver.boton')}</a>
    </div>
    {#if papeleraAbierta}
      <div id="papelera-proyecto-{estado.id}" class="papelera-lista">
        {#if estado.papelera.length === 0}
          <p class="vacio">{t('papelera.del_proyecto_vacia')}</p>
        {:else}
          <ul>
            {#each estado.papelera as e (e.id)}
              {@const nombre = nombreDe(e)}
              <li class="papelera-fila">
                <span class="nombre">{nombre}</span>
                <button
                  type="button"
                  class="boton"
                  aria-label={plano(t('papelera.restaurar.aria', { nombre }))}
                  onclick={() => void estado.restaurarDePapelera(e)}>{t('papelera.restaurar.boton')}</button
                >
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
  {#if arrastrando}
    <div class="soltar" aria-hidden="true">{t('archivos.soltar')}</div>
  {/if}
</section>

<style>
  .archivos {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    font-size: var(--ipn-tamano-s);
  }

  .barra {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ipn-esp-1);
    padding: var(--ipn-esp-2);
    border-bottom: 1px solid var(--ipn-linea);
  }

  .boton {
    min-height: var(--ipn-objetivo-tactil);
    padding: 0 var(--ipn-esp-3);
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

  .boton:disabled {
    color: var(--ipn-tenue);
    cursor: default;
  }

  .oculto {
    display: none;
  }

  .boton:focus-visible,
  .campo:focus-visible,
  .fila:focus-visible {
    outline: 0.1875rem solid var(--ipn-acento);
    outline-offset: -0.1875rem;
  }

  .fila-nueva {
    padding: var(--ipn-esp-2);
    border-bottom: 1px solid var(--ipn-linea);
  }

  .etiqueta-campo {
    display: block;
    margin-bottom: var(--ipn-esp-1);
    color: var(--ipn-tenue);
  }

  .campo {
    width: 100%;
    min-height: var(--ipn-objetivo-tactil);
    padding: 0 var(--ipn-esp-2);
    border: 1px solid var(--ipn-borde-control);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    font: inherit;
  }

  .ayuda {
    margin: var(--ipn-esp-1) 0 0;
    color: var(--ipn-tenue);
    font-size: var(--ipn-tamano-xs);
  }

  .vacio {
    margin: 0;
    padding: var(--ipn-esp-4);
    color: var(--ipn-tenue);
  }

  .arbol {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: var(--ipn-esp-1) 0;
    list-style: none;
    overflow: auto;
  }

  .fila {
    display: block;
    cursor: pointer;
  }

  .contenido {
    display: flex;
    align-items: center;
    gap: var(--ipn-esp-2);
    min-height: var(--ipn-objetivo-tactil);
    padding-inline-end: var(--ipn-esp-2);
  }

  .fila:hover {
    background: var(--ipn-hundido);
  }

  .fila.seleccionado {
    background: var(--ipn-acento-suave);
  }

  .fila.activo .nombre {
    font-weight: 700;
  }

  .icono {
    flex: none;
    width: 1rem;
    height: 1rem;
    color: var(--ipn-tenue);
  }

  .nombre {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .insignia {
    margin-inline-start: auto;
    padding: 0 var(--ipn-esp-2);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-hundido);
    color: var(--ipn-tenue);
    font-size: var(--ipn-tamano-xs);
  }

  .renombre {
    min-height: calc(var(--ipn-objetivo-tactil) - var(--ipn-esp-2));
  }

  .papelera {
    flex: none;
    border-top: 1px solid var(--ipn-linea);
  }

  .papelera-barra {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ipn-esp-1);
    padding: var(--ipn-esp-2);
  }

  .boton.despliegue {
    flex: 1 1 auto;
    text-align: start;
  }

  a.boton {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }

  .papelera-lista {
    max-height: 40%;
    overflow: auto;
  }

  .papelera-lista ul {
    margin: 0;
    padding: 0 var(--ipn-esp-2) var(--ipn-esp-2);
    list-style: none;
  }

  .papelera-fila {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ipn-esp-2);
    min-height: var(--ipn-objetivo-tactil);
  }

  .arrastrando {
    outline: 0.1875rem dashed var(--ipn-acento);
    outline-offset: -0.1875rem;
  }

  .soltar {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: var(--ipn-esp-4);
    background: var(--ipn-acento-suave);
    color: var(--ipn-texto);
    text-align: center;
    pointer-events: none;
  }
</style>
