// SPDX-License-Identifier: AGPL-3.0-or-later
// Autoguardado barato: agrupa las escrituras de cada archivo (400 ms de calma; nunca más de 2 s sin guardar).
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
  protegerSalida(ventana?: Pick<Window, 'addEventListener' | 'removeEventListener'>): () => void;
  /** Cancela los temporizadores (no guarda). */
  cerrar(): void;
}

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

  return {
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
        void this.guardarTodo();
        // El navegador muestra su propio aviso (el texto no es configurable).
        evento.preventDefault();
        (evento as BeforeUnloadEvent).returnValue = '';
      };
      ventana.addEventListener('beforeunload', alSalir);
      return () => ventana.removeEventListener('beforeunload', alSalir);
    },

    cerrar() {
      for (const e of pendientes.values()) if (e.temporizador !== undefined) clearTimeout(e.temporizador);
      pendientes.clear();
      oyentes.clear();
    },
  };
}
