// SPDX-License-Identifier: AGPL-3.0-or-later
// Catálogo de herramientas de Folio (D11, D12). En la capa A solo «Documentos LaTeX» es instalable; las demás se
// muestran como «Próximamente» (capas B y C) o «App de escritorio» (D12) y no descargan nada.
// Los tamaños salen de tamanos.gen.json (medidos por `npm run activos`): ningún texto lleva cifras fijas.
import { t } from '../textos/t';
import tamanos from './tamanos.gen.json';

export type IdHerramienta = 'latex' | 'python' | 'r' | 'octave' | 'cpp' | 'java';
export type Disponibilidad = 'instalable' | 'proximamente' | 'escritorio';

/** Un archivo que forma parte de la herramienta; `destino` dice dónde queda después de instalarla. */
export interface ArchivoHerramienta {
  nombre: string;
  bytes: number;
  destino: 'cache' | 'indexeddb';
}

export interface Herramienta {
  id: IdHerramienta;
  disponibilidad: Disponibilidad;
  /** Archivos que se descargan; vacío si no es instalable. Las rutas son relativas a la carpeta de BusyTeX. */
  archivos: readonly ArchivoHerramienta[];
  /** Bytes totales de la descarga (0 si no es instalable). */
  bytes: number;
}

export const CATALOGO: readonly Herramienta[] = [
  {
    id: 'latex',
    disponibilidad: 'instalable',
    archivos: tamanos.latex.archivos as readonly ArchivoHerramienta[],
    bytes: tamanos.latex.bytes,
  },
  { id: 'python', disponibilidad: 'proximamente', archivos: [], bytes: 0 },
  { id: 'r', disponibilidad: 'proximamente', archivos: [], bytes: 0 },
  { id: 'octave', disponibilidad: 'proximamente', archivos: [], bytes: 0 },
  { id: 'cpp', disponibilidad: 'escritorio', archivos: [], bytes: 0 },
  { id: 'java', disponibilidad: 'escritorio', archivos: [], bytes: 0 },
];

export function herramienta(id: IdHerramienta): Herramienta {
  const h = CATALOGO.find((x) => x.id === id);
  if (!h) throw new Error(`catalogo.ts: la herramienta «${id}» no existe`);
  return h;
}

/** Megas decimales redondeados, para el texto «unos {megas} MB». Mínimo 1. */
export function megasDe(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1e6));
}

/** Variable `{megas}` de la herramienta (0 si no es instalable). */
export function megasDeHerramienta(id: IdHerramienta): number {
  const h = herramienta(id);
  return h.bytes > 0 ? megasDe(h.bytes) : 0;
}

export interface TextosHerramienta {
  nombre: string;
  sigla: string;
  descripcion: string;
}

/** Textos de una herramienta (claves literales para que `npm run contenido` las verifique). */
export function textosDe(id: IdHerramienta): TextosHerramienta {
  switch (id) {
    case 'latex':
      return {
        nombre: t('herramientas.latex.nombre'),
        sigla: t('herramientas.latex.sigla'),
        descripcion: t('herramientas.latex.descripcion'),
      };
    case 'python':
      return {
        nombre: t('herramientas.python.nombre'),
        sigla: t('herramientas.python.sigla'),
        descripcion: t('herramientas.python.descripcion'),
      };
    case 'r':
      return {
        nombre: t('herramientas.r.nombre'),
        sigla: t('herramientas.r.sigla'),
        descripcion: t('herramientas.r.descripcion'),
      };
    case 'octave':
      return {
        nombre: t('herramientas.octave.nombre'),
        sigla: t('herramientas.octave.sigla'),
        descripcion: t('herramientas.octave.descripcion'),
      };
    case 'cpp':
      return {
        nombre: t('herramientas.cpp.nombre'),
        sigla: t('herramientas.cpp.sigla'),
        descripcion: t('herramientas.cpp.descripcion'),
      };
    case 'java':
      return {
        nombre: t('herramientas.java.nombre'),
        sigla: t('herramientas.java.sigla'),
        descripcion: t('herramientas.java.descripcion'),
      };
  }
}
