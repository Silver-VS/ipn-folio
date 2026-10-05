// SPDX-License-Identifier: AGPL-3.0-or-later
import { crearProblema } from './mensajes';
import type { Problema } from './tipos';

export function analizarMakeindex(ilg: string): Problema[] {
  const problemas: Problema[] = [];
  for (const m of ilg.matchAll(/^.*?(\d+) entr(?:y|ies) accepted, (\d+) rejected.*$/gm)) {
    const n = Number(m[2]);
    if (n > 0)
      problemas.push(
        crearProblema(
          { codigo: 'indice-rechazadas', variables: { n } },
          { gravedad: 'aviso', original: m[0] },
        ),
      );
  }
  for (const m of ilg.matchAll(
    /^## Warning[^\n]*(?:\n(?!##|Scanning |Sorting |Generating |Output |Transcript |Overall |done\b)[^\n]+)*/gm,
  )) {
    const ubicacion = /(?:input = |(?:input )?file )(.+?), line (?:= )?(\d+)/.exec(m[0]);
    problemas.push(
      crearProblema(
        { codigo: 'indice-aviso', variables: {} },
        {
          gravedad: 'aviso',
          original: m[0],
          archivo: ubicacion?.[1]?.replace(/^\.\//, ''),
          linea: ubicacion ? Number(ubicacion[2]) : undefined,
        },
      ),
    );
  }
  return problemas;
}
