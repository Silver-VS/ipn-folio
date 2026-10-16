// SPDX-License-Identifier: AGPL-3.0-or-later
import { ErrorAlmacen } from './errores';
import type { ArchivoProyecto, Contenido, InfoArchivo, TipoArchivo } from './tipos';

export const EXTENSIONES_LATEX = new Set(['tex', 'sty', 'cls', 'ltx', 'dtx']);
const EXTENSIONES_TEXTO = new Set([
  ...EXTENSIONES_LATEX,
  'bib',
  'bst',
  'cfg',
  'clo',
  'def',
  'fd',
  'ist',
  'txt',
  'md',
  'csv',
  'dat',
  'm',
  'py',
]);

// Caracteres de control (U+0000–U+001F y U+007F) no permitidos en nombres.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const UNIDAD_WINDOWS = /^[A-Za-z]:/;

/**
 * Normaliza una ruta relativa de proyecto: separador «/», sin «./», sin dobles barras ni «..».
 * Distingue mayúsculas: se guarda tal cual (kpathsea busca sin distinguir; ver PRUEBA-COMPILACION §7).
 * Lanza `ErrorAlmacen('ruta_invalida')` si no es válida.
 */
export function normalizarRuta(ruta: string): string {
  const invalida = () => new ErrorAlmacen('ruta_invalida', { ruta: String(ruta) });
  if (typeof ruta !== 'string' || CONTROL.test(ruta)) throw invalida();
  const unificada = ruta.replace(/\\/g, '/');
  if (unificada.startsWith('/') || UNIDAD_WINDOWS.test(unificada)) throw invalida();
  const partes = unificada
    .split('/')
    .filter((p, i, todas) => !(p === '.' && todas.length > 1 && i < todas.length - 1));
  if (partes.length === 0) throw invalida();
  for (const p of partes) {
    if (p === '' || p === '.' || p === '..') throw invalida();
    if (p.trim() === '' || p.endsWith(' ') || p.endsWith('.')) throw invalida();
  }
  return partes.join('/');
}

export function esRutaValida(ruta: string): boolean {
  try {
    normalizarRuta(ruta);
    return true;
  } catch {
    return false;
  }
}

export function extension(ruta: string): string {
  const nombre = ruta.slice(ruta.lastIndexOf('/') + 1);
  const i = nombre.lastIndexOf('.');
  return i <= 0 ? '' : nombre.slice(i + 1).toLowerCase();
}

export function tipoPorRuta(ruta: string): TipoArchivo {
  return EXTENSIONES_TEXTO.has(extension(ruta)) ? 'texto' : 'binario';
}

const codificador = new TextEncoder();
const decodificador = new TextDecoder('utf-8', { ignoreBOM: true });

export function aBytes(contenido: Contenido): Uint8Array {
  return typeof contenido === 'string' ? codificador.encode(contenido) : contenido;
}

export function aTexto(contenido: Contenido): string {
  return typeof contenido === 'string' ? contenido : decodificador.decode(contenido);
}

/** Ajusta el contenido al tipo que le corresponde por extensión (texto o bytes) y calcula el tamaño. */
export function ajustarContenido(
  ruta: string,
  contenido: Contenido,
): { tipo: TipoArchivo; contenido: Contenido; tamano: number } {
  const tipo = tipoPorRuta(ruta);
  const final = tipo === 'texto' ? aTexto(contenido) : new Uint8Array(aBytes(contenido));
  const tamano = typeof final === 'string' ? codificador.encode(final).length : final.length;
  return { tipo, contenido: final, tamano };
}

/** Carpetas que contienen a `ruta` («a/b/c.tex» → «a», «a/b»). */
export function ancestros(ruta: string): string[] {
  const partes = ruta.split('/');
  const res: string[] = [];
  for (let i = 1; i < partes.length; i++) res.push(partes.slice(0, i).join('/'));
  return res;
}

/** Un conjunto de rutas no puede tener duplicados ni un archivo y una carpeta con el mismo nombre. */
export function validarArbol(rutas: string[]): void {
  const vistas = new Set<string>();
  for (const r of rutas) {
    if (vistas.has(r)) throw new ErrorAlmacen('destino_ocupado', { ruta: r });
    vistas.add(r);
  }
  for (const r of rutas) {
    for (const a of ancestros(r)) if (vistas.has(a)) throw new ErrorAlmacen('destino_ocupado', { ruta: a });
  }
}

/** Mapa ruta vieja → ruta nueva al renombrar un archivo o una carpeta; valida origen, destino y colisiones. */
export function planearRenombrado(existentes: string[], vieja: string, nueva: string): Map<string, string> {
  if (nueva === vieja) return new Map();
  const origen = existentes.filter((r) => r === vieja || r.startsWith(vieja + '/'));
  if (origen.length === 0) throw new ErrorAlmacen('archivo_inexistente', { ruta: vieja });
  if (nueva.startsWith(vieja + '/')) throw new ErrorAlmacen('movimiento_invalido', { ruta: nueva });
  const plan = new Map<string, string>();
  for (const r of origen) plan.set(r, nueva + r.slice(vieja.length));
  const quedan = existentes.filter((r) => !plan.has(r));
  validarArbol([...quedan, ...plan.values()]);
  return plan;
}

/** Ruta de la carpeta/archivo y todo lo que cuelga de ella. */
export function estaBajo(ruta: string, base: string): boolean {
  return ruta === base || ruta.startsWith(base + '/');
}

/** Identificador único (UUID v4). */
export function nuevoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Emisor mínimo de eventos tipados, compartido por las implementaciones. */
export class Emisor<E extends { tipo: string }> {
  private oyentes = new Map<string, Set<(e: never) => void>>();

  al<N extends E['tipo']>(evento: N, fn: (e: Extract<E, { tipo: N }>) => void): () => void {
    let set = this.oyentes.get(evento);
    if (!set) this.oyentes.set(evento, (set = new Set()));
    set.add(fn as (e: never) => void);
    return () => void set.delete(fn as (e: never) => void);
  }

  emitir(e: E): void {
    for (const fn of this.oyentes.get(e.tipo) ?? []) {
      try {
        (fn as (e: E) => void)(e);
      } catch (error) {
        console.error(error);
      }
    }
  }

  limpiar(): void {
    this.oyentes.clear();
  }
}

/** Datos de un archivo sin su contenido. */
export function sinContenido({ proyectoId, ruta, tipo, modificado, tamano }: ArchivoProyecto): InfoArchivo {
  return { proyectoId, ruta, tipo, modificado, tamano };
}

const decodificadorEstricto = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const decodificadorWindows1252 = new TextDecoder('windows-1252');

/**
 * Decodifica bytes de un archivo de texto. Si no son UTF-8 válido (p. ej. un `.tex` en Latin-1) los interpreta
 * como Windows-1252, que no pierde letras, y lo señala en `convertido`.
 */
export function decodificarTexto(bytes: Uint8Array): { texto: string; convertido: boolean } {
  try {
    return { texto: decodificadorEstricto.decode(bytes), convertido: false };
  } catch {
    return { texto: decodificadorWindows1252.decode(bytes), convertido: true };
  }
}

const unirCarpeta = (carpeta: string, nombre: string) => (carpeta ? `${carpeta}/${nombre}` : nombre);

/** Si «imagen.png» ya existe, propone «imagen (2).png», «imagen (3).png»… (sin mayúsculas, como el sistema de archivos). */
export function nombreUnico(existentes: ReadonlySet<string>, carpeta: string, nombre: string): string {
  const minusculas = new Set([...existentes].map((r) => r.toLowerCase()));
  const libre = (n: string) => !minusculas.has(unirCarpeta(carpeta, n).toLowerCase());
  if (libre(nombre)) return nombre;
  const punto = nombre.lastIndexOf('.');
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const extension = punto > 0 ? nombre.slice(punto) : '';
  for (let i = 2; ; i++) {
    const candidato = `${base} (${i})${extension}`;
    if (libre(candidato)) return candidato;
  }
}

/**
 * Dónde queda lo que se restaura de la papelera sin pisar nada. `existentes` son las rutas de archivo actuales del
 * proyecto; `raiz` es la ruta original del archivo o carpeta; `rutas` son los archivos del elemento (`raiz` misma o
 * lo que cuelga de ella). Devuelve la raíz final y el mapa ruta original → ruta final.
 *
 * Se considera ocupado (sin distinguir mayúsculas) lo que ya tiene ese nombre como archivo o como carpeta, y un
 * ancestro que ahora es archivo; en ese caso se renombra con `nombreUnico` el primer ancestro en conflicto (o la raíz).
 */
export function planearRestauracion(
  existentes: readonly string[],
  raiz: string,
  rutas: readonly string[],
): { raiz: string; mapa: Map<string, string> } {
  const todos = new Set<string>();
  const archivos = new Set<string>();
  for (const r of existentes) {
    archivos.add(r.toLowerCase());
    todos.add(r.toLowerCase());
    for (const a of ancestros(r)) todos.add(a.toLowerCase());
  }
  const partes = raiz.split('/');
  // Primer ancestro (el más alto) que ahora es un archivo: cuelga de él algo que no puede existir.
  let corte = partes.length;
  for (let i = 1; i < partes.length; i++) {
    if (archivos.has(partes.slice(0, i).join('/').toLowerCase())) {
      corte = i;
      break;
    }
  }
  const prefijo = partes.slice(0, corte).join('/');
  const resto = raiz.slice(prefijo.length);
  const carpeta = prefijo.includes('/') ? prefijo.slice(0, prefijo.lastIndexOf('/')) : '';
  const nombre = prefijo.slice(carpeta ? carpeta.length + 1 : 0);
  const nuevoNombre = nombreUnico(todos, carpeta, nombre);
  const nuevoPrefijo = unirCarpeta(carpeta, nuevoNombre);
  const final = nuevoPrefijo + resto;
  const mapa = new Map<string, string>();
  for (const r of rutas) mapa.set(r, final + r.slice(raiz.length));
  return { raiz: final, mapa };
}
