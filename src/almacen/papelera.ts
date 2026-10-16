// SPDX-License-Identifier: AGPL-3.0-or-later
// Funciones puras de la papelera (D29): caducidad, cuándo purgar y tamaño. Sin acceso a la base ni al reloj:
// quien las llama pasa la hora (la confiable, ver hora.ts).
import type { ElementoPapelera } from './tipos';

export const MS_DIA = 86_400_000;
export const MS_HORA = 3_600_000;

/** Instante a partir del cual un elemento que entró en `fecha` se puede borrar: `dias` + el margen. */
export function caducaEl(fecha: number, dias: number, margenDias = 0): number {
  return fecha + (dias + margenDias) * MS_DIA;
}

/** `true` si ya se puede borrar para siempre (`fecha + (dias + margen) · 1 día ≤ hora`). */
export function estaCaducado(fecha: number, dias: number, margenDias: number, hora: number): boolean {
  return caducaEl(fecha, dias, margenDias) <= hora;
}

/** Días enteros (hacia arriba) que faltan para que caduque; 0 si ya caducó. Solo para mostrar «Se borrará…». */
export function diasRestantes(fecha: number, dias: number, ahora: number): number {
  return Math.max(0, Math.ceil((caducaEl(fecha, dias) - ahora) / MS_DIA));
}

/**
 * ¿Toca purgar? La primera vez (sin marca previa) sí; después, cuando pasaron `intervaloMs` desde la última purga.
 * Una marca en el futuro (la hora cambió) también cuenta como «toca», para no quedar sin purgar para siempre.
 */
export function tocaPurgar(ultimaPurga: number | undefined, ahora: number, intervaloMs: number): boolean {
  if (ultimaPurga === undefined || !Number.isFinite(ultimaPurga)) return true;
  return ahora < ultimaPurga || ahora - ultimaPurga >= intervaloMs;
}

/** Suma de bytes de lo que hay en la papelera. */
export function tamanoTotal(elementos: readonly Pick<ElementoPapelera, 'tamano'>[]): number {
  return elementos.reduce((suma, e) => suma + e.tamano, 0);
}

/** ¿Hay que avisar que la papelera ocupa mucho? Por megas absolutos o por fracción del uso total del navegador. */
export function ocupaMucho(
  bytes: number,
  usoTotal: number | undefined,
  avisoMegas: number,
  avisoFraccionUso: number,
): boolean {
  if (bytes <= 0) return false;
  if (bytes >= avisoMegas * 1024 * 1024) return true;
  return usoTotal !== undefined && usoTotal > 0 && bytes >= usoTotal * avisoFraccionUso;
}

/** Ajuste `papelera.dias`: solo se aceptan las opciones configuradas; cualquier otra cosa vale lo de omisión. */
export function diasValidos(valor: unknown, opciones: readonly number[], porOmision: number): number {
  return typeof valor === 'number' && opciones.includes(valor) ? valor : porOmision;
}

/** Elementos que se borrarían ya si la caducidad pasara a `dias`. */
export function caducadosCon(
  elementos: readonly ElementoPapelera[],
  dias: number,
  margenDias: number,
  hora: number,
): ElementoPapelera[] {
  return elementos.filter((e) => e.fechaConfiable && estaCaducado(e.fecha, dias, margenDias, hora));
}

/** Registro de un archivo o carpeta en la papelera (sin contenidos: esos van aparte). */
export interface RegistroPapelera {
  id: string;
  proyectoId: string;
  clase: 'archivo' | 'carpeta';
  /** Ruta original. */
  ruta: string;
  fecha: number;
  fechaConfiable: boolean;
  tamano: number;
  cuantos: number;
}

/** Prefijo del id de los elementos que son proyectos: `proyecto:<proyectoId>`. */
export const PREFIJO_PROYECTO = 'proyecto:';

export const idDeProyecto = (proyectoId: string) => `${PREFIJO_PROYECTO}${proyectoId}`;

/** `proyectoId` si el id es de un proyecto en la papelera. */
export function proyectoDeId(elementoId: string): string | undefined {
  return elementoId.startsWith(PREFIJO_PROYECTO) ? elementoId.slice(PREFIJO_PROYECTO.length) : undefined;
}

/** Sello de entrada: con hora confiable la fecha lo es; si no, es el reloj del equipo y queda sin confirmar. */
export function sellar(
  horaConfiable: number | undefined,
  ahoraLocal: () => number,
): { fecha: number; fechaConfiable: boolean } {
  return horaConfiable !== undefined
    ? { fecha: horaConfiable, fechaConfiable: true }
    : { fecha: ahoraLocal(), fechaConfiable: false };
}

/** ¿Hay que volver a sellar? Fecha sin confirmar, o en el futuro respecto de la hora confiable. */
export function requiereResello(fecha: number, fechaConfiable: boolean, horaConfiable: number): boolean {
  return !fechaConfiable || fecha > horaConfiable;
}

/** Elemento de la papelera que corresponde a un registro. */
export function elementoDeRegistro(r: RegistroPapelera, nombreProyecto: string): ElementoPapelera {
  return {
    id: r.id,
    clase: r.clase,
    proyectoId: r.proyectoId,
    nombreProyecto,
    ruta: r.ruta,
    fecha: r.fecha,
    fechaConfiable: r.fechaConfiable,
    tamano: r.tamano,
    cuantos: r.cuantos,
  };
}

/** Lo más reciente primero (empates por id, para un orden estable). */
export function ordenarPapelera(lista: ElementoPapelera[]): ElementoPapelera[] {
  return lista.sort((a, b) => b.fecha - a.fecha || a.id.localeCompare(b.id));
}
