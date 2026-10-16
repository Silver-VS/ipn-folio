<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { aplicarTema, leerTema, MODOS } from '@ipn/comun/js/tema.js';
  import { onMount } from 'svelte';
  import { acerca } from '../../acerca';
  import { idDeProyecto } from '../../almacen/papelera';
  import { instalarAtajosGlobales } from '../../editor/atajos';
  import { plano } from '../../textos/plano';
  import { t } from '../../textos/t';
  import { avisoInicio } from '../aviso-inicio.svelte';
  import Menu, { type ElementoMenu } from '../Menu.svelte';
  import { crearEspacio, type Espacio } from '../paneles/espacio';
  import {
    DISTRIBUCIONES,
    miniatura,
    nombreDistribucion,
    PANELES,
    tituloPanel,
    type IdPanel,
  } from '../paneles/distribuciones';
  import EspacioCompacto from '../paneles/EspacioCompacto.svelte';
  import { observarModo, type ModoEspacio } from '../paneles/modo';
  import { leerDias } from '../papelera/purga';
  import { servicios, type Servicios } from '../servicios';
  import { EstadoProyecto } from './estado.svelte';
  import Mensajes from './Mensajes.svelte';
  import Paleta from './Paleta.svelte';
  import { tienda } from '../../herramientas/tienda.svelte';
  import type { TiendaHerramientas } from '../../herramientas/tienda.svelte';
  import PanelDescarga from '../avisos/PanelDescarga.svelte';
  import PildoraEstado from './PildoraEstado.svelte';
  import { conectarCompilacion } from './compilar';

  let { id, alProtegerSalida }: { id: string; alProtegerSalida: (comprobar?: () => boolean) => void } = $props();
  let herramientas = $state.raw<TiendaHerramientas>();

  $effect(() => {
    const e = estado;
    if (!e) return;
    let vivo = true;
    let controlador: ReturnType<typeof conectarCompilacion> | undefined;
    void tienda().then((t) => {
      if (!vivo) return;
      herramientas = t;
      controlador = conectarCompilacion(e, t);
      e.actualizarPdf = controlador.solicitar;
    });
    alProtegerSalida(() => !e.conflictos.length || window.confirm(t('flujo.salir_conflicto')));
    const antesDeSalir = (evento: BeforeUnloadEvent) => {
      if (!e.conflictos.length) return;
      evento.preventDefault();
      evento.returnValue = '';
    };
    window.addEventListener('beforeunload', antesDeSalir);
    return () => {
      vivo = false;
      e.actualizarPdf = undefined;
      controlador?.destruir();
      alProtegerSalida();
      window.removeEventListener('beforeunload', antesDeSalir);
    };
  });

  $effect(() => {
    if (!estado?.salto || !espacio) return;
    if (!espacio.visible('editor')) espacio.alternarPanel('editor');
  });

  let estado = $state.raw<EstadoProyecto>();
  let cargando = $state(true);
  let noEncontrado = $state(false);
  let persistente = $state(true);
  let modo = $state<ModoEspacio>('amplio');
  let contenedor = $state<HTMLElement>();
  let espacio = $state.raw<Espacio>();
  let version = $state(0);
  let ahora = $state(Date.now());
  let modoTema = $state(leerTema());

  // ---------- carga del proyecto ----------
  $effect(() => {
    const idActual = id;
    let vivo = true;
    let abierto: EstadoProyecto | undefined;
    cargando = true;
    noEncontrado = false;
    estado = undefined;
    void servicios()
      .then(async (s: Servicios) => {
        persistente = s.persistente;
        return EstadoProyecto.abrir(s, idActual);
      })
      .then((e) => {
        if (!vivo) {
          void e?.destruir();
          return;
        }
        abierto = e;
        estado = e;
        noEncontrado = !e;
        cargando = false;
      })
      .catch(() => {
        if (!vivo) return;
        noEncontrado = true;
        cargando = false;
      });
    return () => {
      vivo = false;
      void abierto?.destruir();
    };
  });

  // ---------- modo amplio o compacto ----------
  onMount(() => {
    const observador = observarModo(window, (m) => (modo = m));
    modo = observador.actual;
    const reloj = setInterval(() => (ahora = Date.now()), 1000);
    return () => {
      observador.detener();
      clearInterval(reloj);
    };
  });

  // dockview solo existe en modo amplio (y solo entonces se descarga).
  $effect(() => {
    const e = estado;
    const c = contenedor;
    if (!e || !c || modo !== 'amplio') return;
    let vivo = true;
    let creado: Espacio | undefined;
    void crearEspacio(c, e).then((x) => {
      if (!vivo) {
        x.dispose();
        return;
      }
      creado = x;
      espacio = x;
      x.alCambiar(() => (version += 1));
    });
    return () => {
      vivo = false;
      creado?.dispose();
      espacio = undefined;
    };
  });

  // ---------- atajos ----------
  $effect(() => {
    const e = estado;
    if (!e) return;
    return instalarAtajosGlobales(window, {
      guardar: () => void e.guardarYa(),
      paleta: () => (e.paletaAbierta = true),
    });
  });

  // ---------- indicador de guardado ----------
  const textoGuardado = $derived.by(() => {
    if (!estado) return '';
    if (estado.guardado === 'pendiente') return t('guardado.guardando');
    if (estado.guardado === 'error') return t('guardado.error');
    if (estado.ultimoGuardado === undefined) return t('guardado.todo');
    const segundos = Math.max(0, Math.floor((ahora - estado.ultimoGuardado) / 1000));
    const minutos = Math.floor(segundos / 60);
    return segundos < 60 ? t('guardado.hace_segundos', { segundos }) : t('guardado.hace_minutos', { minutos });
  });

  // ---------- menús ----------
  const elementosDistribucion = $derived.by((): ElementoMenu[] => {
    void version;
    const e = espacio;
    if (!e) return [];
    const predefinidas: ElementoMenu[] = DISTRIBUCIONES.map((d) => ({
      id: `dist-${d}`,
      etiqueta: nombreDistribucion(d),
      miniatura: miniatura(d),
      accion: () => e.aplicarPredefinida(d),
    }));
    const paneles: ElementoMenu[] = PANELES.map((p: IdPanel, i) => ({
      id: `panel-${p}`,
      etiqueta: tituloPanel(p),
      casilla: true,
      marcado: e.visible(p),
      separadorAntes: i === 0,
      accion: () => e.alternarPanel(p),
    }));
    const ventanas: ElementoMenu[] = (['pdf', 'editor'] as const)
      .filter((p) => e.visible(p))
      .map((p, i) => {
        const panel = tituloPanel(p);
        return {
          id: `ventana-${p}`,
          etiqueta: plano(t('distribucion.en_ventana', { panel })),
          separadorAntes: i === 0,
          accion: () => void e.abrirEnVentana(p),
        };
      });
    return [
      ...predefinidas,
      ...paneles,
      ...ventanas,
      {
        id: 'restablecer',
        etiqueta: t('distribucion.restablecer'),
        separadorAntes: true,
        accion: () => e.restablecer(),
      },
      { id: 'global', etiqueta: t('distribucion.usar_global'), accion: () => void e.usarComoGlobal() },
    ];
  });

  const elementosProyecto = $derived.by((): ElementoMenu[] => [
    {
      id: 'papelera',
      etiqueta: t('proyecto.mover_a_papelera'),
      accion: () => void moverAPapelera(),
    },
  ]);

  const elementosTema = $derived.by((): ElementoMenu[] => {
    const etiquetas: Record<string, string> = {
      claro: t('tema.claro'),
      oscuro: t('tema.oscuro'),
      auto: t('tema.auto'),
    };
    return MODOS.map((m) => ({
      id: `tema-${m}`,
      etiqueta: etiquetas[m] ?? m,
      casilla: true,
      marcado: modoTema === m,
      accion: () => {
        modoTema = aplicarTema(m);
      },
    }));
  });

  async function moverAPapelera() {
    if (!estado) return;
    const abierto = estado;
    const { id: proyectoId, proyecto } = abierto;
    try {
      await abierto.moverAPapelera();
      // Sin confirmación (D29): el inicio muestra el aviso con «Deshacer», que se queda hasta cerrarlo.
      const dias = await leerDias(abierto.servicios.almacen, acerca.papelera);
      avisoInicio.mostrar({
        texto: plano(t('proyecto.movido_a_papelera', { nombre: proyecto.nombre, dias })),
        accion: {
          etiqueta: t('archivos.deshacer'),
          ejecutar: async () => {
            await abierto.servicios.auto.restaurarDePapelera(idDeProyecto(proyectoId));
          },
        },
      });
      location.hash = '#/';
    } catch (e) {
      abierto.avisarError(e);
    }
  }
</script>

<div class="proyecto">
  {#if cargando}
    <p class="aviso-carga" role="status">{t('proyecto.abriendo')}</p>
  {:else if noEncontrado || !estado}
    <main class="no-encontrado">
      <h1>{t('proyecto.no_encontrado_titulo')}</h1>
      <p>{t('proyecto.no_encontrado_ayuda')}</p>
      <a class="enlace-boton" href="#/">{t('proyecto.volver')}</a>
    </main>
  {:else}
    {#if !persistente}
      <p class="sin-almacen" role="alert">{t('almacen.error.almacen_no_disponible')}</p>
    {/if}
    <header class="barra">
      <a class="enlace-boton" href="#/">{t('proyecto.volver')}</a>
      <h1 class="nombre">{estado.proyecto.nombre}</h1>
      <p
        class="guardado"
        class:error={estado.guardado === 'error'}
        aria-live="off"
        data-estado={estado.guardado}
        data-ultimo={estado.ultimoGuardado ?? 0}
      >
        {textoGuardado}
      </p>
      <div class="acciones">
        <button type="button" class="boton" disabled={!herramientas} onclick={() => void estado!.guardarYa()}>{t('flujo.actualizar')}</button>
        <PildoraEstado {estado} />
        <button type="button" class="boton" onclick={() => (estado!.paletaAbierta = true)}
          >{t('paleta.boton')}</button
        >
        {#if modo === 'amplio'}
          <Menu etiqueta={t('distribucion.menu')} elementos={elementosDistribucion} />
        {/if}
        <Menu etiqueta={t('proyecto.menu')} elementos={elementosProyecto} />
        <Menu etiqueta={t('proyecto.tema')} elementos={elementosTema} />
      </div>
    </header>
    {#if herramientas && (herramientas.pregunta || herramientas.error || herramientas.latex.estado === 'descargando')}
      <PanelDescarga tienda={herramientas} />
    {/if}

    <main class="espacio" aria-label={t('proyecto.espacio_aria')}>
      {#if modo === 'amplio'}
        <div class="dock" bind:this={contenedor}></div>
      {:else}
        <EspacioCompacto {estado} />
      {/if}
    </main>

    <Paleta {estado} />
    <Mensajes {estado} compacto={modo !== 'amplio'} />
  {/if}
</div>

<style>
  .proyecto {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    background: var(--ipn-fondo);
    color: var(--ipn-texto);
  }

  .aviso-carga {
    margin: var(--ipn-esp-5);
    color: var(--ipn-tenue);
  }

  .no-encontrado {
    padding: var(--ipn-esp-5) var(--ipn-esp-4);
  }

  .no-encontrado h1 {
    margin: 0 0 var(--ipn-esp-3);
    font-size: var(--ipn-tamano-xl);
  }

  .sin-almacen {
    margin: 0;
    padding: var(--ipn-esp-2) var(--ipn-esp-4);
    background: var(--ipn-error-suave);
    color: var(--ipn-error);
    font-size: var(--ipn-tamano-s);
  }

  .barra {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ipn-esp-2) var(--ipn-esp-3);
    min-height: var(--ipn-alto-barra);
    padding: var(--ipn-esp-1) var(--ipn-esp-3);
    border-bottom: 1px solid var(--ipn-linea);
    background: var(--ipn-superficie);
  }

  .nombre {
    flex: 1 1 8rem;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-size: var(--ipn-tamano-m);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .guardado {
    margin: 0;
    color: var(--ipn-tenue);
    font-size: var(--ipn-tamano-s);
  }

  .guardado.error {
    color: var(--ipn-error);
  }

  .acciones {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ipn-esp-2);
  }

  .boton,
  .enlace-boton {
    display: inline-flex;
    align-items: center;
    min-height: var(--ipn-objetivo-tactil);
    padding: 0 var(--ipn-esp-3);
    border: 1px solid var(--ipn-borde-control);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    font: inherit;
    font-size: var(--ipn-tamano-s);
    text-decoration: none;
    cursor: pointer;
  }

  .boton:hover,
  .enlace-boton:hover {
    background: var(--ipn-acento-suave);
  }

  .boton:focus-visible,
  .enlace-boton:focus-visible {
    outline: 0.1875rem solid var(--ipn-acento);
    outline-offset: 0.125rem;
  }

  .espacio {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .dock {
    position: absolute;
    inset: 0;
  }
</style>
