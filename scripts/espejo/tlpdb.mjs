// SPDX-License-Identifier: AGPL-3.0-or-later
// Lectura del catálogo de TeX Live (texlive.tlpdb) y resolución de colecciones. Sin dependencias.
// Formato [V]: bloques separados por línea vacía; cada línea es «campo valor»; `depend` puede repetirse;
// `catalogue-license` lleva varias etiquetas; `runfiles size=N` va seguido de una línea por archivo, con sangría.

/**
 * @typedef {{ nombre: string, categoria: string, depend: string[], runfiles: string[], docfiles: string[], licencia: string[] }} Paquete
 */

/** @param {string} texto contenido del tlpdb @returns {Map<string, Paquete>} */
export function analizarTlpdb(texto) {
  /** @type {Map<string, Paquete>} */
  const paquetes = new Map();
  for (const bloque of texto.split(/\r?\n\r?\n/)) {
    if (!bloque.trim()) continue;
    /** @type {Paquete | null} */
    let paquete = null;
    /** @type {"runfiles" | "docfiles" | null} */
    let seccion = null;
    for (const linea of bloque.split(/\r?\n/)) {
      if (/^\s/.test(linea)) {
        // Línea de archivo: «ruta [details=… | language=… …]».
        if (paquete && seccion) {
          const ruta = linea
            .trim()
            .split(/\s+(?=\w+=)/)[0]
            ?.replace(/\\/g, '/');
          if (ruta) paquete[seccion].push(ruta);
        }
        continue;
      }
      seccion = null;
      const espacio = linea.indexOf(' ');
      const campo = espacio < 0 ? linea : linea.slice(0, espacio);
      const valor = espacio < 0 ? '' : linea.slice(espacio + 1).trim();
      if (campo === 'name') {
        paquete = { nombre: valor, categoria: '', depend: [], runfiles: [], docfiles: [], licencia: [] };
        paquetes.set(valor, paquete);
      } else if (!paquete) {
        continue;
      } else if (campo === 'category') paquete.categoria = valor;
      else if (campo === 'depend') paquete.depend.push(valor);
      else if (campo === 'catalogue-license') paquete.licencia = valor.split(/\s+/).filter(Boolean);
      else if (campo === 'runfiles') seccion = 'runfiles';
      else if (campo === 'docfiles') seccion = 'docfiles';
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

/**
 * Etiquetas de licencia efectivas de un paquete: la verificada a mano (`verificadas`, con su fuente en
 * paquetes.json) si existe; si no, las del catálogo. La etiqueta «collection» del catálogo no es una
 * licencia (significa «cada archivo trae la suya»), así que nunca basta por sí sola.
 * @param {Paquete} p @param {Record<string, string[]>} [verificadas] @returns {string[]}
 */
export function licenciaEfectiva(p, verificadas = {}) {
  return verificadas[p.nombre] ?? p.licencia;
}

/** Nombres de archivo que son textos de licencia (para copiarlos del `doc/` del paquete). */
const NOMBRE_LICENCIA =
  /^(licen[cs]e[\w.-]*|copying[\w.-]*|copyright|unlicense|ofl(-faq)?\.(txt|md)|ofl|lppl[\w.-]*|l?gpl[\w.-]*|agpl[\w.-]*|apache[\w.-]*|fdl[\w.-]*|cc-by[\w.-]*)(\.(txt|md|tex))?$/i;

/**
 * Archivos de licencia que el paquete trae entre sus `docfiles` (rutas relativas a la raíz de TeX Live).
 * Se excluyen las preguntas frecuentes de OFL y los `.pdf`/imágenes.
 * @param {Paquete} p @returns {string[]}
 */
export function archivosDeLicencia(p) {
  return p.docfiles.filter((ruta) => {
    const nombre = ruta.slice(ruta.lastIndexOf('/') + 1);
    return NOMBRE_LICENCIA.test(nombre) && !/faq|\.(pdf|png|jpe?g|svg|html?)$/i.test(nombre);
  });
}
