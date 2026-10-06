// SPDX-License-Identifier: AGPL-3.0-or-later
// Protocolo de mensajes entre el hilo principal (Motor) y el worker de BusyTeX.
// Cada petición lleva un `id`; el worker responde con `resultado` o `error` del mismo `id`.

/** Contenido de un archivo del proyecto: texto (UTF-8) o bytes. */
export type Contenido = string | Uint8Array;

export interface ArchivoProyecto {
  /** Ruta relativa a la raíz del proyecto, con `/`. */
  ruta: string;
  contenido: Contenido;
}

/** Archivo del espejo que se registra por adelantado (equivale a haberlo pedido ya al endpoint). */
export interface ArchivoRemoto {
  name: string;
  /** Número de formato de kpathsea; si falta, 26 (`.tex`). */
  format?: number;
  contents: Uint8Array | string;
}

export type Peticion =
  | { tipo: 'iniciar'; id: number; base: string; catalogo: string[]; espejo?: string }
  | { tipo: 'montar'; id: number; archivos: ArchivoProyecto[]; directorio?: string }
  | { tipo: 'ejecutar'; id: number; cmd: string[]; enVivo?: boolean }
  | { tipo: 'leer'; id: number; ruta: string }
  | { tipo: 'existe'; id: number; ruta: string }
  | { tipo: 'registrarRemotos'; id: number; archivos: ArchivoRemoto[] }
  | { tipo: 'registrarFallos'; id: number; claves: string[] };

/** Petición sin `id` (el Motor lo asigna). */
export type PeticionSinId = Peticion extends infer P ? (P extends Peticion ? Omit<P, 'id'> : never) : never;

export interface ResultadoEjecucion {
  /** Código de salida real del programa (no el «efectivo» de BusyTeX). */
  codigo: number;
  stdout: string;
  stderr: string;
  /** Contenido de la bitácora del programa (`.log` de TeX, `.blg` de BibTeX, `.ilg` de makeindex), si existe. */
  log: string;
  /** Milisegundos que tardó el programa. */
  ms: number;
}

export type Datos =
  | { de: 'iniciar'; versiones: Record<string, string> }
  | { de: 'montar' }
  | { de: 'ejecutar'; resultado: ResultadoEjecucion }
  | { de: 'leer'; contenido: Uint8Array | null }
  | { de: 'existe'; existe: boolean }
  | { de: 'registrarRemotos' }
  | { de: 'registrarFallos' };

export type Respuesta =
  | { tipo: 'progreso'; cargado: number; total: number }
  | { tipo: 'listo'; id: number; versiones: Record<string, string> }
  | { tipo: 'salida'; texto: string }
  | { tipo: 'resultado'; id: number; datos: Datos }
  | { tipo: 'error'; id: number; mensaje: string };

/** Escuchas que el Motor ofrece al resto de la aplicación. */
export interface EventosMotor {
  /** Progreso de la descarga de los activos (en bytes) la primera vez. */
  progreso: (cargado: number, total: number) => void;
  /** Salida en vivo de TeX (solo si la ejecución pidió `enVivo`) y avisos del motor. */
  salida: (texto: string) => void;
}
