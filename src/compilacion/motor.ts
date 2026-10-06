// SPDX-License-Identifier: AGPL-3.0-or-later
// Motor (hilo principal): API con promesas sobre el worker de BusyTeX. Bajo nivel: no decide qué pasos
// correr (eso es del orquestador, sesión 06); solo monta archivos y ejecuta comandos sueltos, uno a la vez.
import { BUSYTEX_BASE, CATALOGO_BASICO, ESPEJO_URL } from './config';
import type {
  ArchivoProyecto,
  ArchivoRemoto,
  Datos,
  EventosMotor,
  Peticion,
  PeticionSinId,
  Respuesta,
  ResultadoEjecucion,
} from './tipos';

/** Lo que otras piezas (p. ej. la secuencia) necesitan de un motor; permite sustituirlo por uno falso en pruebas. */
export interface PuertoMotor {
  montar(archivos: ArchivoProyecto[], directorio?: string): Promise<void>;
  ejecutar(cmd: string[], opciones?: { enVivo?: boolean }): Promise<ResultadoEjecucion>;
  leer(ruta: string): Promise<Uint8Array | null>;
  existe(ruta: string): Promise<boolean>;
}

export type CodigoErrorMotor = 'cancelado' | 'worker' | 'peticion';

/** Error del motor; `codigo` permite al orquestador elegir el texto de interfaz (sin texto visible aquí). */
export class ErrorMotor extends Error {
  constructor(
    public readonly codigo: CodigoErrorMotor,
    mensaje: string,
  ) {
    super(mensaje);
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
    alFallar(evento.message || 'El worker de compilación falló.');
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
  private generacion = 0;
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
      if (datos.de !== 'ejecutar') throw new ErrorMotor('peticion', 'Respuesta inesperada del worker.');
      return datos.resultado;
    });
  }

  leer(ruta: string): Promise<Uint8Array | null> {
    return this.enSerie(async () => {
      await this.asegurar();
      const datos = await this.pedir({ tipo: 'leer', ruta });
      if (datos.de !== 'leer') throw new ErrorMotor('peticion', 'Respuesta inesperada del worker.');
      return datos.contenido;
    });
  }

  existe(ruta: string): Promise<boolean> {
    return this.enSerie(async () => {
      await this.asegurar();
      const datos = await this.pedir({ tipo: 'existe', ruta });
      if (datos.de !== 'existe') throw new ErrorMotor('peticion', 'Respuesta inesperada del worker.');
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
    this.generacion++;
    const canal = this.canal;
    this.canal = null;
    this.versiones = null;
    canal?.terminar();
    const error = new ErrorMotor('cancelado', 'Compilación cancelada.');
    for (const pendiente of this.pendientes.values()) pendiente.rechazar(error);
    this.pendientes.clear();
  }

  /** Una operación a la vez; las que esperaban cuando se cancela fallan sin ejecutarse. */
  private enSerie<T>(tarea: () => Promise<T>): Promise<T> {
    const generacion = this.generacion;
    const resultado = this.cola.then(() => {
      if (generacion !== this.generacion) throw new ErrorMotor('cancelado', 'Compilación cancelada.');
      return tarea();
    });
    this.cola = resultado.catch(() => undefined);
    return resultado;
  }

  private asegurar(): Promise<Record<string, string>> {
    if (this.canal && this.versiones) return this.versiones;
    const generacion = this.generacion;
    this.canal = this.crearCanal(
      (respuesta) => this.recibir(respuesta),
      (mensaje) => this.fallar(mensaje),
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
    if (!canal) return Promise.reject(new ErrorMotor('cancelado', 'Compilación cancelada.'));
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
        this.cerrar(respuesta.id, (p) => p.rechazar(new ErrorMotor('peticion', respuesta.mensaje)));
        return;
    }
  }

  private cerrar(id: number, accion: (pendiente: Pendiente) => void): void {
    const pendiente = this.pendientes.get(id);
    if (!pendiente) return;
    this.pendientes.delete(id);
    accion(pendiente);
  }

  /** El worker murió o no pudo cargar: se rechaza todo lo pendiente. */
  private fallar(mensaje: string): void {
    const error = new ErrorMotor('worker', mensaje);
    for (const pendiente of this.pendientes.values()) pendiente.rechazar(error);
    this.pendientes.clear();
    this.canal?.terminar();
    this.canal = null;
    this.versiones = null;
  }
}
