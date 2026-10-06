// SPDX-License-Identifier: AGPL-3.0-or-later
import { desenvolver } from './desenvolver';
import { archivoPorLinea } from './pila-archivos';
import { clasificar, crearProblema } from './mensajes';
import type { ResultadoAnalisis, Senales } from './tipos';

export function senalesVacias(): Senales {
  return {
    repetirPasada: false,
    citasIndefinidas: false,
    referenciasIndefinidas: false,
    faltantes: [],
    fatal: false,
  };
}

const cabecera =
  /^(?:!\s|[^\s()].*?\.(?:tex|sty|cls|ldf|def|cfg|fd):\d+:\s|Runaway argument\?|LaTeX (?:Font )?Warning:|Package \S+ Warning:|Overfull \\hbox|.*Fatal error occurred)/;
const fileLine = /^([^\s()].*?\.(?:tex|sty|cls|ldf|def|cfg|fd)):(\d+):\s*(.*)$/;
// Rutas absolutas (TeX Live, WASM): el error es de la biblioteca, no de un archivo del alumno.
const esBiblioteca = (ruta: string) => /^(?:\/|[A-Za-z]:[\\/])/.test(ruta);
// Se busca solo en líneas de bitácora que piden otra pasada; la línea informativa
// «Package: rerunfilecheck … Rerun checks for auxiliary files» (la imprime hyperref) no cuenta.
const pidePasada = /Rerun to get|Rerun LaTeX|Label\(s\) may have changed|Please (?:re)?run LaTeX/i;

export function analizarTex(log: string): ResultadoAnalisis {
  const lineas = desenvolver(log);
  const archivos = archivoPorLinea(lineas);
  const resultado: ResultadoAnalisis = { problemas: [], senales: senalesVacias() };
  resultado.senales.repetirPasada = lineas.some(
    (l) => !/^Package: /.test(l.texto) && pidePasada.test(l.texto),
  );
  resultado.senales.fatal = /Emergency stop|Fatal error occurred/.test(log);
  for (let i = 0; i < lineas.length; i++) {
    const actual = lineas[i];
    if (!actual || !cabecera.test(actual.texto)) continue;
    const explicita = fileLine.exec(actual.texto);
    const deBiblioteca = explicita ? esBiblioteca(explicita[1] ?? '') : false;
    const fragmentos = [actual];
    let j = i + 1;
    while (j < lineas.length && j <= i + 12) {
      const siguiente = lineas[j];
      if (
        !siguiente ||
        cabecera.test(siguiente.texto) ||
        /^\s*\)|^\((?:\.\/|\/)|^Output |^Transcript /.test(siguiente.texto)
      )
        break;
      if (!siguiente.texto.trim() && /Warning:|Overfull/.test(actual.texto)) break;
      fragmentos.push(siguiente);
      j++;
      if (/^l\.\d+/.test(siguiente.texto)) {
        // TeX prints the undefined command before the remainder of the source line.
        if (
          /Undefined control sequence/.test(actual.texto) &&
          lineas[j] &&
          /^\s+/.test(lineas[j]?.texto ?? '')
        )
          fragmentos.push(lineas[j++]!);
        break;
      }
    }
    const texto = fragmentos.map((l) => l.texto).join('\n');
    const ubicacion = /^l\.(\d+)/m.exec(texto) ?? /(?:on input line |at lines? )(\d+)/m.exec(texto);
    // Si el error es de una biblioteca (.sty, .cls), la ubicación útil es la del proyecto (l.N y pila).
    const delProyecto = explicita && !deBiblioteca;
    const linea = delProyecto ? Number(explicita[2]) : ubicacion ? Number(ubicacion[1]) : undefined;
    const archivo = delProyecto ? explicita[1]?.replace(/^\.\//, '') : archivos[i];
    const mensaje = explicita ? texto.slice(actual.texto.length - (explicita[3]?.length ?? 0)) : texto;
    const clasificacion = clasificar(mensaje, texto, linea);
    if (!clasificacion) continue;
    const aviso = /Warning:|Overfull/.test(actual.texto);
    resultado.problemas.push(
      crearProblema(clasificacion, {
        gravedad: aviso ? 'aviso' : 'error',
        archivo,
        linea,
        original: fragmentos.map((l) => l.original).join('\n'),
      }),
    );
    if (clasificacion.codigo === 'archivo-faltante')
      resultado.senales.faltantes.push(String(clasificacion.variables.archivo));
    if (clasificacion.codigo === 'idioma-espanol-faltante') resultado.senales.faltantes.push('spanish.ldf');
    if (clasificacion.codigo === 'cita-indefinida' || /There were undefined citations/.test(mensaje))
      resultado.senales.citasIndefinidas = true;
    if (clasificacion.codigo === 'referencia-indefinida' || /There were undefined references/.test(mensaje))
      resultado.senales.referenciasIndefinidas = true;
    i = j - 1;
  }
  return resultado;
}
