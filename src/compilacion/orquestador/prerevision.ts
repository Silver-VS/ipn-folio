// SPDX-License-Identifier: AGPL-3.0-or-later
// Revisión previa a compilar (no bloquea): marcadores de campo de WinEdt (byte 0x7F) en `.bib` y `.tex`.
// Una plantilla como UpiiTeXis trae una entrada de referencia con esos marcadores; si el alumno no la llena,
// aparece como una cita rota (hallazgo 8 de PRUEBA-COMPILACION). Aquí solo se avisa.
import { crearProblema } from '../bitacora/mensajes';
import type { Problema } from '../bitacora/tipos';
import type { ArchivoProyecto } from '../tipos';

const MARCADOR = '\x7f';
const decodificador = new TextDecoder('utf-8');
const aTexto = (c: ArchivoProyecto['contenido']) => (typeof c === 'string' ? c : decodificador.decode(c));

/** Número de línea (desde 1) de la posición `indice` del texto. */
function lineaDe(texto: string, indice: number): number {
  let linea = 1;
  for (let i = texto.indexOf('\n'); i !== -1 && i < indice; i = texto.indexOf('\n', i + 1)) linea++;
  return linea;
}

function revisarBib(ruta: string, texto: string): Problema[] {
  const problemas: Problema[] = [];
  const vistas = new Set<string>();
  const inicios = [...texto.matchAll(/@[A-Za-z]+\s*[{(]\s*([^,\s}]*)\s*,/g)];
  for (let pos = texto.indexOf(MARCADOR); pos !== -1; pos = texto.indexOf(MARCADOR, pos + 1)) {
    const entrada = inicios.filter((m) => (m.index ?? 0) < pos).at(-1);
    const cita = entrada?.[1] || '';
    const clave = `${cita}@${entrada?.index ?? -1}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const linea = lineaDe(texto, entrada?.index ?? pos);
    problemas.push(
      cita
        ? crearProblema(
            {
              codigo: 'campos-por-llenar',
              variables: { archivo: ruta, cita },
              variante: 'campos-por-llenar',
            },
            { gravedad: 'aviso', original: `${ruta}:${linea}`, archivo: ruta, linea },
          )
        : crearProblema(
            {
              codigo: 'campos-por-llenar',
              variables: { archivo: ruta, linea: lineaDe(texto, pos) },
              variante: 'campos-por-llenar-sin-entrada',
            },
            {
              gravedad: 'aviso',
              original: `${ruta}:${lineaDe(texto, pos)}`,
              archivo: ruta,
              linea: lineaDe(texto, pos),
            },
          ),
    );
  }
  return problemas;
}

function revisarTex(ruta: string, texto: string): Problema[] {
  const lineas = new Set<number>();
  for (let pos = texto.indexOf(MARCADOR); pos !== -1; pos = texto.indexOf(MARCADOR, pos + 1)) {
    lineas.add(lineaDe(texto, pos));
  }
  // Un aviso por archivo (el primero) basta: la acción es la misma para todas las líneas.
  const primera = [...lineas][0];
  if (primera === undefined) return [];
  return [
    crearProblema(
      {
        codigo: 'campos-por-llenar',
        variables: { archivo: ruta, linea: primera },
        variante: 'campos-por-llenar-sin-entrada',
      },
      { gravedad: 'aviso', original: `${ruta}:${primera}`, archivo: ruta, linea: primera },
    ),
  ];
}

/** Avisos de la revisión previa de las fuentes del proyecto. */
export function prerevisar(archivos: readonly ArchivoProyecto[]): Problema[] {
  const problemas: Problema[] = [];
  for (const archivo of archivos) {
    const esBib = /\.bib$/i.test(archivo.ruta);
    if (!esBib && !/\.tex$/i.test(archivo.ruta)) continue;
    const texto = aTexto(archivo.contenido);
    if (!texto.includes(MARCADOR)) continue;
    problemas.push(...(esBib ? revisarBib(archivo.ruta, texto) : revisarTex(archivo.ruta, texto)));
  }
  return problemas;
}
