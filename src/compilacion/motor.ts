// SPDX-License-Identifier: AGPL-3.0-or-later
// Motor (hilo principal): API con promesas sobre el worker de BusyTeX. Bajo nivel: no decide qué pasos
// correr (eso es del orquestador, sesión 06); solo monta archivos y ejecuta comandos sueltos, uno a la vez.
import { t } from '../textos/t';
import { BUSYTEX_BASE, CATALOGO_BASICO, ESPEJO_URL } from './config';
import type {
  ArchivoProyecto,
  CodigoErrorWorker,
  ArchivoRemoto,
  Datos,
  EventosMotor,
  Peticion,
  PeticionSinId,
  Respuesta,
  ResultadoEjecucion,
} from './tipos';

/** Lo que otras piezas (p. ej. el orquestador) necesitan de un motor; permite sustituirlo por uno falso en pruebas. */
export interface PuertoMotor {
  montar(archivos: ArchivoProyecto[], directorio?: string): Promise<void>;
  ejecutar(cmd: string[], opciones?: { enVivo?: boolean }): Promise<ResultadoEjecucion>;
  leer(ruta: string): Promise<Uint8Array | null>;
  existe(ruta: string): Promise<boolean>;
}

/**
 * `cancelado`: `cancelar()`. `worker`: el worker murió. `abortado`: el WASM abortó (memoria, pila): se descarta el worker.
 * `peticion`: error de una operación concreta. El resto llega del adaptador (`CodigoErrorWorker`).
 */
export type CodigoErrorMotor = 'cancelado' | 'worker' | 'abortado' | 'peticion' | CodigoErrorWorker;

function textoDeError(codigo: CodigoErrorMotor): string {
  switch (codigo) {
    case 'cancelado':
      return t('errores.motor.cancelado');
    case 'worker':
      return t('errores.motor.worker');
    case 'abortado':
      return t('errores.motor.abortado');
    case 'no_listo':
      return t('errores.motor.no_listo');
    case 'sin_montar':
      return t('errores.motor.sin_montar');
    case 'ruta_no_permitida':
      return t('errores.motor.ruta_no_permitida');
    case 'peticion':
      return t('errores.motor.peticion');
  }
}

/**
 * Error del motor. `message` es el texto de interfaz (en español, de `es.toml`) según `codigo`;
 * `detalle` es el mensaje técnico original, solo para la consola o el informe de errores.
 */
export class ErrorMotor extends Error {
  constructor(
    public readonly codigo: CodigoErrorMotor,
    public readonly detalle = '',
  ) {
    super(textoDeError(codigo));
    this.name = 'ErrorMotor';
  }
}

/** Conexión con el worker; en pruebas se sustituye por una falsa. */
export interface Canal {
  enviar(peticion: Peticion): void;
  terminar(): void;
}
export type CrearCanal = (
  alRecibir: (respuesta: Respuesta) => void,
  alFallar: (mensaje: string) => void,
) => Canal;

export interface OpcionesMotor {
  /** Carpeta de los activos de BusyTeX (por omisión `BUSYTEX_BASE`); puede ser relativa a la página. */
  base?: string;
  /** Espejo de TeX Live (por omisión `ESPEJO_URL`); `null` para no usar ninguno. */
  espejo?: string | null;
  /** Paquetes de datos; por omisión solo `basic`. */
  catalogo?: string[];
  eventos?: Partial<EventosMotor>;
  crearCanal?: CrearCanal;
}

const crearCanalWorker: CrearCanal = (alRecibir, alFallar) => {
  // Worker clásico: el build lo empaqueta con `worker.format: 'iife'` (ver vite.config.ts).
  const worker = new Worker(new URL('./worker/motor.worker.ts', import.meta.url));
  worker.onmessage = (evento: MessageEvent<Respuesta>) => alRecibir(evento.data);
  worker.onerror = (evento) => {
    evento.preventDefault();
    alFallar(evento.message || 'worker error');
  };
  return { enviar: (peticion) => worker.postMessage(peticion), terminar: () => worker.terminate() };
};

function urlAbsoluta(url: string): string {
  const base = globalThis.document?.baseURI ?? globalThis.location?.href ?? 'http://localhost/';
  return new URL(url, base).href.replace(/\/$/, '');
}

interface Pendiente {
  resolver: (datos: Datos) => void;
  rechazar: (error: Error) => void;
}

export class Motor implements PuertoMotor {
  private canal: Canal | null = null;
  private versiones: Promise<Record<string, string>> | null = null;
  private siguienteId = 1;
  /** Cambia cada vez que se descarta el worker; lo que llega de un worker de otra generación se ignora. */
  private generacion = 0;
  /** Por qué se descartó el worker actual (lo que esperaba en cola falla con ese código). */
  private motivo: CodigoErrorMotor = 'cancelado';
  private readonly pendientes = new Map<number, Pendiente>();
  private cola: Promise<unknown> = Promise.resolve();
  private readonly eventos: Partial<EventosMotor>;
  private readonly crearCanal: CrearCanal;
  private readonly base: string;
  private readonly espejo: string | undefined;
  private readonly catalogo: string[];

  constructor(opciones: OpcionesMotor = {}) {
    this.eventos = opciones.eventos ?? {};
    this.crearCanal = opciones.crearCanal ?? crearCanalWorker;
    this.base = urlAbsoluta(opciones.base ?? BUSYTEX_BASE);
    const espejo = opciones.espejo === undefined ? ESPEJO_URL : opciones.espejo;
    this.espejo = espejo ? urlAbsoluta(espejo) : undefined;
    this.catalogo = opciones.catalogo ?? CATALOGO_BASICO;
  }

  /** Prepara el worker (descarga o lee de IndexedDB el paquete `basic`). Es perezoso: las demás llamadas lo invocan. */
  iniciar(): Promise<Record<string, string>> {
    return this.enSerie(() => this.asegurar());
  }

  montar(archivos: ArchivoProyecto[], directorio?: string): Promise<void> {
    return this.enSerie(async () => {
      await this.asegurar();
      await this.pedir({ tipo: 'montar', archivos, directorio });
    });
  }

  ejecutar(cmd: string[], opciones: { enVivo?: boolean } = {}): Promise<ResultadoEjecucion> {
    return this.enSerie(async () => {
      await this.asegurar();
      const datos = await this.pedir({ tipo: 'ejecutar', cmd, enVivo: opciones.enVivo });
      if (datos.de !== 'ejecutar') throw new ErrorMotor('peticion', 'unexpected worker response');
      return datos.resultado;
    });
  }

  leer(ruta: string): Promise<Uint8Array | null> {
    return this.enSerie(async () => {
      await this.asegurar();
      const datos = await this.pedir({ tipo: 'leer', ruta });
      if (datos.de !== 'leer') throw new ErrorMotor('peticion', 'unexpected worker response');
      return datos.contenido;
    });
  }

  existe(ruta: string): Promise<boolean> {
    return this.enSerie(async () => {
      await this.asegurar();
      const datos = await this.pedir({ tipo: 'existe', ruta });
      if (datos.de !== 'existe') throw new ErrorMotor('peticion', 'unexpected worker response');
      return datos.existe;
    });
  }

  registrarRemotos(archivos: ArchivoRemoto[]): Promise<void> {
    return this.enSerie(async () => {
      await this.asegurar();
      await this.pedir({ tipo: 'registrarRemotos', archivos });
    });
  }

  registrarFallos(claves: string[]): Promise<void> {
    return this.enSerie(async () => {
      await this.asegurar();
      await this.pedir({ tipo: 'registrarFallos', claves });
    });
  }

  /**
   * Detiene el worker de inmediato. Lo que estaba en curso o en cola falla con `ErrorMotor('cancelado')`.
   * El sistema de archivos montado se pierde: la próxima llamada crea un worker nuevo
   * (el paquete `basic` sale de IndexedDB) y hay que volver a montar.
   */
  cancelar(): void {
    this.descartar('cancelado');
  }

  /** Termina el worker (si hay) y rechaza lo pendiente con `codigo`. La próxima llamada crea uno nuevo. */
  private descartar(codigo: CodigoErrorMotor, detalle?: string): void {
    this.generacion++;
    this.motivo = codigo;
    const canal = this.canal;
    this.canal = null;
    this.versiones = null;
    canal?.terminar();
    for (const pendiente of this.pendientes.values()) pendiente.rechazar(new ErrorMotor(codigo, detalle));
    this.pendientes.clear();
  }

  /** Una operación a la vez; las que esperaban cuando se cancela fallan sin ejecutarse. */
  private enSerie<T>(tarea: () => Promise<T>): Promise<T> {
    const generacion = this.generacion;
    const resultado = this.cola.then(() => {
      if (generacion !== this.generacion) throw new ErrorMotor(this.motivo);
      return tarea();
    });
    this.cola = resultado.catch(() => undefined);
    return resultado;
  }

  private asegurar(): Promise<Record<string, string>> {
    if (this.canal && this.versiones) return this.versiones;
    const generacion = this.generacion;
    // Los eventos de un worker ya descartado (generación vieja) no deben tocar al nuevo.
    this.canal = this.crearCanal(
      (respuesta) => {
        if (generacion === this.generacion) this.recibir(respuesta);
      },
      (mensaje) => {
        if (generacion === this.generacion) this.descartar('worker', mensaje);
      },
    );
    const iniciando = this.pedir({
      tipo: 'iniciar',
      base: this.base,
      catalogo: this.catalogo,
      espejo: this.espejo,
    }).then((datos) => (datos.de === 'iniciar' ? datos.versiones : {}));
    this.versiones = iniciando;
    iniciando.catch(() => {
      // Si falló el arranque (no si se canceló), se descarta el worker para que el próximo intento empiece de cero.
      if (generacion === this.generacion) this.cancelar();
    });
    return iniciando;
  }

  private pedir(peticion: PeticionSinId): Promise<Datos> {
    const canal = this.canal;
    if (!canal) return Promise.reject(new ErrorMotor(this.motivo));
    const id = this.siguienteId++;
    return new Promise<Datos>((resolver, rechazar) => {
      this.pendientes.set(id, { resolver, rechazar });
      canal.enviar({ ...peticion, id } as Peticion);
    });
  }

  private recibir(respuesta: Respuesta): void {
    switch (respuesta.tipo) {
      case 'progreso':
        this.eventos.progreso?.(respuesta.cargado, respuesta.total);
        return;
      case 'salida':
        this.eventos.salida?.(respuesta.texto);
        return;
      case 'listo':
        this.cerrar(respuesta.id, (p) => p.resolver({ de: 'iniciar', versiones: respuesta.versiones }));
        return;
      case 'resultado':
        this.cerrar(respuesta.id, (p) => p.resolver(respuesta.datos));
        return;
      case 'error':
        this.cerrar(respuesta.id, (p) =>
          p.rechazar(new ErrorMotor(respuesta.codigo ?? 'peticion', respuesta.mensaje)),
        );
        // El WASM abortó: el módulo no sirve para nada más. Se descarta; la siguiente llamada recrea el worker.
        if (respuesta.codigo === 'abortado') this.descartar('abortado', respuesta.mensaje);
        return;
    }
  }

  private cerrar(id: number, accion: (pendiente: Pendiente) => void): void {
    const pendiente = this.pendientes.get(id);
    if (!pendiente) return;
    this.pendientes.delete(id);
    accion(pendiente);
  }
}
