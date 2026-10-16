// SPDX-License-Identifier: AGPL-3.0-or-later
// Lógica pura del árbol de archivos: armarlo desde la lista plana del almacén, aplanar lo visible y elegir nombres.
import type { InfoArchivo } from '../../almacen';

export interface NodoArbol {
  /** Ruta completa («capitulos/intro.tex»; para carpetas, sin barra final). */
  ruta: string;
  nombre: string;
  tipo: 'carpeta' | 'archivo';
  nivel: number;
  hijos: NodoArbol[];
  info?: InfoArchivo;
}

const comparar = new Intl.Collator('es', { numeric: true, sensitivity: 'base' }).compare;

/** Carpetas primero y luego archivos, cada grupo en orden alfabético del español. */
export function construirArbol(archivos: readonly InfoArchivo[]): NodoArbol[] {
  const raiz: NodoArbol = { ruta: '', nombre: '', tipo: 'carpeta', nivel: -1, hijos: [] };
  const carpetas = new Map<string, NodoArbol>([['', raiz]]);

  const carpeta = (ruta: string): NodoArbol => {
    const existente = carpetas.get(ruta);
    if (existente) return existente;
    const corte = ruta.lastIndexOf('/');
    const padre = carpeta(corte < 0 ? '' : ruta.slice(0, corte));
    const nodo: NodoArbol = {
      ruta,
      nombre: ruta.slice(corte + 1),
      tipo: 'carpeta',
      nivel: padre.nivel + 1,
      hijos: [],
    };
    padre.hijos.push(nodo);
    carpetas.set(ruta, nodo);
    return nodo;
  };

  for (const info of archivos) {
    const corte = info.ruta.lastIndexOf('/');
    const padre = carpeta(corte < 0 ? '' : info.ruta.slice(0, corte));
    padre.hijos.push({
      ruta: info.ruta,
      nombre: info.ruta.slice(corte + 1),
      tipo: 'archivo',
      nivel: padre.nivel + 1,
      hijos: [],
      info,
    });
  }

  const ordenar = (nodo: NodoArbol) => {
    nodo.hijos.sort((a, b) =>
      a.tipo === b.tipo ? comparar(a.nombre, b.nombre) : a.tipo === 'carpeta' ? -1 : 1,
    );
    nodo.hijos.forEach(ordenar);
  };
  ordenar(raiz);
  return raiz.hijos;
}

/** Los nodos que se ven: los hijos de una carpeta solo aparecen si ella está expandida. */
export function aplanarVisibles(arbol: readonly NodoArbol[], expandidas: ReadonlySet<string>): NodoArbol[] {
  const salida: NodoArbol[] = [];
  const visitar = (nodos: readonly NodoArbol[]) => {
    for (const n of nodos) {
      salida.push(n);
      if (n.tipo === 'carpeta' && expandidas.has(n.ruta)) visitar(n.hijos);
    }
  };
  visitar(arbol);
  return salida;
}

/** Todas las carpetas que contienen a `ruta` («a/b/c.tex» -> «a», «a/b»). */
export function carpetasDe(ruta: string): string[] {
  const partes = ruta.split('/');
  partes.pop();
  return partes.map((_, i) => partes.slice(0, i + 1).join('/'));
}

export function nombreDe(ruta: string): string {
  return ruta.slice(ruta.lastIndexOf('/') + 1);
}

/** Une una carpeta («» o «a/b») con un nombre. */
export function unirRuta(carpeta: string, nombre: string): string {
  return carpeta ? `${carpeta}/${nombre}` : nombre;
}

/** Si «imagen.png» ya existe, propone «imagen (2).png», «imagen (3).png»… (sin mayúsculas, como el sistema de archivos). */
export function nombreUnico(existentes: ReadonlySet<string>, carpeta: string, nombre: string): string {
  const minusculas = new Set([...existentes].map((r) => r.toLowerCase()));
  const libre = (n: string) => !minusculas.has(unirRuta(carpeta, n).toLowerCase());
  if (libre(nombre)) return nombre;
  const punto = nombre.lastIndexOf('.');
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const extension = punto > 0 ? nombre.slice(punto) : '';
  for (let i = 2; ; i++) {
    const candidato = `${base} (${i})${extension}`;
    if (libre(candidato)) return candidato;
  }
}

const IMAGENES = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp']);
const EXTENSION = /\.([^./]+)$/;

export function extensionDe(ruta: string): string {
  return EXTENSION.exec(ruta)?.[1]?.toLowerCase() ?? '';
}

export function esImagen(ruta: string): boolean {
  return IMAGENES.has(extensionDe(ruta));
}

/** Tipo MIME de las imágenes que se pueden previsualizar. */
export function mimeDeImagen(ruta: string): string {
  const e = extensionDe(ruta);
  if (e === 'svg') return 'image/svg+xml';
  if (e === 'jpg') return 'image/jpeg';
  return `image/${e}`;
}

/** Si `ruta` es `base` o cuelga de ella, devuelve la ruta con `base` cambiada por `nueva`; si no, `undefined`. */
export function moverBajo(ruta: string, base: string, nueva: string): string | undefined {
  if (ruta === base) return nueva;
  return ruta.startsWith(`${base}/`) ? nueva + ruta.slice(base.length) : undefined;
}
