// SPDX-License-Identifier: AGPL-3.0-or-later
import type { LineaBitacora } from './tipos';

export function archivoPorLinea(lineas: readonly LineaBitacora[]): (string | undefined)[] {
  const pila: (string | undefined)[] = [];
  return lineas.map(({ texto }) => {
    // Parentheses inside diagnostics or source excerpts never close an input file.
    if (!/^(?:!|l\.\d+|\.\/.*:\d+:|LaTeX |Package |\([\w-]+\)\s|Overfull |Underfull |<|\s*\\)/.test(texto)) {
      for (let i = 0; i < texto.length; i++) {
        if (texto[i] === '(') {
          const ruta =
            /^(?:"([^"\n]+\.(?:tex|sty|cls|bib|aux|bbl|cfg|def|fd|ldf))"|([^\s()]+\.(?:tex|sty|cls|bib|aux|bbl|cfg|def|fd|ldf)))(?=[\s()]|$)/.exec(
              texto.slice(i + 1),
            );
          pila.push(ruta ? (ruta[1] ?? ruta[2]) : undefined);
          if (ruta) i += ruta[0].length;
        } else if (texto[i] === ')') pila.pop();
      }
    }
    // Library frames must not hide the project file that loaded them.
    return [...pila]
      .reverse()
      .find((ruta) => ruta?.startsWith('./'))
      ?.slice(2);
  });
}
