// SPDX-License-Identifier: AGPL-3.0-or-later
// Ruta mínima por «hash»: `#/` es el inicio y `#/proyecto/<id>` abre la pantalla de proyecto (el inicio real es de la sesión 09).

export type Ruta = { pantalla: 'inicio' } | { pantalla: 'proyecto'; id: string };

export function rutaDeHash(hash: string): Ruta {
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
