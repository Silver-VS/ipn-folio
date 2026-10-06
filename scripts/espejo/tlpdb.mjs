// SPDX-License-Identifier: AGPL-3.0-or-later
// Lectura del catálogo de TeX Live (texlive.tlpdb) y resolución de colecciones. Sin dependencias.
// Formato [V]: bloques separados por línea vacía; cada línea es «campo valor»; `depend` puede repetirse;
// `catalogue-license` lleva varias etiquetas; `runfiles size=N` va seguido de una línea por archivo, con sangría.

/**
 * @typedef {{ nombre: string, categoria: string, depend: string[], runfiles: string[], licencia: string[] }} Paquete
 */

/** @param {string} texto contenido del tlpdb @returns {Map<string, Paquete>} */
export function analizarTlpdb(texto) {
  /** @type {Map<string, Paquete>} */
  const paquetes = new Map();
  for (const bloque of texto.split(/\r?\n\r?\n/)) {
    if (!bloque.trim()) continue;
    /** @type {Paquete | null} */
    let paquete = null;
    let enRunfiles = false;
    for (const linea of bloque.split(/\r?\n/)) {
      if (/^\s/.test(linea)) {
        // Línea de archivo: «ruta [details=… | language=… …]».
        if (paquete && enRunfiles) {
          const ruta = linea.trim().split(/\s+(?=\w+=)/)[0];
          if (ruta) paquete.runfiles.push(ruta);
        }
        continue;
      }
      enRunfiles = false;
      const espacio = linea.indexOf(' ');
      const campo = espacio < 0 ? linea : linea.slice(0, espacio);
      const valor = espacio < 0 ? '' : linea.slice(espacio + 1).trim();
      if (campo === 'name') {
        paquete = { nombre: valor, categoria: '', depend: [], runfiles: [], licencia: [] };
        paquetes.set(valor, paquete);
      } else if (!paquete) {
        continue;
      } else if (campo === 'category') paquete.categoria = valor;
      else if (campo === 'depend') paquete.depend.push(valor);
      else if (campo === 'catalogue-license') paquete.licencia = valor.split(/\s+/).filter(Boolean);
      else if (campo === 'runfiles') enRunfiles = true;
    }
  }
  return paquetes;
}

/**
 * Resuelve los paquetes que entran al espejo. Las raíces pueden ser colecciones (se abren) o paquetes;
 * de ahí en adelante solo se siguen dependencias que sean paquetes (no colecciones, no variantes de
 * arquitectura ni nombres ausentes del catálogo), para no traer TeX Live entero.
 * @param {Map<string, Paquete>} db
 * @param {string[]} raices
 * @param {string[]} [excluir]
 * @returns {{ paquetes: string[], ausentes: string[] }}
 */
export function resolver(db, raices, excluir = []) {
  const fuera = new Set(excluir);
  const vistos = new Set();
  const ausentes = [];
  const pendientes = [...raices];
  while (pendientes.length) {
    const nombre = /** @type {string} */ (pendientes.pop());
    if (vistos.has(nombre) || fuera.has(nombre)) continue;
    const p = db.get(nombre);
    if (!p) {
      ausentes.push(nombre);
      continue;
    }
    vistos.add(nombre);
    for (const dep of p.depend) {
      const d = db.get(dep);
      // Colecciones y variantes de arquitectura («foo.windows») no se siguen.
      if (!d || d.categoria === 'Collection' || dep.includes('.')) continue;
      pendientes.push(dep);
    }
  }
  const paquetes = [...vistos].filter((n) => db.get(n)?.categoria !== 'Collection').sort();
  return { paquetes, ausentes };
}

/**
 * Dice si la licencia del catálogo permite redistribuir. Todas las etiquetas deben ser libres; sin etiqueta
 * o con una desconocida (p. ej. «unknown», «nosell», «noinfo») se excluye.
 * @param {string[]} licencia @param {Set<string>} libres
 */
export function esLibre(licencia, libres) {
  return licencia.length > 0 && licencia.every((l) => libres.has(l));
}
