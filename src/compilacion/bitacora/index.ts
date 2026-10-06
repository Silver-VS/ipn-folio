// SPDX-License-Identifier: AGPL-3.0-or-later
import { analizarTex } from './tex';
import { analizarBibtex } from './bibtex';
import { analizarMakeindex } from './makeindex';
import type { ResultadoAnalisis } from './tipos';
export type { Gravedad, Problema, Senales, ResultadoAnalisis } from './tipos';

export function analizar({
  log,
  blg = '',
  ilg = '',
}: {
  log: string;
  blg?: string;
  ilg?: string;
}): ResultadoAnalisis {
  const resultado = analizarTex(log);
  resultado.problemas.push(...analizarBibtex(blg), ...analizarMakeindex(ilg));
  for (const p of resultado.problemas) {
    if (p.codigo === 'bibliografia-faltante') resultado.senales.faltantes.push(String(p.variables?.archivo));
    if (p.codigo === 'bibliografia-entrada-faltante') resultado.senales.citasIndefinidas = true;
  }
  const unicos = new Map<string, (typeof resultado.problemas)[number]>();
  for (const p of resultado.problemas) {
    // Sin línea no hay forma de saber si dos diagnósticos son el mismo: se agrupan solo si las variables coinciden.
    const clave = JSON.stringify([p.codigo, p.archivo, p.linea, p.linea === undefined ? p.variables : null]);
    const previo = unicos.get(clave);
    if (!previo) unicos.set(clave, p);
    // Keep every distinct diagnostic in the detail even when its location is grouped.
    else if (!previo.original.split('\n\n').includes(p.original)) previo.original += '\n\n' + p.original;
  }
  resultado.problemas = [...unicos.values()];
  resultado.senales.faltantes = [...new Set(resultado.senales.faltantes)];
  return resultado;
}
