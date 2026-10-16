// SPDX-License-Identifier: AGPL-3.0-or-later
// Ruta mínima por «hash»: `#/` es el inicio, `#/proyecto/<id>` abre la pantalla de proyecto y `#/papelera` la papelera
// única (el inicio real es de la sesión 09).

export type Ruta =
  | { pantalla: 'inicio' }
  | { pantalla: 'ajustes' }
  | { pantalla: 'papelera' }
  | { pantalla: 'proyecto'; id: string };

export const HASH_AJUSTES = '#/ajustes';

export function rutaDeHash(hash: string): Ruta {
  if (/^#\/ajustes\/?$/.test(hash)) return { pantalla: 'ajustes' };
  if (/^#\/papelera\/?$/.test(hash)) return { pantalla: 'papelera' };
  const m = /^#\/proyecto\/([^/?#]+)\/?$/.exec(hash);
  if (!m?.[1]) return { pantalla: 'inicio' };
  try {
    return { pantalla: 'proyecto', id: decodeURIComponent(m[1]) };
  } catch {
    return { pantalla: 'inicio' };
  }
}

export function hashDeProyecto(id: string): string {
  return `#/proyecto/${encodeURIComponent(id)}`;
}

export const HASH_PAPELERA = '#/papelera';
