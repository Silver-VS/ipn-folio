// SPDX-License-Identifier: AGPL-3.0-or-later
// Existencia de archivos distinguiendo mayúsculas aunque el disco no lo haga (NTFS, APFS por omisión).
// GitHub Pages sí distingue, así que se lee el listado del directorio en lugar de usar `existsSync`.
import { readdirSync, statSync } from 'node:fs';
import { basename, dirname } from 'node:path';

/** Listados por directorio; se descartan si cambia la fecha de modificación del directorio. */
export function crearBuscadorExacto() {
  /** @type {Map<string, { mtime: number, nombres: Set<string> }>} */
  const cache = new Map();
  /** @param {string} dir */
  const listado = (dir) => {
    let mtime;
    try {
      mtime = statSync(dir).mtimeMs;
    } catch {
      return null;
    }
    const previo = cache.get(dir);
    if (previo && previo.mtime === mtime) return previo.nombres;
    const nombres = new Set(readdirSync(dir));
    cache.set(dir, { mtime, nombres });
    return nombres;
  };
  /**
   * Devuelve los bytes del archivo si existe con ese nombre exacto (mayúsculas incluidas); si no, null.
   * @param {string} archivo ruta absoluta
   * @returns {number | null}
   */
  return (archivo) => {
    const nombres = listado(dirname(archivo));
    if (!nombres?.has(basename(archivo))) return null;
    try {
      const s = statSync(archivo);
      return s.isFile() ? s.size : null;
    } catch {
      return null;
    }
  };
}
