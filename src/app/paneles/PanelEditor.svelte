<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { EditorView } from '@codemirror/view';
  import { setDiagnostics } from '@codemirror/lint';
  import { diagnosticos } from '../../editor/marcas';
  import { tick, untrack } from 'svelte';
  import { aTexto } from '../../almacen/rutas';
  import { crearEstadoEditor } from '../../editor/crear-editor';
  import { plano } from '../../textos/plano';
  import { t } from '../../textos/t';
  import { esImagen, nombreDe } from '../proyecto/arbol';
  import type { EstadoProyecto } from '../proyecto/estado.svelte';
  import VistaImagen from './VistaImagen.svelte';

  let { estado }: { estado: EstadoProyecto } = $props();
  // El registro pertenece a las acciones DOM; no debe volver a disparar el efecto que reconstruye sus vistas.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const propias = new Map<HTMLElement, { ruta: string; vista: EditorView }>();
  const saltos = new WeakMap<EditorView, number>();

  /** Una vista de CodeMirror por archivo abierto; se conserva el estado (cursor, historial) al cambiar de pestaña. */
  function montar(nodo: HTMLElement, ruta: string) {
    let vivo = true;
    void (async () => {
      let guardado = estado.estadosEditor.get(ruta);
      if (!guardado) {
        await estado.servicios.auto.guardarTodo();
        if (!vivo) return;
        const archivo = await estado.servicios.almacen.leer(estado.id, ruta);
        if (!vivo) return;
        guardado = crearEstadoEditor({
          ruta,
          texto: archivo ? aTexto(archivo.contenido) : '',
          alEditar: (texto) => estado.alEditar(ruta, texto),
          alActualizar: (s) => {
            if (estado.estadosEditor.has(ruta)) estado.estadosEditor.set(ruta, s);
          },
          alGuardar: () => void estado.guardarYa(),
          alPaleta: () => (estado.paletaAbierta = true),
        });
        estado.estadosEditor.set(ruta, guardado);
      }
      const vista = new EditorView({ state: guardado, parent: nodo, root: nodo.ownerDocument });
      propias.set(nodo, { ruta, vista });
      estado.vistas.set(ruta, vista);
      marcarYSaltar(vista, ruta);
    })();
    return {
      destroy() {
        vivo = false;
        const vista = propias.get(nodo)?.vista;
        if (vista) {
          // Un montaje nuevo puede haberse registrado antes del desmontaje de este panel.
          // En un teardown Svelte lee valores reactivos anteriores; cerrar/renombrar ya borró este mapa ordinario.
          if (estado.estadosEditor.has(ruta) && estado.vistas.get(ruta) === vista)
            estado.estadosEditor.set(ruta, vista.state);
          if (estado.vistas.get(ruta) === vista) estado.vistas.delete(ruta);
          propias.delete(nodo);
          vista.destroy();
        }
      },
    };
  }

  function marcarYSaltar(vista: EditorView, ruta: string) {
    vista.dispatch(setDiagnostics(vista.state, diagnosticos(vista.state, ruta, estado.problemas)));
    const salto = estado.salto;
    if (salto?.ruta !== ruta || saltos.get(vista) === salto.n) return;
    saltos.set(vista, salto.n);
    const linea = vista.state.doc.line(Math.max(1, Math.min(salto.linea, vista.state.doc.lines)));
    vista.dispatch({
      selection: { anchor: linea.from },
      effects: EditorView.scrollIntoView(linea.from, { y: 'center' }),
    });
    vista.focus();
  }

  $effect(() => {
    void estado.problemas;
    void estado.salto;
    void tick().then(() => {
      for (const { ruta, vista } of propias.values()) marcarYSaltar(vista, ruta);
    });
  });

  async function elegir(ruta: string) {
    estado.activarArchivo(ruta);
    await tick();
    estado.vistas.get(ruta)?.focus();
  }

  function teclasDePestana(e: KeyboardEvent, i: number) {
    const total = estado.abiertos.length;
    let destino = -1;
    if (e.key === 'ArrowRight') destino = (i + 1) % total;
    else if (e.key === 'ArrowLeft') destino = (i - 1 + total) % total;
    else if (e.key === 'Home') destino = 0;
    else if (e.key === 'End') destino = total - 1;
    else if (e.key === 'Delete') {
      // Cerrar la pestaña con el teclado (Ctrl+W es del navegador); el botón × es solo para ratón y toque.
      e.preventDefault();
      const ruta = estado.abiertos[i];
      if (ruta) estado.cerrarArchivo(ruta);
      return;
    }
    if (destino < 0) return;
    e.preventDefault();
    const ruta = estado.abiertos[destino];
    if (!ruta) return;
    estado.activarArchivo(ruta);
    void tick().then(() => document.getElementById(`pestana-${estado.id}-${destino}`)?.focus());
  }

  const conflicto = $derived(
    estado.activo && estado.conflictos.includes(estado.activo) ? estado.activo : undefined,
  );

  // CodeMirror se ata a la ventana (documento) donde nace: al pasar el panel a otra ventana, o al volver, las vistas se
  // vuelven a crear allí con el mismo estado (texto, cursor, historial).
  let ventanasPrevias = untrack(() => estado.generacionVentanas);
  $effect(() => {
    const actual = estado.generacionVentanas;
    if (actual === ventanasPrevias) return;
    ventanasPrevias = actual;
    void tick().then(() => {
      for (const [nodo, { ruta, vista }] of [...propias]) {
        const padre = vista.dom.parentElement;
        if (!padre) continue;
        const guardado = vista.state;
        const enfocada = vista.hasFocus;
        vista.destroy();
        const nueva = new EditorView({ state: guardado, parent: padre, root: padre.ownerDocument });
        propias.set(nodo, { ruta, vista: nueva });
        if (estado.vistas.get(ruta) === vista) estado.vistas.set(ruta, nueva);
        if (enfocada) nueva.focus();
      }
    });
  });

  // Al mostrar una vista que estaba oculta hay que medirla de nuevo.
  $effect(() => {
    const ruta = estado.activo;
    if (ruta) void tick().then(() => estado.vistas.get(ruta)?.requestMeasure());
  });
</script>

<section class="editor" aria-label={t('paneles.editor')}>
  {#if estado.abiertos.length === 0}
    <p class="vacio">{t('editor.sin_archivos')}</p>
  {:else}
    <div class="pestanas" role="tablist" aria-label={t('editor.pestanas_aria')}>
      {#each estado.abiertos as ruta, i (ruta)}
        {@const nombre = nombreDe(ruta)}
        <div class="pestana" class:activa={ruta === estado.activo}>
          <button
            type="button"
            role="tab"
            class="nombre"
            id="pestana-{estado.id}-{i}"
            aria-selected={ruta === estado.activo}
            aria-keyshortcuts="Delete"
            aria-controls="vista-{estado.id}-{i}"
            tabindex={ruta === estado.activo ? 0 : -1}
            title={ruta}
            onclick={() => void elegir(ruta)}
            onkeydown={(e) => teclasDePestana(e, i)}>{nombre}</button
          >
          <button
            type="button"
            class="cerrar"
            tabindex="-1"
            aria-hidden="true"
            title={plano(t('editor.cerrar_pestana', { nombre }))}
            onclick={() => estado.cerrarArchivo(ruta)}>&times;</button
          >
        </div>
      {/each}
    </div>

    {#if conflicto}
      <div class="conflicto" role="alert">
        <p>{plano(t('editor.conflicto', { ruta: conflicto }))}</p>
        <div class="acciones">
          <button type="button" class="boton" onclick={() => void estado.usarVersionDeOtraPestana(conflicto)}
            >{t('editor.conflicto_usar_otra')}</button
          >
          <button type="button" class="boton" onclick={() => estado.conservarMiVersion(conflicto)}
            >{t('editor.conflicto_conservar')}</button
          >
        </div>
      </div>
    {/if}

    <div class="vistas">
      {#each estado.abiertos as ruta, i (ruta)}
        <div
          class="vista"
          role="tabpanel"
          id="vista-{estado.id}-{i}"
          aria-labelledby="pestana-{estado.id}-{i}"
          hidden={ruta !== estado.activo}
        >
          {#if esImagen(ruta)}
            <VistaImagen {estado} {ruta} />
          {:else}
            <div class="cm" use:montar={ruta}></div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
  }

  .vacio {
    margin: 0;
    padding: var(--ipn-esp-5);
    color: var(--ipn-tenue);
  }

  .pestanas {
    display: flex;
    flex: none;
    overflow-x: auto;
    border-bottom: 1px solid var(--ipn-linea);
    background: var(--ipn-hundido);
  }

  .pestana {
    display: flex;
    align-items: center;
    flex: none;
    border-right: 1px solid var(--ipn-linea);
    border-bottom: 0.1875rem solid transparent;
    font-size: var(--ipn-tamano-s);
  }

  .pestana.activa {
    background: var(--ipn-superficie);
    border-bottom-color: var(--ipn-acento);
  }

  .nombre,
  .cerrar {
    min-height: var(--ipn-objetivo-tactil);
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .nombre {
    padding: 0 var(--ipn-esp-2) 0 var(--ipn-esp-3);
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cerrar {
    min-width: var(--ipn-objetivo-tactil);
    color: var(--ipn-tenue);
    font-size: var(--ipn-tamano-l);
    line-height: 1;
  }

  .cerrar:hover {
    color: var(--ipn-texto);
    background: var(--ipn-acento-suave);
  }

  .nombre:focus-visible,
  .cerrar:focus-visible,
  .boton:focus-visible {
    outline: 0.1875rem solid var(--ipn-acento);
    outline-offset: -0.1875rem;
  }

  .conflicto {
    flex: none;
    padding: var(--ipn-esp-2) var(--ipn-esp-3);
    background: var(--ipn-aviso-suave);
    color: var(--ipn-texto);
    border-bottom: 1px solid var(--ipn-aviso);
    font-size: var(--ipn-tamano-s);
  }

  .conflicto p {
    margin: 0 0 var(--ipn-esp-2);
  }

  .acciones {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ipn-esp-2);
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

  .vistas {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .vista {
    position: absolute;
    inset: 0;
  }

  .vista[hidden] {
    display: none;
  }

  .cm {
    height: 100%;
  }
</style>
