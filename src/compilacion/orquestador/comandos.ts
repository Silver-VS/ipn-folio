// SPDX-License-Identifier: AGPL-3.0-or-later
// Construcción de los comandos de cada herramienta: único lugar con cadenas de comando (D9).
// Sin `--shell-escape` por seguridad (minted y similares requieren decisión del dueño); TeX corre con
// `--no-shell-escape`, `-file-line-error` (para ubicar archivo y línea) y `-synctex=1`.
import { FORMATO_PDFLATEX } from '../config';

/** Una pasada de pdfLaTeX sobre `tex` (nombre del principal, relativo a su carpeta). */
export function cmdTex(tex: string): string[] {
  return [
    'pdflatex',
    '-synctex=1',
    '--no-shell-escape',
    '--interaction=nonstopmode',
    '--halt-on-error',
    '-file-line-error',
    '--output-format=pdf',
    '--fmt',
    FORMATO_PDFLATEX,
    tex,
  ];
}

/** BibTeX de 8 bits sobre el `.aux` principal (sigue los `\@input` de los capítulos). */
export function cmdBibtex(base: string): string[] {
  return ['bibtex8', '--8bit', `${base}.aux`];
}

/** Índice de `<nombre>.idx` (el principal o uno con nombre de imakeidx); `opciones` son las de `options=`. */
export function cmdIndice(nombre: string, opciones: string[] = []): string[] {
  return ['makeindex', ...opciones, `${nombre}.idx`];
}

/** Nomenclatura (paquete nomencl): `.nlo` → `.nls` con `nomencl.ist` (hallazgo 4 de la prueba). */
export function cmdNomenclatura(base: string): string[] {
  return ['makeindex', `${base}.nlo`, '-s', 'nomencl.ist', '-t', `${base}.nlg`, '-o', `${base}.nls`];
}

/** Glosario o lista de acrónimos de glossaries: `entrada` → `salida`, con el estilo que escribe TeX (`<base>.ist`). */
export function cmdGlosario(base: string, entrada: string, salida: string, bitacora: string): string[] {
  return [
    'makeindex',
    '-s',
    `${base}.ist`,
    '-t',
    `${base}.${bitacora}`,
    '-o',
    `${base}.${salida}`,
    `${base}.${entrada}`,
  ];
}
