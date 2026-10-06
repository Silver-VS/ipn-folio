// SPDX-License-Identifier: AGPL-3.0-or-later
// Secuencia FIJA y PROVISIONAL para tener PDF desde ya. La reemplaza el orquestador (sesión 06, D9).
//
//   pdflatex → [bibtex8] → [makeindex idx] → [makeindex nlo (nomencl)] → pdflatex ×2
//
// Las pasadas extra solo se hacen si hacen falta (hubo bibliografía, índice, nomenclatura o TeX pidió repetir).
// Solo pdfLaTeX con BibTeX: Biber, XeLaTeX, LuaLaTeX y --shell-escape quedan fuera de la capa A (D23).
import { FORMATO_PDFLATEX } from './config';
import type { PuertoMotor } from './motor';
import type { ArchivoProyecto, ResultadoEjecucion } from './tipos';

const PATRONES_REPETIR = [
  'Rerun to get',
  'Rerun LaTeX',
  'rerunfilecheck',
  'Label(s) may have changed',
  'There were undefined references',
  'run LaTeX again',
];

export interface PasoEjecutado {
  /** Comando completo, tal como se ejecutó. */
  cmd: string[];
  codigo: number;
  ms: number;
}

export interface ResultadoSecuencia {
  /** `true` si se generó un PDF. */
  exito: boolean;
  pdf: Uint8Array | null;
  synctex: Uint8Array | null;
  pasos: PasoEjecutado[];
  /** Bitácoras de la última ejecución de cada programa, listas para `analizar` (sesión 05). */
  bitacoras: { log: string; blg: string; ilg: string };
  /** Milisegundos de toda la secuencia (incluye montar y leer). */
  ms: number;
}

export interface EntradaSecuencia {
  archivos: ArchivoProyecto[];
  /** Ruta del `.tex` principal, relativa a la raíz del proyecto. */
  principal: string;
}

const decodificador = new TextDecoder('utf-8');
const esFuenteTeX = (ruta: string) => /\.(tex|sty|cls)$/i.test(ruta);
const aTexto = (c: ArchivoProyecto['contenido']) => (typeof c === 'string' ? c : decodificador.decode(c));
const dirname = (ruta: string) => (ruta.includes('/') ? ruta.slice(0, ruta.lastIndexOf('/')) : '');
const basename = (ruta: string) => ruta.slice(ruta.lastIndexOf('/') + 1);

/** ¿Alguna fuente (`.tex`, `.sty` o `.cls`: UpiiTeXis la pide desde un `.sty`) pide bibliografía? (`\bibliography{…}` o `\addbibresource{…}`). */
export function usaBibliografia(archivos: ArchivoProyecto[]): boolean {
  return archivos.some(
    (a) => esFuenteTeX(a.ruta) && /\\(?:bibliography|addbibresource)\s*\{/.test(aTexto(a.contenido)),
  );
}

export function pideRepetir(log: string): boolean {
  return PATRONES_REPETIR.some((p) => log.includes(p));
}

export async function compilarProvisional(
  motor: PuertoMotor,
  { archivos, principal }: EntradaSecuencia,
  opciones: { enVivo?: boolean } = {},
): Promise<ResultadoSecuencia> {
  const inicio = performance.now();
  const dir = dirname(principal);
  const tex = basename(principal);
  const base = tex.replace(/\.tex$/i, '');
  const pasos: PasoEjecutado[] = [];
  const bitacoras = { log: '', blg: '', ilg: '' };
  const vivo = opciones.enVivo ? { enVivo: true } : {};

  const correr = async (cmd: string[]): Promise<ResultadoEjecucion> => {
    const r = await motor.ejecutar(cmd, vivo);
    pasos.push({ cmd, codigo: r.codigo, ms: r.ms });
    return r;
  };
  const noFinal = [
    'pdflatex',
    '-synctex=1',
    '--no-shell-escape',
    '--interaction=batchmode',
    '--halt-on-error',
    '-file-line-error',
    '--fmt',
    FORMATO_PDFLATEX,
    tex,
  ];
  const final = [
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
  const pasadaTex = async (cmd: string[]) => {
    const r = await correr(cmd);
    bitacoras.log = r.log;
    return r;
  };
  const ruta = (nombre: string) => (dir ? `${dir}/${nombre}` : nombre);
  const terminar = async (exito: boolean): Promise<ResultadoSecuencia> => {
    const pdf = exito ? await motor.leer(ruta(`${base}.pdf`)) : null;
    const synctex = exito ? await motor.leer(ruta(`${base}.synctex.gz`)) : null;
    const hayPdf = !!pdf && pdf.byteLength > 0;
    return {
      exito: hayPdf,
      pdf: hayPdf ? pdf : null,
      synctex: hayPdf ? synctex : null,
      pasos,
      bitacoras,
      ms: performance.now() - inicio,
    };
  };

  await motor.montar(archivos, dir);

  const primera = await pasadaTex(noFinal);
  if (primera.codigo !== 0) return terminar(false);

  // BibTeX solo si las fuentes lo piden y el .aux trae \bibdata (con biblatex+biber no hay \bibdata: Biber no se usa).
  let hizoBibliografia = false;
  if (usaBibliografia(archivos)) {
    const aux = await motor.leer(ruta(`${base}.aux`));
    if (aux && decodificador.decode(aux).includes('\\bibdata')) {
      const r = await correr(['bibtex8', '--8bit', `${base}.aux`]);
      bitacoras.blg = r.log;
      hizoBibliografia = true;
    }
  }

  let hizoIndice = false;
  const idx = await motor.leer(ruta(`${base}.idx`));
  if (idx && decodificador.decode(idx).trim() !== '') {
    const r = await correr(['makeindex', `${base}.idx`]);
    bitacoras.ilg = r.log;
    hizoIndice = true;
  }

  // Hallazgo 4 de la prueba: BusyTeX no genera la nomenclatura (paquete nomencl); hay que pedirla.
  let hizoNomenclatura = false;
  if (await motor.existe(ruta(`${base}.nlo`))) {
    const r = await correr(['makeindex', `${base}.nlo`, '-s', 'nomencl.ist', '-o', `${base}.nls`]);
    bitacoras.ilg = bitacoras.ilg ? `${bitacoras.ilg}\n${r.log}` : r.log;
    hizoNomenclatura = true;
  }

  if (hizoBibliografia || hizoIndice || hizoNomenclatura || pideRepetir(primera.log)) {
    const segunda = await pasadaTex(noFinal);
    if (segunda.codigo !== 0) return terminar(false);
    const ultima = await pasadaTex(final);
    return terminar(ultima.codigo === 0);
  }
  return terminar(true);
}
