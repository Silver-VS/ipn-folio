// SPDX-License-Identifier: AGPL-3.0-or-later
// Autoguardado barato: agrupa las escrituras de cada archivo (400 ms de calma; nunca más de 2 s sin guardar).
import { estaBajo, normalizarRuta } from './rutas';
import type { Almacen, Contenido } from './tipos';

export type EstadoAutoguardado = 'guardado' | 'pendiente' | 'error';

export interface OpcionesAutoguardado {
  /** Milisegundos de calma antes de guardar (400 por omisión). */
  espera?: number;
  /** Máximo de milisegundos que un cambio puede esperar sin guardarse (2000 por omisión). */
  maximo?: number;
  ahora?: () => number;
}

export interface Autoguardado {
  /** Anota el contenido más reciente de un archivo; se guarda solo. */
  programar(proyectoId: string, ruta: string, contenido: Contenido): void;
  /** Guarda de inmediato todo lo pendiente (y reintenta lo que falló). */
  guardarTodo(): Promise<void>;
  readonly estado: EstadoAutoguardado;
  /** Marca de tiempo del último guardado correcto, o `undefined` si aún no hubo ninguno. */
  readonly ultimoGuardado: number | undefined;
  /** Notifica cada cambio de `estado` o de `ultimoGuardado`; devuelve la función para cancelar. */
  alCambiar(fn: () => void): () => void;
  /**
   * Conecta el aviso de salida: con cambios sin guardar intenta guardarlos y pide confirmación al navegador.
   * Devuelve la función para desconectar.
   */
  protegerSalida(ventana?: VentanaProtegible): () => void;
  /**
   * Cancela lo pendiente (y lo fallido) de `ruta` y de todo lo que cuelga de ella. Úsalo cuando el archivo ya no
   * existe; no guarda nada.
   */
  descartar(proyectoId: string, ruta: string): void;
  /**
   * Renombra un archivo o carpeta en el almacén sin que un guardado pendiente resucite la ruta vieja: primero
   * guarda lo pendiente de esa ruta (así viaja con el renombrado) y después renombra. Lo fallido se redirige.
   */
  renombrar(proyectoId: string, rutaVieja: string, rutaNueva: string): Promise<void>;
  /** Borra un archivo o carpeta del almacén descartando antes lo pendiente que cuelga de él. */
  borrar(proyectoId: string, ruta: string): Promise<void>;
  /** Guarda lo pendiente del proyecto y lo manda a la papelera (si no, el guardado fallaría después). */
  moverAPapelera(proyectoId: string): Promise<void>;
  /** Cancela los temporizadores (no guarda). */
  cerrar(): void;
}

/** Lo mínimo que necesita `protegerSalida` de `window` (y de `window.document`, si existe). */
export type VentanaProtegible = Pick<Window, 'addEventListener' | 'removeEventListener'> & {
  document?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
};

interface Entrada {
  proyectoId: string;
  ruta: string;
  contenido: Contenido;
  primero: number;
  temporizador: ReturnType<typeof setTimeout> | undefined;
}

export function crearAutoguardado(almacen: Almacen, opciones: OpcionesAutoguardado = {}): Autoguardado {
  const espera = opciones.espera ?? 400;
  const maximo = opciones.maximo ?? 2000;
  const ahora = opciones.ahora ?? Date.now;

  const pendientes = new Map<string, Entrada>();
  const fallidos = new Map<string, Entrada>();
  let enCurso = 0;
  let ultimo: number | undefined;
  let hayError = false;
  const oyentes = new Set<() => void>();
  let estadoPrevio: EstadoAutoguardado = 'guardado';
  // Escrituras de un mismo archivo en orden: una nueva espera a que termine la anterior.
  const cadenas = new Map<string, Promise<void>>();

  const clave = (id: string, ruta: string) => `${id}\u0000${ruta}`;
  const calcularEstado = (): EstadoAutoguardado =>
    pendientes.size > 0 || enCurso > 0 ? 'pendiente' : hayError || fallidos.size > 0 ? 'error' : 'guardado';
  const notificar = () => {
    for (const fn of oyentes) fn();
  };
  const avisarSiCambio = () => {
    const nuevo = calcularEstado();
    if (nuevo !== estadoPrevio) {
      estadoPrevio = nuevo;
      notificar();
    }
  };

  function escribirEntrada(k: string, e: Entrada): Promise<void> {
    enCurso++;
    const previa = cadenas.get(k) ?? Promise.resolve();
    const actual = previa.then(async () => {
      try {
        await almacen.escribir(e.proyectoId, e.ruta, e.contenido);
        fallidos.delete(k);
        ultimo = ahora();
        hayError = fallidos.size > 0;
      } catch {
        // Se conserva para reintentar con `guardarTodo` o con el siguiente cambio del archivo.
        if (!pendientes.has(k)) fallidos.set(k, e);
        hayError = true;
      } finally {
        enCurso--;
        if (cadenas.get(k) === actual) cadenas.delete(k);
        estadoPrevio = calcularEstado();
        notificar();
      }
    });
    cadenas.set(k, actual);
    return actual;
  }

  function vaciar(k: string): Promise<void> {
    const e = pendientes.get(k);
    if (!e) return Promise.resolve();
    if (e.temporizador !== undefined) clearTimeout(e.temporizador);
    pendientes.delete(k);
    return escribirEntrada(k, e);
  }

  /** Entradas (pendientes o fallidas) de un proyecto; con `base`, solo las de esa ruta y lo que cuelga de ella. */
  const afectadas = (proyectoId: string, base?: string) => {
    const coincide = (e: Entrada) => e.proyectoId === proyectoId && (base === undefined || estaBajo(e.ruta, base));
    return {
      pendientes: [...pendientes].filter(([, e]) => coincide(e)).map(([k]) => k),
      fallidos: [...fallidos].filter(([, e]) => coincide(e)),
    };
  };

  /** Guarda lo pendiente (y reintenta lo fallido) de la ruta y espera a que terminen las escrituras en curso. */
  async function vaciarAfectadas(proyectoId: string, base?: string): Promise<void> {
    for (const [k, e] of afectadas(proyectoId, base).fallidos) {
      fallidos.delete(k);
      if (!pendientes.has(k)) pendientes.set(k, { ...e, primero: ahora(), temporizador: undefined });
    }
    await Promise.all(afectadas(proyectoId, base).pendientes.map(vaciar));
    await Promise.all([...cadenas.values()]);
  }

  function descartar(proyectoId: string, base?: string): void {
    const a = afectadas(proyectoId, base);
    for (const k of a.pendientes) {
      const e = pendientes.get(k)!;
      if (e.temporizador !== undefined) clearTimeout(e.temporizador);
      pendientes.delete(k);
    }
    for (const [k] of a.fallidos) fallidos.delete(k);
    if (fallidos.size === 0) hayError = false;
    avisarSiCambio();
  }

  const api: Autoguardado = {
    programar(proyectoId, ruta, contenido) {
      const k = clave(proyectoId, ruta);
      const t = ahora();
      const previa = pendientes.get(k);
      if (previa?.temporizador !== undefined) clearTimeout(previa.temporizador);
      fallidos.delete(k);
      const primero = previa?.primero ?? t;
      const espera_efectiva = Math.max(0, Math.min(espera, maximo - (t - primero)));
      const entrada: Entrada = { proyectoId, ruta, contenido, primero, temporizador: undefined };
      entrada.temporizador = setTimeout(() => void vaciar(k), espera_efectiva);
      pendientes.set(k, entrada);
      avisarSiCambio();
    },

    async guardarTodo() {
      for (const [k, e] of [...fallidos]) {
        fallidos.delete(k);
        if (!pendientes.has(k)) pendientes.set(k, { ...e, primero: ahora(), temporizador: undefined });
      }
      await Promise.all([...pendientes.keys()].map(vaciar));
      await Promise.all([...cadenas.values()]);
    },

    get estado() {
      return calcularEstado();
    },
    get ultimoGuardado() {
      return ultimo;
    },

    alCambiar(fn) {
      oyentes.add(fn);
      return () => void oyentes.delete(fn);
    },

    protegerSalida(ventana = window) {
      const alSalir = (evento: Event) => {
        if (calcularEstado() === 'guardado') return;
        void api.guardarTodo();
        // El navegador muestra su propio aviso (el texto no es configurable).
        evento.preventDefault();
        (evento as BeforeUnloadEvent).returnValue = '';
      };
      // En móviles `beforeunload` no es fiable: al cambiar de app o cerrar la pestaña solo se dispara
      // `visibilitychange` (a «hidden») y, a veces, `pagehide`. Ahí se guarda sin pedir confirmación.
      const alOcultar = () => {
        if (ventana.document?.visibilityState === 'hidden' && calcularEstado() !== 'guardado') void api.guardarTodo();
      };
      const alCerrarPagina = () => {
        if (calcularEstado() !== 'guardado') void api.guardarTodo();
      };
      const documento = ventana.document;
      ventana.addEventListener('beforeunload', alSalir);
      ventana.addEventListener('pagehide', alCerrarPagina);
      documento?.addEventListener('visibilitychange', alOcultar);
      return () => {
        ventana.removeEventListener('beforeunload', alSalir);
        ventana.removeEventListener('pagehide', alCerrarPagina);
        documento?.removeEventListener('visibilitychange', alOcultar);
      };
    },

    descartar(proyectoId, ruta) {
      descartar(proyectoId, normalizarRuta(ruta));
    },

    async renombrar(proyectoId, rutaVieja, rutaNueva) {
      const vieja = normalizarRuta(rutaVieja);
      const nueva = normalizarRuta(rutaNueva);
      await vaciarAfectadas(proyectoId, vieja);
      await almacen.renombrar(proyectoId, vieja, nueva);
      // Lo que no se pudo guardar sigue a su archivo y se reintentará en la ruta nueva.
      for (const [k, e] of afectadas(proyectoId, vieja).fallidos) {
        fallidos.delete(k);
        const ruta = nueva + e.ruta.slice(vieja.length);
        fallidos.set(clave(proyectoId, ruta), { ...e, ruta });
      }
      avisarSiCambio();
    },

    async borrar(proyectoId, ruta) {
      const r = normalizarRuta(ruta);
      descartar(proyectoId, r);
      await Promise.all([...cadenas.values()]);
      await almacen.borrar(proyectoId, r);
    },

    async moverAPapelera(proyectoId) {
      await vaciarAfectadas(proyectoId);
      // Lo que siga fallando ya no se puede guardar en un proyecto en la papelera: se descarta.
      descartar(proyectoId);
      await almacen.moverAPapelera(proyectoId);
    },

    cerrar() {
      for (const e of pendientes.values()) if (e.temporizador !== undefined) clearTimeout(e.temporizador);
      pendientes.clear();
      oyentes.clear();
    },
  };
  return api;
}
