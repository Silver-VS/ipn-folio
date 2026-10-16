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
  /** `true` si `enPapelera` se midió con la hora confiable (D29, detalle i); ausente en los activos. */
  enPapeleraConfiable?: boolean;
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

export type ClaseElemento = 'proyecto' | 'carpeta' | 'archivo';

/** Un elemento de la papelera única (D29): proyecto, carpeta o archivo borrado. */
export interface ElementoPapelera {
  /** UUID del registro de `papelera`, o `proyecto:<proyectoId>` para los proyectos. */
  id: string;
  clase: ClaseElemento;
  proyectoId: string;
  /** Para mostrar «capitulos/intro.tex · Reporte de práctica 3». */
  nombreProyecto: string;
  /** Ruta original (carpeta o archivo); ausente en los proyectos. */
  ruta?: string;
  /** Entrada a la papelera (ms). Con `fechaConfiable` es hora confiable; si no, el reloj del equipo. */
  fecha: number;
  fechaConfiable: boolean;
  /** Bytes (proyecto: suma de sus archivos y de sus elementos en la papelera). */
  tamano: number;
  /** Archivos que contiene. */
  cuantos: number;
  /** Solo proyectos: cuántos archivos o carpetas borrados antes viajan con él (ya están sumados en `tamano`). */
  incluye?: number;
}

export interface ResultadoRestaurar {
  proyectoId: string;
  rutas: Array<{ original: string; final: string }>;
}

export type AccionPapelera = 'entra' | 'restaurado' | 'borrado-definitivo';

/** La papelera cambió (entró, se restauró o se borró definitivamente un elemento). Enganche para la sesión de OneDrive. */
export interface EventoCambioPapelera {
  tipo: 'cambio-papelera';
  accion: AccionPapelera;
  elemento: ElementoPapelera;
}

/** Cambios de datos: los únicos que viajan entre pestañas. */
export type EventoCambio = EventoCambioArchivo | EventoCambioProyecto | EventoCambioPapelera;

/** Otra pestaña actualizó la base a una versión más nueva: esta debe guardar y soltarla (M4, `blocking`). */
export interface EventoVersionNueva {
  tipo: 'version-nueva';
}

/** El navegador cerró la conexión con la base (p. ej. por falta de espacio) (M4, `terminated`). */
export interface EventoAlmacenCerrado {
  tipo: 'almacen-cerrado';
}

/** Eventos del ciclo de vida de la conexión, locales a esta pestaña. */
export type EventoCiclo = EventoVersionNueva | EventoAlmacenCerrado;

/** Eventos de la apertura, cuando aún no hay almacén para suscribirse (M4, `blocked`): llegan por `OpcionesAlmacen.alAbrir`. */
export type EventoApertura = { tipo: 'almacen-bloqueado' } | { tipo: 'almacen-liberado' };

export type EventoAlmacen = EventoCambio | EventoCiclo;
export type NombreEvento = EventoAlmacen['tipo'];
export type EventoDe<N extends NombreEvento> = Extract<EventoAlmacen, { tipo: N }>;

export interface Almacen {
  listarProyectos(filtro?: FiltroProyectos): Promise<Proyecto[]>;
  crearProyecto(datos: DatosProyecto, archivosIniciales?: ArchivoInicial[]): Promise<Proyecto>;
  obtenerProyecto(id: string): Promise<Proyecto | undefined>;
  renombrarProyecto(id: string, nombre: string): Promise<void>;
  /** Manda el proyecto a la papelera (D29). Su borrado definitivo es `borrarDefinitivo`. */
  moverAPapelera(id: string): Promise<void>;
  /** Alias de `restaurarDePapelera('proyecto:' + id)`. */
  restaurar(id: string): Promise<void>;

  listarArchivos(id: string): Promise<InfoArchivo[]>;
  leer(id: string, ruta: string): Promise<ArchivoProyecto | undefined>;
  escribir(id: string, ruta: string, contenido: Contenido): Promise<void>;
  /** Renombra o mueve un archivo o una carpeta completa, de forma atómica. */
  renombrar(id: string, rutaVieja: string, rutaNueva: string): Promise<void>;
  /**
   * Manda un archivo o una carpeta completa a la papelera, en una sola transacción: sus archivos salen de
   * `archivos` y quedan en la papelera con su contenido.
   */
  moverArchivosAPapelera(id: string, ruta: string): Promise<ElementoPapelera>;

  /** Proyectos en la papelera y archivos o carpetas borrados de proyectos activos; lo más reciente primero. */
  listarPapelera(): Promise<ElementoPapelera[]>;
  /**
   * Devuelve un elemento a su ruta original; si está ocupada usa un nombre nuevo (`nombre (2).ext`) sin pisar nada.
   * Errores: `proyecto_en_papelera`, `elemento_inexistente`.
   */
  restaurarDePapelera(elementoId: string): Promise<ResultadoRestaurar>;
  /** Borra un elemento de la papelera para siempre (con sus archivos). */
  borrarDefinitivo(elementoId: string): Promise<void>;
  /** Borra para siempre todo lo que hay en la papelera; devuelve cuántos elementos tenía. */
  vaciarPapelera(): Promise<number>;
  /**
   * Borra para siempre lo que lleva en la papelera más de `dias` + el margen, medido con la hora confiable. Sin
   * hora confiable no borra nada. Antes vuelve a sellar los elementos con fecha no confirmada o futura.
   */
  purgarCaducados(dias: number): Promise<ElementoPapelera[]>;

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
  /**
   * Hora confiable (ms) o `undefined` si aún no hay (D29, detalle i). Con ella se sella la entrada a la papelera y
   * se decide la purga; sin ella, la entrada usa `ahora()` y queda marcada como no confiable.
   */
  horaConfiable?: () => number | undefined;
  /** Margen (días) que se suma a la caducidad al purgar; 1 por omisión (D29). */
  margenDias?: number;
  /** Recibe los avisos de la apertura (`blocked`), cuando aún no hay almacén para suscribirse. */
  alAbrir?: (evento: EventoApertura) => void;
  /** Nombre de la base de datos de IndexedDB (pruebas). */
  nombreBD?: string;
  /**
   * Solo pruebas: se llama antes de mover cada archivo en `renombrar`; si lanza, la operación debe
   * deshacerse por completo.
   */
  inyectarFallo?: (operacion: 'renombrar' | 'papelera' | 'restaurar', indice: number) => void;
}

export type FabricaAlmacen = (opciones?: OpcionesAlmacen) => Promise<Almacen>;

/** Clave del ajuste «solo con Wi-Fi» (D15); vale `true` por omisión. */
export const AJUSTE_SOLO_WIFI = 'soloWifi';
