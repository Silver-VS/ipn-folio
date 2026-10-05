// SPDX-License-Identifier: AGPL-3.0-or-later
import type { LineaBitacora } from './tipos';

const inicio =
  /^(?:\s*$|!|l\.\d+|\.\/.*:\d+:|LaTeX |Package |Overfull |Underfull |Runaway |==>|\(|\)|<|Output |Transcript )/;

export function desenvolver(log: string, columnas = 79): LineaBitacora[] {
  const lineas = log.replace(/\r\n?/g, '\n').split('\n');
  const resultado: LineaBitacora[] = [];
  for (let i = 0; i < lineas.length; i++) {
    let texto = lineas[i] ?? '';
    let original = texto;
    let ancho = texto.length;
    // Length alone cannot distinguish a wrap from an intentional newline.
    // Only join unfinished diagnostics or file paths with a nonstructural continuation.
    while (ancho === columnas && i + 1 < lineas.length) {
      const siguiente = lineas[i + 1] ?? '';
      const diagnostico = /^(?:!|\.\/.*:\d+:|LaTeX |Package |Overfull |Underfull )/.test(texto);
      const ruta = /\((?:\.\/|\/)[^\s()]*$/.test(texto);
      if ((!diagnostico && !ruta) || /[.!?]\s*$/.test(texto) || inicio.test(siguiente)) break;
      texto += siguiente;
      original += '\n' + siguiente;
      ancho = siguiente.length;
      i++;
    }
    resultado.push({ texto, original });
  }
  return resultado;
}
