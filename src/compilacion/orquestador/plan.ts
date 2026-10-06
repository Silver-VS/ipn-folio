// SPDX-License-Identifier: AGPL-3.0-or-later
// Lógica de decisión del orquestador (al estilo de latexmk): función PURA. Recibe una instantánea del estado
// (qué pasadas de TeX se han hecho, qué entradas tienen las herramientas y con cuáles corrieron por última vez)
// y devuelve el siguiente paso o el fin. No toca el motor: se prueba con un motor falso y puede moverse a un worker.
import type { AnalisisProyecto } from './analisis-proyecto';
import { cmdBibtex, cmdGlosario, cmdIndice, cmdNomenclatura } from './comandos';
import { huella } from './huella';

/** Máximo de pasadas de TeX en una compilación (evita ciclos con `Rerun` persistente). */
export const MAX_PASADAS_TEX = 5;

export type NombreHerramienta = 'bibliografia' | 'indice' | 'nomenclatura' | 'glosario';
export type NombrePaso = 'primera' | 'pasada' | 'final' | NombreHerramienta;

/** Herramienta que puede correr entre pasadas de TeX. Solo corre si su entrada existe y cambió. */
export interface Candidata {
  /** Identificador estable (`bibliografia`, `indice:principal`, `glosario:glo`…). */
  clave: string;
  nombre: NombreHerramienta;
  cmd: string[];
  /** Rutas (relativas a la carpeta del principal) que `huella` necesita leer. */
  lee: string[];
  /**
   * Huella de la entrada, o `null` si no hay nada que procesar (archivo ausente o vacío).
   * `extra` es la huella de los archivos del proyecto que también influyen (`.bib`, `.bst` o `.ist`).
   */
  huella(contenidos: Readonly<Record<string, string | undefined>>, extra: string): string | null;
}

const entradaConTexto =
  (ruta: string) => (contenidos: Readonly<Record<string, string | undefined>>, extra: string) => {
    const texto = contenidos[ruta];
    return texto === undefined || texto.trim() === '' ? null : huella(texto + '\n' + extra);
  };

/** Herramientas que el proyecto puede necesitar, en el orden en que se ofrecen tras una pasada. */
export function candidatas(analisis: AnalisisProyecto, base: string): Candidata[] {
  const lista: Candidata[] = [];

  const auxiliares = [`${base}.aux`, ...analisis.incluidos.map((i) => `${i}.aux`)];
  lista.push({
    clave: 'bibliografia',
    nombre: 'bibliografia',
    cmd: cmdBibtex(base),
    lee: auxiliares,
    huella(contenidos, extra) {
      // BibTeX sigue los auxiliares de capítulos incluidos para encontrar la bibliografía y las citas.
      if (!auxiliares.some((a) => /^\\bibdata\b/m.test(contenidos[a] ?? ''))) return null;
      const lineas = auxiliares.flatMap(
        (a) => (contenidos[a] ?? '').match(/^\\(?:citation|bibstyle|bibdata)\b.*$/gm) ?? [],
      );
      if (!lineas.some((l) => l.startsWith('\\citation'))) return null;
      return huella(lineas.join('\n') + '\n' + extra);
    },
  });

  lista.push({
    clave: 'indice:principal',
    nombre: 'indice',
    cmd: cmdIndice(base),
    lee: [`${base}.idx`],
    huella: entradaConTexto(`${base}.idx`),
  });
  for (const indice of analisis.indicesExtra) {
    lista.push({
      clave: `indice:${indice.nombre}`,
      nombre: 'indice',
      cmd: cmdIndice(indice.nombre, indice.opciones),
      lee: [`${indice.nombre}.idx`],
      huella: entradaConTexto(`${indice.nombre}.idx`),
    });
  }

  lista.push({
    clave: 'nomenclatura',
    nombre: 'nomenclatura',
    cmd: cmdNomenclatura(base),
    lee: [`${base}.nlo`],
    huella: entradaConTexto(`${base}.nlo`),
  });

  const glosarios = [
    { entrada: 'glo', salida: 'gls', bitacora: 'glg' },
    { entrada: 'acn', salida: 'acr', bitacora: 'alg' },
    ...analisis.glosariosExtra,
  ];
  for (const g of glosarios) {
    const entrada = `${base}.${g.entrada}`;
    const estilo = `${base}.ist`;
    lista.push({
      clave: `glosario:${g.entrada}`,
      nombre: 'glosario',
      cmd: cmdGlosario(base, g.entrada, g.salida, g.bitacora),
      lee: [entrada, estilo],
      // Sin el estilo `.ist` (lo escribe TeX con \makeglossaries) no hay forma de armar el glosario con makeindex.
      huella: (contenidos, extra) =>
        contenidos[estilo] === undefined || (contenidos[entrada] ?? '').trim() === ''
          ? null
          : huella((contenidos[entrada] ?? '') + '\n' + contenidos[estilo] + '\n' + extra),
    });
  }
  return lista;
}

/** Cuántos pasos se esperan antes de correr TeX por primera vez (sin conocer aún los archivos generados). */
export function estimarTotalInicial(analisis: AnalisisProyecto, conCache: boolean): number {
  if (conCache) return 1;
  const herramientas =
    (analisis.bibliografia && !analisis.biber ? 1 : 0) +
    (analisis.indice ? 1 : 0) +
    analisis.indicesExtra.length +
    (analisis.nomenclatura ? 1 : 0) +
    (analisis.glosarios ? 1 : 0);
  if (herramientas === 0) return 1;
  return 1 + herramientas + (analisis.bibliografia && !analisis.biber ? 2 : 1);
}

export interface Instantanea {
  candidatas: readonly Candidata[];
  /** Pasadas de TeX hechas en esta compilación. */
  texEjecutadas: number;
  /** Pasos hechos (TeX y herramientas). */
  pasosHechos: number;
  /** Resultado de la última pasada de TeX (`null` si aún no hubo ninguna). */
  ultimaTex: { codigo: number; repetir: boolean; fatal: boolean } | null;
  /** Huella actual de la entrada de cada herramienta (`null` si no hay nada que procesar). */
  entradas: Readonly<Record<string, string | null>>;
  /** Huella con la que cada herramienta corrió por última vez (en esta compilación o la anterior). */
  usadas: Readonly<Record<string, string>>;
  /** ¿Corrió alguna herramienta después de la última pasada de TeX? Entonces falta otra pasada que la use. */
  herramientaTrasUltimaTex: boolean;
  /** ¿Corrió BibTeX en esta compilación? Entonces se esperan dos pasadas de TeX después (referencias de las citas). */
  bibliografiaCorrida?: boolean;
  /** ¿Cambiaron durante la última pasada los auxiliares (referencias, índice general, marcadores)? */
  auxiliaresCambiaron: boolean;
}

export type PasoPlan =
  | { tipo: 'tex'; nombre: 'primera' | 'pasada' | 'final' }
  | { tipo: 'herramienta'; nombre: NombreHerramienta; clave: string; cmd: string[]; huella: string };

export type MotivoFin = 'completo' | 'limite' | 'fatal';

export type Decision = { tipo: 'fin'; motivo: MotivoFin } | { tipo: 'paso'; paso: PasoPlan; total: number };

/** Herramientas con entrada nueva o cambiada desde la última vez que corrieron. */
export function pendientes(i: Instantanea): Array<{ candidata: Candidata; huella: string }> {
  const lista: Array<{ candidata: Candidata; huella: string }> = [];
  for (const candidata of i.candidatas) {
    const actual = i.entradas[candidata.clave];
    if (actual != null && actual !== i.usadas[candidata.clave]) lista.push({ candidata, huella: actual });
  }
  return lista;
}

export function decidir(i: Instantanea, totalInicial = 1): Decision {
  if (i.texEjecutadas === 0 || !i.ultimaTex) {
    return { tipo: 'paso', paso: { tipo: 'tex', nombre: 'primera' }, total: Math.max(1, totalInicial) };
  }
  if (i.ultimaTex.codigo !== 0 || i.ultimaTex.fatal) return { tipo: 'fin', motivo: 'fatal' };

  const faltan = pendientes(i);
  const otraPasada = i.herramientaTrasUltimaTex || i.ultimaTex.repetir || i.auxiliaresCambiaron;
  if (faltan.length === 0 && !otraPasada) return { tipo: 'fin', motivo: 'completo' };
  // Sin pasadas de TeX disponibles, correr herramientas no serviría de nada: sus resultados no se leerían.
  if (i.texEjecutadas >= MAX_PASADAS_TEX) return { tipo: 'fin', motivo: 'limite' };

  const hechos = i.pasosHechos;
  if (faltan.length > 0) {
    const { candidata, huella: h } = faltan[0]!;
    const conBibliografia = faltan.some((f) => f.candidata.nombre === 'bibliografia');
    // Estimación: las herramientas pendientes y, después, 1 pasada de TeX (2 si hay bibliografía).
    const total = hechos + faltan.length + (conBibliografia ? 2 : 1);
    return {
      tipo: 'paso',
      paso: {
        tipo: 'herramienta',
        nombre: candidata.nombre,
        clave: candidata.clave,
        cmd: candidata.cmd,
        huella: h,
      },
      total,
    };
  }
  // Una pasada que sigue a una herramienta aún es intermedia; sin herramientas de por medio se espera que sea la última.
  const nombre = i.herramientaTrasUltimaTex ? 'pasada' : 'final';
  return {
    tipo: 'paso',
    paso: { tipo: 'tex', nombre },
    total: hechos + 1 + (i.bibliografiaCorrida && i.herramientaTrasUltimaTex ? 1 : 0),
  };
}
