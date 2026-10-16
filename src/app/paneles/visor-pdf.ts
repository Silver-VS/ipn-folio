// SPDX-License-Identifier: AGPL-3.0-or-later
// Visor de PDF con pdf.js en su propio worker (servido por la app, sin CDN). Dibuja las páginas bajo demanda y, al
// recibir un PDF nuevo o cambiar el zoom, arma la nueva vista fuera de pantalla y la cambia de golpe: sin parpadeo y
// conservando página y zoom (sesión 08). SyncTeX no entra en esta sesión.
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

type Pdfjs = typeof import('pdfjs-dist');

let promesaPdfjs: Promise<Pdfjs> | undefined;

/** Carga pdf.js (y su worker) la primera vez que se necesita; no entra al paquete inicial. */
export function cargarPdfjs(): Promise<Pdfjs> {
  promesaPdfjs ??= (async () => {
    const [lib, trabajador] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    lib.GlobalWorkerOptions.workerSrc = trabajador.default;
    return lib;
  })();
  return promesaPdfjs;
}

export type ModoZoom = 'ancho' | 'manual';

export interface EstadoVisor {
  /** Página actual (1 si no hay PDF). */
  pagina: number;
  total: number;
  /** Escala efectiva (1 = 100 %). */
  zoom: number;
  modo: ModoZoom;
}

export const PASOS_ZOOM: readonly number[] = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3, 4];
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;

/** Siguiente escala del menú de zoom (mayor o menor que `actual`); se queda en los extremos. */
export function pasoZoom(actual: number, direccion: 1 | -1): number {
  if (direccion === 1) return PASOS_ZOOM.find((p) => p > actual * 1.01) ?? PASOS_ZOOM[PASOS_ZOOM.length - 1]!;
  return [...PASOS_ZOOM].reverse().find((p) => p < actual / 1.01) ?? PASOS_ZOOM[0]!;
}

interface PaginaVista {
  n: number;
  el: HTMLElement;
  canvas?: HTMLCanvasElement;
  tarea?: RenderTask;
  /** Escala con la que se dibujó el canvas actual. */
  dibujadaA?: number;
}

interface Capa {
  el: HTMLElement;
  paginas: PaginaVista[];
  escala: number;
}

export interface OpcionesVisor {
  alCambiar(estado: EstadoVisor): void;
  /** Etiqueta accesible de cada página (viene de es.toml). */
  etiquetaPagina(n: number, total: number): string;
}

const ESPACIO_PX = 12;
const MARGEN_OBSERVADOR = '120% 0px';

export class VisorPdf {
  private doc?: PDFDocumentProxy;
  private capa?: Capa;
  private modo: ModoZoom = 'ancho';
  private escalaManual = 1;
  private escalaEfectiva = 1;
  private pagina = 1;
  private base = { ancho: 612, alto: 792 };
  private generacion = 0;
  private observadorVisibles?: IntersectionObserver;
  private observadorTamano?: ResizeObserver;
  private anchoUsado = 0;
  private dprUsado = 1;
  private temporizadorTamano?: ReturnType<typeof setTimeout>;
  private cuadroScroll = 0;
  private destruido = false;

  constructor(
    private readonly raiz: HTMLElement,
    private readonly opciones: OpcionesVisor,
  ) {
    raiz.addEventListener('scroll', this.alScroll, { passive: true });
    this.observadorTamano = new ResizeObserver(() => this.alCambiarTamano());
    this.observadorTamano.observe(raiz);
  }

  get estado(): EstadoVisor {
    return { pagina: this.pagina, total: this.doc?.numPages ?? 0, zoom: this.escalaEfectiva, modo: this.modo };
  }

  private get ventana(): Window {
    return this.raiz.ownerDocument.defaultView ?? window;
  }

  private dpr(): number {
    return Math.min(2, Math.max(1, this.ventana.devicePixelRatio || 1));
  }

  private notificar(): void {
    this.opciones.alCambiar(this.estado);
  }

  // ---------- carga ----------

  /** Muestra un PDF. Si ya había uno, conserva la página y el zoom (también si es el mismo documento). */
  async cargar(bytes: Uint8Array): Promise<void> {
    const generacion = ++this.generacion;
    const lib = await cargarPdfjs();
    // pdf.js se queda con el buffer (lo transfiere al worker): se le da una copia para no perder el del proyecto.
    const tarea = lib.getDocument({ data: bytes.slice() });
    let nuevo: PDFDocumentProxy;
    try {
      nuevo = await tarea.promise;
    } catch (e) {
      void tarea.destroy();
      throw e;
    }
    if (generacion !== this.generacion || this.destruido) {
      void nuevo.loadingTask.destroy();
      return;
    }
    const primera = await nuevo.getPage(1);
    const vista = primera.getViewport({ scale: 1 });
    this.base = { ancho: vista.width, alto: vista.height };
    const anterior = this.doc;
    const posicion = this.posicionActual();
    this.doc = nuevo;
    this.pagina = Math.min(Math.max(1, this.pagina), nuevo.numPages);
    await this.reconstruir(posicion, generacion);
    if (anterior && anterior !== nuevo) void anterior.loadingTask.destroy();
  }

  // ---------- zoom y navegación ----------

  acercar(): void {
    this.fijarZoom(pasoZoom(this.escalaEfectiva, 1));
  }

  alejar(): void {
    this.fijarZoom(pasoZoom(this.escalaEfectiva, -1));
  }

  fijarZoom(escala: number): void {
    this.modo = 'manual';
    this.escalaManual = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, escala));
    void this.reconstruir(this.posicionActual(), ++this.generacion);
  }

  ajustarAncho(): void {
    this.modo = 'ancho';
    void this.reconstruir(this.posicionActual(), ++this.generacion);
  }

  irAPagina(n: number): void {
    if (!this.capa) return;
    const pagina = Math.min(Math.max(1, Math.round(n) || 1), this.capa.paginas.length);
    const el = this.capa.paginas[pagina - 1]?.el;
    if (!el) return;
    this.raiz.scrollTop = el.offsetTop - ESPACIO_PX;
    this.pagina = pagina;
    this.notificar();
  }

  /** Que la vista se vuelva a medir (por ejemplo, al mover el panel a otra ventana). */
  remedir(): void {
    this.alCambiarTamano(true);
  }

  // ---------- construcción de la vista ----------

  /** Página actual y qué fracción de ella ya se desplazó (para volver al mismo punto tras reconstruir). */
  private posicionActual(): { pagina: number; fraccion: number } {
    const el = this.capa?.paginas[this.pagina - 1]?.el;
    if (!el || el.offsetHeight === 0) return { pagina: this.pagina, fraccion: 0 };
    const dentro = this.raiz.scrollTop - (el.offsetTop - ESPACIO_PX);
    return { pagina: this.pagina, fraccion: Math.min(1, Math.max(0, dentro / el.offsetHeight)) };
  }

  private escalaParaAncho(): number {
    const disponible = this.raiz.clientWidth - ESPACIO_PX * 2;
    return disponible > 0 ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, disponible / this.base.ancho)) : 0;
  }

  private async reconstruir(pos: { pagina: number; fraccion: number }, generacion: number): Promise<void> {
    const doc = this.doc;
    if (!doc) return;
    const escala = this.modo === 'ancho' ? this.escalaParaAncho() : this.escalaManual;
    // Contenedor oculto (pestaña de otro panel, ventana sin tamaño): se arma cuando el observador de tamaño avise.
    if (escala <= 0) return;

    const capa = this.crearCapa(doc, escala);
    const cercanas = [pos.pagina - 1, pos.pagina, pos.pagina + 1].filter((n) => n >= 1 && n <= doc.numPages);
    // Se dibuja fuera de pantalla las páginas que se van a ver para que el cambio no deje un hueco en blanco.
    await Promise.all(cercanas.map((n) => this.dibujar(doc, capa, capa.paginas[n - 1]!)));
    if (generacion !== this.generacion || this.destruido) {
      this.liberarCapa(capa);
      return;
    }

    const vieja = this.capa;
    this.observadorVisibles?.disconnect();
    this.raiz.replaceChildren(capa.el);
    this.capa = capa;
    this.escalaEfectiva = escala;
    this.anchoUsado = this.raiz.clientWidth;
    this.dprUsado = this.dpr();
    this.pagina = Math.min(Math.max(1, pos.pagina), doc.numPages);

    const destino = capa.paginas[this.pagina - 1]?.el;
    if (destino) this.raiz.scrollTop = destino.offsetTop - ESPACIO_PX + destino.offsetHeight * pos.fraccion;
    this.observarVisibles(doc, capa);
    if (vieja) this.liberarCapa(vieja);
    this.notificar();
  }

  private crearCapa(doc: PDFDocumentProxy, escala: number): Capa {
    const el = this.raiz.ownerDocument.createElement('div');
    el.className = 'visor-paginas';
    const paginas: PaginaVista[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = this.raiz.ownerDocument.createElement('div');
      pagina.className = 'visor-pagina';
      pagina.dataset.n = String(n);
      pagina.setAttribute('role', 'img');
      pagina.setAttribute('aria-label', this.opciones.etiquetaPagina(n, doc.numPages));
      pagina.style.width = `${this.base.ancho * escala}px`;
      pagina.style.height = `${this.base.alto * escala}px`;
      el.append(pagina);
      paginas.push({ n, el: pagina });
    }
    return { el, paginas, escala };
  }

  private async dibujar(doc: PDFDocumentProxy, capa: Capa, vista: PaginaVista): Promise<void> {
    if (vista.canvas && vista.dibujadaA === capa.escala) return;
    vista.tarea?.cancel();
    let pagina: PDFPageProxy;
    try {
      pagina = await doc.getPage(vista.n);
    } catch {
      return;
    }
    const dpr = this.dpr();
    const viewport = pagina.getViewport({ scale: capa.escala });
    const lienzo = this.raiz.ownerDocument.createElement('canvas');
    lienzo.width = Math.floor(viewport.width * dpr);
    lienzo.height = Math.floor(viewport.height * dpr);
    lienzo.style.width = `${viewport.width}px`;
    lienzo.style.height = `${viewport.height}px`;
    const contexto = lienzo.getContext('2d');
    if (!contexto) return;
    const tarea = pagina.render({
      canvas: lienzo,
      canvasContext: contexto,
      viewport,
      transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
    });
    vista.tarea = tarea;
    try {
      await tarea.promise;
    } catch {
      return; // cancelada por un zoom nuevo o por cerrar el visor
    }
    if (vista.tarea !== tarea) return;
    vista.tarea = undefined;
    // Las páginas pueden no ser todas del mismo tamaño: se ajusta el marco a la real.
    vista.el.style.width = `${viewport.width}px`;
    vista.el.style.height = `${viewport.height}px`;
    vista.el.replaceChildren(lienzo);
    vista.canvas = lienzo;
    vista.dibujadaA = capa.escala;
  }

  private liberarPagina(vista: PaginaVista): void {
    vista.tarea?.cancel();
    vista.tarea = undefined;
    if (vista.canvas) {
      vista.canvas.width = 0;
      vista.canvas.height = 0;
      vista.canvas = undefined;
      vista.dibujadaA = undefined;
      vista.el.replaceChildren();
    }
  }

  private liberarCapa(capa: Capa): void {
    for (const p of capa.paginas) this.liberarPagina(p);
  }

  private observarVisibles(doc: PDFDocumentProxy, capa: Capa): void {
    this.observadorVisibles = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          const vista = capa.paginas[Number((entrada.target as HTMLElement).dataset.n) - 1];
          if (!vista || capa !== this.capa) continue;
          if (entrada.isIntersecting) void this.dibujar(doc, capa, vista);
          else this.liberarPagina(vista);
        }
      },
      { root: this.raiz, rootMargin: MARGEN_OBSERVADOR },
    );
    for (const p of capa.paginas) this.observadorVisibles.observe(p.el);
  }

  // ---------- eventos ----------

  private alScroll = (): void => {
    if (this.cuadroScroll) return;
    this.cuadroScroll = this.ventana.requestAnimationFrame(() => {
      this.cuadroScroll = 0;
      this.actualizarPaginaActual();
    });
  };

  private actualizarPaginaActual(): void {
    const paginas = this.capa?.paginas;
    if (!paginas?.length) return;
    // Primera página cuyo borde inferior pasa del 35 % de la altura visible.
    const limite = this.raiz.scrollTop + this.raiz.clientHeight * 0.35;
    let desde = 0;
    let hasta = paginas.length - 1;
    while (desde < hasta) {
      const medio = (desde + hasta) >> 1;
      const el = paginas[medio]!.el;
      if (el.offsetTop + el.offsetHeight < limite) desde = medio + 1;
      else hasta = medio;
    }
    const nueva = desde + 1;
    if (nueva !== this.pagina) {
      this.pagina = nueva;
      this.notificar();
    }
  }

  private alCambiarTamano(forzar = false): void {
    if (!this.doc) return;
    clearTimeout(this.temporizadorTamano);
    this.temporizadorTamano = setTimeout(() => {
      const ancho = this.raiz.clientWidth;
      const cambioAncho = this.modo === 'ancho' && Math.abs(ancho - this.anchoUsado) > 1;
      const cambioDpr = this.dpr() !== this.dprUsado;
      const sinVista = !this.capa;
      if (forzar || cambioAncho || cambioDpr || sinVista) {
        void this.reconstruir(this.posicionActual(), ++this.generacion);
      }
    }, 120);
  }

  dispose(): void {
    this.destruido = true;
    this.generacion++;
    clearTimeout(this.temporizadorTamano);
    if (this.cuadroScroll) this.ventana.cancelAnimationFrame(this.cuadroScroll);
    this.raiz.removeEventListener('scroll', this.alScroll);
    this.observadorTamano?.disconnect();
    this.observadorVisibles?.disconnect();
    if (this.capa) this.liberarCapa(this.capa);
    void this.doc?.loadingTask.destroy();
    this.doc = undefined;
    this.capa = undefined;
  }
}
