// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrato de la capa de almacenamiento local (D3, D23). Todas las implementaciones cumplen la misma interfaz
// `Almacen`, así que cambiar IndexedDB por OPFS (u otro motor) no toca al resto de la aplicación.

export type TipoArchivo = 'texto' | 'binario';
export type Contenido = string | Uint8Array;
export type Motor = 'pdflatex';

export interface Proyecto {
  id: string;
  nombre: string;
  creado: number;
  modificado: number;
  /** Ruta del archivo raíz que se compila. */
  principal: string;
  motor: Motor;
  plantilla?: string;
  /** Marca de tiempo en que pasó a la papelera; ausente si está activo. */
  enPapelera?: number;
}

export interface DatosProyecto {
  nombre: string;
  principal?: string;
  motor?: Motor;
  plantilla?: string;
}

export interface ArchivoProyecto {
  proyectoId: string;
  ruta: string;
  tipo: TipoArchivo;
  /** Texto para las extensiones de texto; bytes para el resto. */
  contenido: Contenido;
  modificado: number;
  /** Tamaño en bytes (UTF-8 en los archivos de texto). */
  tamano: number;
}

/** Un archivo sin su contenido, para listar árboles sin cargar imágenes en memoria. */
export type InfoArchivo = Omit<ArchivoProyecto, 'contenido'>;

export interface ArchivoInicial {
  ruta: string;
  contenido: Contenido;
}

export type FiltroProyectos = 'activos' | 'papelera' | 'todos';

export interface EventoCambioArchivo {
  tipo: 'cambio-archivo';
  proyectoId: string;
  ruta: string;
}

export interface EventoCambioProyecto {
  tipo: 'cambio-proyecto';
  proyectoId: string;
}

export type EventoAlmacen = EventoCambioArchivo | EventoCambioProyecto;
export type NombreEvento = EventoAlmacen['tipo'];
export type EventoDe<N extends NombreEvento> = Extract<EventoAlmacen, { tipo: N }>;

export interface Almacen {
  listarProyectos(filtro?: FiltroProyectos): Promise<Proyecto[]>;
  crearProyecto(datos: DatosProyecto, archivosIniciales?: ArchivoInicial[]): Promise<Proyecto>;
  obtenerProyecto(id: string): Promise<Proyecto | undefined>;
  renombrarProyecto(id: string, nombre: string): Promise<void>;
  /** Solo papelera: el borrado definitivo no existe en esta capa. */
  moverAPapelera(id: string): Promise<void>;
  restaurar(id: string): Promise<void>;

  listarArchivos(id: string): Promise<InfoArchivo[]>;
  leer(id: string, ruta: string): Promise<ArchivoProyecto | undefined>;
  escribir(id: string, ruta: string, contenido: Contenido): Promise<void>;
  /** Renombra o mueve un archivo o una carpeta completa, de forma atómica. */
  renombrar(id: string, rutaVieja: string, rutaNueva: string): Promise<void>;
  /** Borra un archivo o una carpeta completa (de un proyecto, no el proyecto). */
  borrar(id: string, ruta: string): Promise<void>;

  leerAjuste<T = unknown>(clave: string): Promise<T | undefined>;
  guardarAjuste(clave: string, valor: unknown): Promise<void>;
  leerDistribucion<T = unknown>(clave: string): Promise<T | undefined>;
  guardarDistribucion(clave: string, json: unknown): Promise<void>;
  /** Estado de instalación por herramienta (sesión 07, D11). */
  leerHerramienta<T = unknown>(id: string): Promise<T | undefined>;
  guardarHerramienta(id: string, estado: unknown): Promise<void>;

  /** Suscribe a cambios hechos con ESTA instancia; devuelve la función para cancelar. */
  al<N extends NombreEvento>(evento: N, fn: (e: EventoDe<N>) => void): () => void;
  cerrar(): void;
}

export interface OpcionesAlmacen {
  /** Reloj inyectable (pruebas). */
  ahora?: () => number;
  /** Nombre de la base de datos de IndexedDB (pruebas). */
  nombreBD?: string;
  /**
   * Solo pruebas: se llama antes de mover cada archivo en `renombrar`; si lanza, la operación debe
   * deshacerse por completo.
   */
  inyectarFallo?: (operacion: 'renombrar', indice: number) => void;
}

export type FabricaAlmacen = (opciones?: OpcionesAlmacen) => Promise<Almacen>;

/** Clave del ajuste «solo con Wi-Fi» (D15); vale `true` por omisión. */
export const AJUSTE_SOLO_WIFI = 'soloWifi';
