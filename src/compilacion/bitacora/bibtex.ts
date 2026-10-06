// SPDX-License-Identifier: AGPL-3.0-or-later
import { crearProblema } from './mensajes';
import type { Problema } from './tipos';

export function analizarBibtex(blg: string): Problema[] {
  let archivo: string | undefined;
  const problemas: Problema[] = [];
  const lineas = blg.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lineas.length; i++) {
    const texto = lineas[i] ?? '';
    const base = /^Database file #\d+:\s*(.+)/.exec(texto);
    if (base) archivo = base[1]?.replace(/^\.\//, '');
    const faltante = /I couldn't open database file\s+(.+)/.exec(texto);
    const vacio = /Warning--empty (\w+) in (.+)/.exec(texto);
    const entrada = /Warning--I didn't find a database entry for ["'](.+)["']/.exec(texto);
    const sintaxis = /---line (\d+) of file (.+)/.exec(texto);
    // Con una base de datos que no abre, BibTeX añade líneas de contexto y consecuencias: pertenecen al mismo problema.
    const previoFaltante = problemas.at(-1)?.codigo === 'bibliografia-faltante';
    if (previoFaltante && /^---line \d+ of file /.test(texto)) {
      problemas.at(-1)!.original += '\n' + texto;
      continue;
    }
    if (
      problemas.some((p) => p.codigo === 'bibliografia-faltante') &&
      /^(?:I found no database files|I'm skipping whatever remains)/.test(texto)
    )
      continue;
    const vars: Record<string, string | number> = {};
    let codigo: string | undefined;
    let variante: string | undefined;
    if (faltante) {
      codigo = 'bibliografia-faltante';
      vars.archivo = faltante[1]!.trim();
    } else if (/I found no \\citation commands/.test(texto)) codigo = 'bibliografia-sin-citas';
    else if (vacio) {
      codigo = 'bibliografia-campo-vacio';
      if (vacio[1] === 'author') variante = 'bibliografia-autor-vacio';
      else vars.campo = vacio[1]!;
      vars.cita = vacio[2]!.trim();
    } else if (entrada) {
      codigo = 'bibliografia-entrada-faltante';
      vars.cita = entrada[1]!;
    } else if (sintaxis) {
      codigo = 'bibliografia-sintaxis';
      vars.linea = Number(sintaxis[1]);
    } else if (
      /^(?:Warning--|I couldn't |I found no |You're missing |Illegal |Repeated entry|I'm skipping )/.test(
        texto,
      ) &&
      !/^---line/.test(lineas[i + 1] ?? '')
    ) {
      codigo = 'desconocido';
      vars.linea = '?';
    }
    if (!codigo) continue;
    const anterior = lineas[i - 1] ?? '';
    const original = sintaxis && texto.startsWith('---line') ? anterior + '\n' + texto : texto;
    problemas.push(
      crearProblema(
        { codigo, variables: vars, variante },
        {
          gravedad: texto.startsWith('Warning--') ? 'aviso' : 'error',
          archivo: sintaxis ? sintaxis[2]?.replace(/^\.\//, '') : archivo,
          linea: sintaxis ? Number(sintaxis[1]) : undefined,
          original,
        },
      ),
    );
  }
  return problemas;
}
