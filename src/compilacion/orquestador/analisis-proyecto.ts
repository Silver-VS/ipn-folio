// SPDX-License-Identifier: AGPL-3.0-or-later
// Detección previa de lo que el proyecto necesita (bibliografía, índices, nomenclatura, glosarios, idiomas),
// leyendo TODAS las fuentes (.tex, .sty, .cls) sin ejecutar TeX: las plantillas cargan sus paquetes desde
// archivos auxiliares (hallazgo 3 de PRUEBA-COMPILACION), no solo desde el principal.
import type { ArchivoProyecto } from '../tipos';

export interface GlosarioExtra {
  /** Extensión de la entrada (`glo`), de la salida (`gls`) y de la bitácora (`glg`), tal como las declara `\newglossary`. */
  entrada: string;
  salida: string;
  bitacora: string;
}

export interface IndiceExtra {
  nombre: string;
  /** Opciones de makeindex que pidió `options=` en `\makeindex[...]` (imakeidx), ya separadas. */
  opciones: string[];
}

export interface AnalisisProyecto {
  /** `\bibliography{…}` o `\addbibresource{…}`. */
  bibliografia: boolean;
  biblatex: boolean;
  /** biblatex con Biber (el motor por omisión de biblatex): fuera de la capa A. */
  biber: boolean;
  /** `\makeindex` sin nombre: índice principal (`<principal>.idx`). */
  indice: boolean;
  /** Índices con nombre de imakeidx (`\makeindex[name=…]`). */
  indicesExtra: IndiceExtra[];
  nomenclatura: boolean;
  glosarios: boolean;
  glosariosExtra: GlosarioExtra[];
  /** Opciones de babel (`spanish`, `mexico`, …) en minúsculas, sin repetir. */
  idiomas: string[];
  /** Archivos de `\include{…}` (sin extensión), relativos a la carpeta del principal. */
  incluidos: string[];
}

const decodificador = new TextDecoder('utf-8');
const esFuenteTeX = (ruta: string) => /\.(tex|sty|cls)$/i.test(ruta);
const aTexto = (c: ArchivoProyecto['contenido']) => (typeof c === 'string' ? c : decodificador.decode(c));
/** Quita los comentarios (`%` no escapado hasta el fin de línea). */
const sinComentarios = (texto: string) => texto.replace(/(^|[^\\])%.*$/gm, '$1');

const PAQUETE = /\\(?:usepackage|RequirePackage)\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g;
const CLASE = /\\documentclass\s*(?:\[([^\]]*)\])?\s*\{([^}]*)\}/g;

/** Separa `a=1, b={x,y}, c` por comas respetando las llaves. */
function opcionesDe(texto: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let actual = '';
  for (const c of texto) {
    if (c === '{') nivel++;
    if (c === '}') nivel--;
    if (c === ',' && nivel === 0) {
      partes.push(actual);
      actual = '';
    } else actual += c;
  }
  partes.push(actual);
  return partes.map((p) => p.trim()).filter(Boolean);
}

function valorDe(lista: string[], clave: string): string | undefined {
  for (const o of lista) {
    const m = new RegExp(`^${clave}\\s*=\\s*\\{?(.*?)\\}?$`, 's').exec(o);
    if (m) return m[1]?.trim();
  }
  return undefined;
}

export function analizarProyecto(archivos: readonly ArchivoProyecto[]): AnalisisProyecto {
  const analisis: AnalisisProyecto = {
    bibliografia: false,
    biblatex: false,
    biber: false,
    indice: false,
    indicesExtra: [],
    nomenclatura: false,
    glosarios: false,
    glosariosExtra: [],
    idiomas: [],
    incluidos: [],
  };
  const idiomas = new Set<string>();
  const incluidos = new Set<string>();
  const indices = new Map<string, IndiceExtra>();
  const glosarios = new Map<string, GlosarioExtra>();

  for (const archivo of archivos) {
    if (!esFuenteTeX(archivo.ruta)) continue;
    const texto = sinComentarios(aTexto(archivo.contenido));

    if (/\\(?:bibliography|addbibresource)\s*\{/.test(texto)) analisis.bibliografia = true;
    if (/\\makenomenclature(?![a-zA-Z])/.test(texto)) analisis.nomenclatura = true;
    if (/\\makeglossaries(?![a-zA-Z])/.test(texto)) analisis.glosarios = true;

    for (const m of texto.matchAll(PAQUETE)) {
      const opciones = opcionesDe(m[1] ?? '');
      for (const paquete of (m[2] ?? '').split(',').map((p) => p.trim())) {
        if (paquete === 'babel')
          for (const o of opciones) if (/^[a-zA-Z]+$/.test(o)) idiomas.add(o.toLowerCase());
        if (paquete === 'nomencl') analisis.nomenclatura = true;
        if (paquete === 'glossaries' || paquete === 'glossaries-extra') analisis.glosarios = true;
        if (paquete === 'biblatex') {
          analisis.biblatex = true;
          const motor = valorDe(opciones, 'backend');
          // Sin `backend=` biblatex usa Biber; `bibtex` y `bibtex8` sí se pueden procesar con BibTeX.
          if (!motor || /^biber$/i.test(motor)) analisis.biber = true;
        }
      }
    }
    for (const m of texto.matchAll(CLASE)) {
      for (const o of opcionesDe(m[1] ?? ''))
        if (/^(spanish|mexican|mexico|english)$/i.test(o)) idiomas.add(o.toLowerCase());
    }

    for (const m of texto.matchAll(/\\makeindex(?![a-zA-Z])\s*(\[[^\]]*\])?/g)) {
      const opciones = m[1] ? opcionesDe(m[1].slice(1, -1)) : [];
      const nombre = valorDe(opciones, 'name');
      if (!nombre) {
        analisis.indice = true;
        continue;
      }
      const extra = (valorDe(opciones, 'options') ?? '').split(/\s+/).filter(Boolean);
      indices.set(nombre, { nombre, opciones: extra });
    }

    for (const m of texto.matchAll(
      /\\newglossary\*?\s*(?:\[([^\]]*)\])?\s*\{[^}]*\}\s*\{([^}]*)\}\s*\{([^}]*)\}/g,
    )) {
      const g = {
        bitacora: (m[1] ?? 'glg').trim(),
        salida: (m[2] ?? '').trim(),
        entrada: (m[3] ?? '').trim(),
      };
      if (g.entrada && g.salida) glosarios.set(g.entrada, g);
    }

    for (const m of texto.matchAll(/\\include\s*\{([^}]+)\}/g)) {
      const ruta = m[1]?.trim().replace(/\.tex$/i, '');
      if (ruta) incluidos.add(ruta);
    }
  }

  analisis.idiomas = [...idiomas];
  analisis.incluidos = [...incluidos];
  analisis.indicesExtra = [...indices.values()];
  // `glo` y `acn` los atiende el orquestador por omisión; solo se guardan los demás.
  analisis.glosariosExtra = [...glosarios.values()].filter((g) => g.entrada !== 'glo' && g.entrada !== 'acn');
  if (glosarios.size > 0) analisis.glosarios = true;
  return analisis;
}
