// SPDX-License-Identifier: AGPL-3.0-or-later
// Espacio de paneles acomodables (D10, D23) con dockview: acoplar, apilar en pestañas, dividir, ocultar y sacar a otra
// ventana. La distribución se serializa con `toJSON` y se guarda por proyecto en el almacén `distribuciones` (02), con
// una distribución global por omisión. dockview se carga con `import()` solo en modo amplio.
import type { DockviewApi, IHeaderActionsRenderer, ITabRenderer } from 'dockview';
import { instalarAtajosGlobales } from '../../editor/atajos';
import '../../estilos/paneles.css';
import { plano } from '../../textos/plano';
import { t } from '../../textos/t';
import type { EstadoProyecto } from '../proyecto/estado.svelte';
import {
  construirDistribucion,
  DISTRIBUCION_INICIAL,
  esIdPanel,
  mostrarPanel,
  PANELES,
  tituloPanel,
  type IdDistribucion,
  type IdPanel,
} from './distribuciones';
import { montarPanel } from './registro';

/** Lo que se guarda en el almacén: versionado para poder migrar si cambia el formato. */
export interface DistribucionGuardada {
  v: 1;
  dockview: unknown;
}

export const CLAVE_DISTRIBUCION_GLOBAL = 'global';
const ESPERA_GUARDADO_MS = 400;

export interface Espacio {
  readonly api: DockviewApi;
  /** Aplica una distribución predefinida (y la guarda para este proyecto). */
  aplicarPredefinida(id: IdDistribucion): void;
  /** Vuelve a la distribución predefinida inicial. */
  restablecer(): void;
  visible(id: IdPanel): boolean;
  alternarPanel(id: IdPanel): void;
  /** Saca el grupo del panel a otra ventana del navegador. */
  abrirEnVentana(id: IdPanel): Promise<boolean>;
  /** Guarda la distribución actual como la de los proyectos nuevos. */
  usarComoGlobal(): Promise<void>;
  /** Avisa cuando cambia algo que el menú muestra (paneles visibles, ventanas). */
  alCambiar(fn: () => void): () => void;
  dispose(): void;
}

function esDistribucionGuardada(valor: unknown): valor is DistribucionGuardada {
  return !!valor && typeof valor === 'object' && (valor as DistribucionGuardada).v === 1 && !!(valor as DistribucionGuardada).dockview;
}

function mensajesAccesibles() {
  return {
    panelOpened: (titulo: string) => plano(t('paneles.msg.abierto', { titulo })),
    panelClosed: (titulo: string) => plano(t('paneles.msg.cerrado', { titulo })),
    groupMaximized: (titulo: string) => plano(t('paneles.msg.maximizado', { titulo })),
    groupRestored: (titulo: string) => plano(t('paneles.msg.restaurado', { titulo })),
    groupFloated: (titulo: string) => plano(t('paneles.msg.flotante', { titulo })),
    groupDocked: (titulo: string) => plano(t('paneles.msg.acoplado', { titulo })),
    groupPoppedOut: (titulo: string) => plano(t('paneles.msg.en_ventana', { titulo })),
    closeTab: (titulo: string) => plano(t('paneles.cerrar_pestana', { titulo })),
    closeTabPlain: () => t('paneles.cerrar_pestana_sin_titulo'),
    moveCancelled: () => t('paneles.msg.movimiento_cancelado'),
    moveNotAllowed: () => t('paneles.msg.movimiento_no_permitido'),
    moveFloated: (origen: string) => plano(t('paneles.msg.flotante', { titulo: origen })),
  };
}

/**
 * Pestaña de panel sin botón anidado: la pestaña predeterminada de dockview lleva dentro un botón de cerrar y eso es
 * un control interactivo dentro de otro (falla axe, `nested-interactive`). Aquí la × es solo para ratón y toque
 * (`aria-hidden`); con el teclado se oculta el panel con Supr (Ctrl+W es del navegador).
 */
function crearPestana(): ITabRenderer {
  const element = document.createElement('div');
  element.className = 'dv-default-tab';
  const contenido = document.createElement('div');
  contenido.className = 'dv-default-tab-content';
  const accion = document.createElement('div');
  accion.className = 'dv-default-tab-action';
  accion.setAttribute('aria-hidden', 'true');
  accion.append(iconoCerrar());
  element.append(contenido, accion);
  let quitar: Array<() => void> = [];
  return {
    element,
    init(params) {
      const poner = (texto: string) => {
        contenido.textContent = texto;
        accion.title = plano(t('paneles.cerrar_pestana', { titulo: texto }));
      };
      poner(params.title ?? '');
      const titulo = params.api.onDidTitleChange((e) => poner(e.title));
      const alClic = (e: Event) => {
        e.preventDefault();
        params.api.close();
      };
      const alPuntero = (e: Event) => e.preventDefault();
      accion.addEventListener('click', alClic);
      accion.addEventListener('pointerdown', alPuntero);
      // El elemento enfocable es la pestaña de dockview (el padre de este): se engancha cuando ya está en el DOM.
      const alTecla = (e: KeyboardEvent) => {
        if (e.key !== 'Delete') return;
        e.preventDefault();
        params.api.close();
      };
      const enganchar = setTimeout(() => {
        const pestana = element.parentElement;
        if (!pestana) return;
        pestana.setAttribute('aria-keyshortcuts', 'Delete');
        pestana.addEventListener('keydown', alTecla);
        quitar.push(() => pestana.removeEventListener('keydown', alTecla));
      });
      quitar = [
        () => titulo.dispose(),
        () => accion.removeEventListener('click', alClic),
        () => accion.removeEventListener('pointerdown', alPuntero),
        () => clearTimeout(enganchar),
      ];
    },
    dispose() {
      quitar.forEach((q) => q());
      quitar = [];
    },
  };
}

function iconoCerrar(): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M3 3l10 10M13 3L3 13');
  svg.append(p);
  return svg;
}

/** Icono «abrir en otra ventana»: SVG propio (un carácter Unicode forzaría a cargar la fuente matemática). */
function iconoVentana(): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  for (const d of ['M6.5 2.5h7v7h-7z', 'M3.5 6.5v7h7']) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

/** Crea el espacio dentro de `contenedor`: carga dockview, registra los paneles y restaura la distribución guardada. */
export async function crearEspacio(contenedor: HTMLElement, estado: EstadoProyecto): Promise<Espacio> {
  const [{ createDockview, themeLight }] = await Promise.all([
    import('dockview'),
    import('dockview/dist/styles/dockview.css'),
  ]);
  const { almacen } = estado.servicios;
  const desmontajes = new Map<string, () => void>();
  const oyentes = new Set<() => void>();
  const notificar = () => oyentes.forEach((fn) => fn());

  const urlVentana = new URL('popout.html', document.baseURI).href;
  // La ventana nueva hereda idioma y tema (claro/oscuro elegido a mano) de la principal.
  const abrirVentana = (item: Parameters<DockviewApi['addPopoutGroup']>[0]) =>
    api.addPopoutGroup(item, {
      popoutUrl: urlVentana,
      onDidOpen: ({ window: ventana }) => {
        const raiz = ventana.document.documentElement;
        raiz.lang = document.documentElement.lang;
        ventana.document.title = document.title;
        const tema = document.documentElement.getAttribute('data-tema');
        if (tema) raiz.setAttribute('data-tema', tema);
        const quitarAtajos = instalarAtajosGlobales(ventana, {
          guardar: () => void estado.guardarYa(),
          paleta: () => (estado.paletaAbierta = true),
        });
        ventana.addEventListener('pagehide', quitarAtajos, { once: true });
      },
    });

  const api = createDockview(contenedor, {
    popoutUrl: urlVentana,
    // Medidas del tema claro de dockview con los colores de Folio (src/estilos/paneles.css).
    theme: { ...themeLight, className: `${themeLight.className} folio-paneles` },
    disableFloatingGroups: true,
    messages: mensajesAccesibles(),
    defaultTabComponent: 'pestana',
    createTabComponent: () => crearPestana(),
    createComponent: ({ id, name }) => {
      const element = document.createElement('div');
      element.className = 'panel-contenido';
      const idPanel = esIdPanel(name) ? name : 'editor';
      return {
        element,
        init: () => {
          desmontajes.set(id, montarPanel(idPanel, estado, element));
        },
        dispose: () => {
          desmontajes.get(id)?.();
          desmontajes.delete(id);
        },
      };
    },
    createRightHeaderActionComponent: (grupo): IHeaderActionsRenderer => {
      const element = document.createElement('div');
      element.className = 'acciones-grupo';
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'accion-ventana';
      boton.append(iconoVentana());
      boton.setAttribute('aria-label', t('paneles.abrir_en_ventana'));
      boton.title = t('paneles.abrir_en_ventana');
      boton.addEventListener('click', () => void abrirVentana(grupo));
      element.append(boton);
      const ajustar = () => {
        element.hidden = grupo.api.location.type === 'popout';
      };
      const quitar = grupo.api.onDidLocationChange(ajustar);
      ajustar();
      return { element, init: ajustar, dispose: () => quitar.dispose() };
    },
  } as Parameters<typeof createDockview>[1]);

  // ---------- guardado ----------
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let cerrado = false;

  const serializar = (): DistribucionGuardada => ({ v: 1, dockview: api.toJSON() });

  const guardarAhora = () => {
    temporizador = undefined;
    if (cerrado) return;
    // Mientras haya una ventana abierta no se guarda: la distribución quedaría sin esos paneles.
    if (api.getPopouts().length > 0) return;
    void almacen.guardarDistribucion(estado.id, serializar()).catch(() => {});
  };
  const programarGuardado = () => {
    if (cerrado) return;
    if (temporizador !== undefined) clearTimeout(temporizador);
    temporizador = setTimeout(guardarAhora, ESPERA_GUARDADO_MS);
  };
  window.addEventListener('pagehide', guardarAhora);

  const suscripciones = [
    api.onDidLayoutChange(() => {
      programarGuardado();
      notificar();
    }),
    api.onDidAddPopoutGroup(() => {
      estado.generacionVentanas += 1;
      notificar();
    }),
    api.onDidRemovePopoutGroup(() => {
      estado.generacionVentanas += 1;
      programarGuardado();
      notificar();
    }),
    api.onDidOpenPopoutWindowFail(() => {
      estado.avisar('error', t('paneles.ventana_bloqueada'));
    }),
  ];

  // ---------- restaurar ----------
  const restaurar = async () => {
    const propia = await almacen.leerDistribucion(estado.id).catch(() => undefined);
    const global = propia ? undefined : await almacen.leerDistribucion(CLAVE_DISTRIBUCION_GLOBAL).catch(() => undefined);
    const guardada = propia ?? global;
    if (esDistribucionGuardada(guardada)) {
      try {
        api.fromJSON(guardada.dockview as Parameters<DockviewApi['fromJSON']>[0]);
        // Una distribución sin editor no sirve para escribir: se descarta.
        if (api.getPanel('editor')) return;
      } catch {
        /* distribución dañada o de otra versión: se usa la predefinida */
      }
    }
    construirDistribucion(api, DISTRIBUCION_INICIAL);
  };
  await restaurar();

  return {
    api,
    aplicarPredefinida(id) {
      construirDistribucion(api, id);
      programarGuardado();
    },
    restablecer() {
      construirDistribucion(api, DISTRIBUCION_INICIAL);
      programarGuardado();
    },
    visible: (id) => !!api.getPanel(id),
    alternarPanel(id) {
      const panel = api.getPanel(id);
      if (panel) {
        // El editor es el único panel que no se puede ocultar: sin él no hay dónde escribir.
        if (id !== 'editor') api.removePanel(panel);
      } else {
        mostrarPanel(api, id);
      }
      notificar();
    },
    async abrirEnVentana(id) {
      const panel = api.getPanel(id);
      if (!panel) return false;
      return abrirVentana(panel);
    },
    async usarComoGlobal() {
      await almacen.guardarDistribucion(CLAVE_DISTRIBUCION_GLOBAL, serializar());
    },
    alCambiar(fn) {
      oyentes.add(fn);
      return () => void oyentes.delete(fn);
    },
    dispose() {
      window.removeEventListener('pagehide', guardarAhora);
      // Lo último que se movió se guarda antes de cerrar.
      if (temporizador !== undefined) {
        clearTimeout(temporizador);
        guardarAhora();
      }
      cerrado = true;
      suscripciones.forEach((s) => s.dispose());
      api.dispose();
      for (const des of desmontajes.values()) des();
      desmontajes.clear();
    },
  };
}

export { PANELES, tituloPanel };
