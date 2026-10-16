<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script module lang="ts">
  export interface ElementoMenu {
    id: string;
    etiqueta: string;
    /** Marca el elemento como activo (casilla o distribución actual). */
    marcado?: boolean;
    /** Si es una casilla se anuncia como `menuitemcheckbox`. */
    casilla?: boolean;
    /** Línea de separación antes de este elemento. */
    separadorAntes?: boolean;
    /** Miniatura de 3×3 celdas (ver distribuciones.ts). */
    miniatura?: string[];
    accion: () => void;
  }
</script>

<script lang="ts">
  import { tick } from 'svelte';

  let { etiqueta, elementos, alAbrir }: { etiqueta: string; elementos: ElementoMenu[]; alAbrir?: () => void } = $props();

  let abierto = $state(false);
  let boton = $state<HTMLButtonElement>();
  let menu = $state<HTMLElement>();

  const items = () => [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];

  async function abrir(enfocarUltimo = false) {
    alAbrir?.();
    abierto = true;
    await tick();
    const todos = items();
    (enfocarUltimo ? todos.at(-1) : todos[0])?.focus();
  }

  function cerrar(devolverFoco = true) {
    abierto = false;
    if (devolverFoco) boton?.focus();
  }

  function alTeclaBoton(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      void abrir();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      void abrir(true);
    }
  }

  function alTeclaMenu(e: KeyboardEvent) {
    const todos = items();
    const i = todos.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      todos[(i + 1) % todos.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      todos[(i - 1 + todos.length) % todos.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      todos[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      todos.at(-1)?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cerrar();
    } else if (e.key === 'Tab') {
      cerrar(false);
    }
  }

  function elegir(item: ElementoMenu) {
    cerrar();
    item.accion();
  }

  // Un clic fuera cierra el menú.
  $effect(() => {
    if (!abierto) return;
    const fuera = (e: Event) => {
      const destino = e.target as Node;
      if (!menu?.contains(destino) && !boton?.contains(destino)) cerrar(false);
    };
    document.addEventListener('pointerdown', fuera, true);
    return () => document.removeEventListener('pointerdown', fuera, true);
  });
</script>

<div class="menu-contenedor">
  <button
    type="button"
    class="boton-menu"
    bind:this={boton}
    aria-haspopup="menu"
    aria-expanded={abierto}
    onclick={() => (abierto ? cerrar(false) : void abrir())}
    onkeydown={alTeclaBoton}
  >
    {etiqueta}
    <span class="flecha" aria-hidden="true">&#9662;</span>
  </button>

  {#if abierto}
    <div class="menu" role="menu" aria-label={etiqueta} tabindex="-1" bind:this={menu} onkeydown={alTeclaMenu}>
      {#each elementos as item (item.id)}
        {#if item.separadorAntes}<div class="separador" role="separator"></div>{/if}
        <button
          type="button"
          class="item"
          role={item.casilla ? 'menuitemcheckbox' : 'menuitem'}
          aria-checked={item.casilla || item.marcado !== undefined ? !!item.marcado : undefined}
          tabindex="-1"
          onclick={() => elegir(item)}
        >
          {#if item.miniatura}
            <span class="mini" aria-hidden="true">
              {#each item.miniatura as celda, k (k)}
                <span class="celda celda-{celda}"></span>
              {/each}
            </span>
          {:else}
            <span class="marca" aria-hidden="true">{item.marcado ? '✓' : ''}</span>
          {/if}
          <span>{item.etiqueta}</span>
          {#if item.miniatura && item.marcado}<span class="marca" aria-hidden="true">&#10003;</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .menu-contenedor {
    position: relative;
  }

  .boton-menu {
    display: inline-flex;
    align-items: center;
    gap: var(--ipn-esp-1);
    min-height: var(--ipn-objetivo-tactil);
    padding: 0 var(--ipn-esp-3);
    border: 1px solid var(--ipn-borde-control);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    font: inherit;
    font-size: var(--ipn-tamano-s);
    cursor: pointer;
  }

  .boton-menu:hover {
    background: var(--ipn-acento-suave);
  }

  .boton-menu:focus-visible,
  .item:focus-visible {
    outline: 0.1875rem solid var(--ipn-acento);
    outline-offset: -0.1875rem;
  }

  .flecha {
    color: var(--ipn-tenue);
    font-size: var(--ipn-tamano-xs);
  }

  .menu {
    position: absolute;
    inset-inline-end: 0;
    top: calc(100% + var(--ipn-esp-1));
    z-index: 1000;
    min-width: 16rem;
    max-width: calc(100vw - var(--ipn-esp-4));
    padding: var(--ipn-esp-1);
    border: 1px solid var(--ipn-linea);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    box-shadow: 0 0.5rem 1.5rem var(--ipn-linea);
  }

  .item {
    display: flex;
    align-items: center;
    gap: var(--ipn-esp-2);
    width: 100%;
    min-height: var(--ipn-objetivo-tactil);
    padding: 0 var(--ipn-esp-3);
    border: none;
    border-radius: var(--ipn-radio-s);
    background: none;
    color: inherit;
    font: inherit;
    font-size: var(--ipn-tamano-s);
    text-align: start;
    cursor: pointer;
  }

  .item:hover {
    background: var(--ipn-acento-suave);
  }

  .marca {
    width: 1rem;
    color: var(--ipn-acento);
    text-align: center;
  }

  .separador {
    height: 1px;
    margin: var(--ipn-esp-1) 0;
    background: var(--ipn-linea);
  }

  /* Miniatura de la distribución: cuadrícula 3×3 (a archivos, e editor, p PDF, x problemas/salida). */
  .mini {
    display: grid;
    grid-template-columns: repeat(3, 0.5rem);
    grid-template-rows: repeat(3, 0.375rem);
    gap: 1px;
    flex: none;
  }

  .celda {
    background: var(--ipn-linea);
  }

  .celda-e {
    background: var(--ipn-acento);
  }

  .celda-p {
    background: var(--ipn-info);
  }

  .celda-a {
    background: var(--ipn-tenue);
  }

  .celda-x {
    background: var(--ipn-borde-control);
  }
</style>
