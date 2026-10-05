// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analizar } from './index';
import { desenvolver } from './desenvolver';
import { archivoPorLinea } from './pila-archivos';
import { CATALOGO, crearProblema } from './mensajes';
import { analizarBibtex } from './bibtex';
import { analizarMakeindex } from './makeindex';
import { aplanarToml, variablesDe } from '../../../scripts/lib/textos.mjs';
import { TEXTOS_FOLIO } from '../../textos/es.gen';

const fixture = (nombre: string) => readFileSync(new URL('./fixtures/' + nombre, import.meta.url), 'utf8');
const primero = (log: string) => analizar({ log }).problemas[0]!;

describe('tex', () => {
  it.each([
    ['imagen-clasica.log', 'archivo-faltante', 43, { archivo: 'imagenes/senal.png' }],
    ['imagen-file-line.log', 'archivo-faltante', 43, { archivo: 'imagenes/senal.png' }],
    ['paquete.log', 'archivo-faltante', 5, { archivo: 'ejemplo.sty' }],
    ['comando.log', 'comando-indefinido', 8, { comando: '\\comandoInventado' }],
    ['matematicas.log', 'matematicas-delimitador', 9, {}],
    ['llave-extra.log', 'llave-extra', 10, {}],
    ['llave-faltante.log', 'llave-faltante', 11, {}],
    ['argumento.log', 'argumento-incompleto', undefined, {}],
    ['entorno.log', 'entorno-indefinido', 12, { entorno: 'inventado' }],
    ['entorno-cierre.log', 'entorno-cierre', 15, { entorno: 'itemize', cierre: 'enumerate' }],
    ['babel.log', 'idioma-espanol-faltante', 4, {}],
    ['desbordado.log', 'formato-desbordado', 22, { puntos: 12.5 }],
    ['fuente.log', 'fuente-indefinida', 24, {}],
    ['paquete-aviso.log', 'paquete-aviso', 25, { paquete: 'ejemplo' }],
    ['desconocido.log', 'desconocido', 31, { linea: 31 }],
  ])('%s', (nombre, codigo, linea, variables) => {
    expect(primero(fixture(nombre))).toMatchObject({ codigo, linea, variables });
  });

  it('matches classic and explicit image locations', () => {
    const a = primero(fixture('imagen-clasica.log'));
    const b = primero(fixture('imagen-file-line.log'));
    expect({ ...a, original: '' }).toEqual({ ...b, original: '' });
    expect(a).toMatchObject({ gravedad: 'error', archivo: 'capitulos/marco.tex', linea: 43 });
    expect(a.titulo).toContain(String(a.variables?.archivo));
  });
  it('keeps nested input locations', () => {
    expect(analizar({ log: fixture('anidado.log') }).problemas.map((p) => p.archivo)).toEqual([
      'capitulos/detalle.tex',
      'capitulos/marco.tex',
      'principal.tex',
    ]);
  });
  it('detects reference and citation keys', () => {
    const r = analizar({ log: fixture('referencias.log') });
    expect(r.problemas[0]).toMatchObject({
      codigo: 'referencia-indefinida',
      variables: { referencia: 'fig:senal' },
      linea: 20,
      gravedad: 'aviso',
    });
    expect(r.problemas[1]).toMatchObject({
      codigo: 'cita-indefinida',
      variables: { cita: 'obra-demo' },
      linea: 21,
    });
    expect(r.problemas[2]?.codigo).toBe('referencias-indefinidas');
    expect(r.senales).toMatchObject({ citasIndefinidas: true, referenciasIndefinidas: true });
  });
  it('requests another pass', () =>
    expect(analizar({ log: fixture('repetir.log') }).senales.repetirPasada).toBe(true));
  it('requests rerunfilecheck pass', () => {
    const r = analizar({
      log: "Package rerunfilecheck Warning: File `principal.out' has changed.\n(rerunfilecheck)                Rerun to get outlines right.",
    });
    expect(r.senales.repetirPasada).toBe(true);
    expect(r.problemas[0]?.codigo).toBe('repetir-pasada');
  });
  it('leaves clean output empty', () =>
    expect(analizar({ log: fixture('limpia.log') })).toEqual({
      problemas: [],
      senales: {
        repetirPasada: false,
        citasIndefinidas: false,
        referenciasIndefinidas: false,
        fatal: false,
        faltantes: [],
      },
    }));
  it('detects fatal diagnostics', () => {
    const r = analizar({ log: fixture('fatal.log') });
    expect(r.senales.fatal).toBe(true);
    expect(r.problemas.map((p) => p.codigo)).toEqual(['compilacion-detenida', 'compilacion-fatal']);
  });
  it('returns missing package and language names', () => {
    expect(analizar({ log: fixture('paquete.log') }).senales.faltantes).toEqual(['ejemplo.sty']);
    expect(analizar({ log: fixture('babel.log') }).senales.faltantes).toEqual(['spanish.ldf']);
  });
  it.each([0, 9.9, 10])('ignores overfull boxes at %s pt', (n) =>
    expect(
      analizar({ log: `Overfull \\hbox (${n}pt too wide) in paragraph at lines 2--3` }).problemas,
    ).toEqual([]),
  );
  it('groups identical diagnostics and keeps distinct details', () => {
    const log =
      './principal.tex:8: Undefined control sequence.\nl.8 \\uno\n./principal.tex:8: Undefined control sequence.\nl.8 \\dos';
    const r = analizar({ log });
    expect(r.problemas).toHaveLength(1);
    expect(r.problemas[0]?.original).toContain('\\uno');
    expect(r.problemas[0]?.original).toContain('\\dos');
    expect(analizar({ log: fixture('paquete.log') + fixture('paquete.log') }).senales.faltantes).toEqual([
      'ejemplo.sty',
    ]);
  });
  it('keeps separate source lines', () =>
    expect(
      analizar({ log: './principal.tex:2: Missing $ inserted.\n./principal.tex:3: Missing $ inserted.' })
        .problemas,
    ).toHaveLength(2));
  it('does not guess a missing location', () =>
    expect(primero('! Another diagnostic.')).toMatchObject({
      codigo: 'desconocido',
      variables: { linea: '?' },
      archivo: undefined,
      linea: undefined,
    }));
  it('does not mutate inputs or retain state', () => {
    const entrada = Object.freeze({ log: fixture('imagen-clasica.log') });
    const r = analizar(entrada);
    r.senales.faltantes.push('modified');
    expect(analizar(entrada).senales.faltantes).toEqual(['imagenes/senal.png']);
    expect(analizar({ log: '' }).problemas).toEqual([]);
  });
});

describe('additional diagnostic boundaries', () => {
  it('locates classic errors after help and blank lines', () => {
    const p = primero(
      '(./principal.tex\n! Missing } inserted.\n<inserted text>\n                }\n\nl.37 texto\n)',
    );
    expect(p).toMatchObject({ archivo: 'principal.tex', linea: 37, codigo: 'llave-faltante' });
    expect(p.original).toContain('\n\nl.37');
  });
  it('prefers the recently read undefined command', () => {
    expect(
      primero('! Undefined control sequence.\n<recently read> \\inventado\n\nl.38 \\textbf{texto}').variables,
    ).toEqual({ comando: '\\inventado' });
  });
  it('recognizes multiline explicit diagnostics', () => {
    expect(
      primero("./principal.tex:4: Package babel Error:\n(babel) Unknown option `spanish'."),
    ).toMatchObject({ codigo: 'idioma-espanol-faltante', archivo: 'principal.tex', linea: 4 });
  });
  it('supports explicit project filenames containing spaces', () => {
    expect(primero('./capitulos/marco teorico.tex:6: Missing $ inserted.')).toMatchObject({
      archivo: 'capitulos/marco teorico.tex',
      linea: 6,
    });
  });
  it('does not detect undefined references from unrelated output', () => {
    expect(
      analizar({ log: 'Reference guide loaded\n! LaTeX Error: Environment demo undefined.\nl.5 text' })
        .senales.referenciasIndefinidas,
    ).toBe(false);
  });
  it('keeps original wrapped warning details', () => {
    const a = 'Package demo Warning: ' + 'a'.repeat(57);
    const p = primero(a + '\ncontinued on input line 7.');
    expect(p).toMatchObject({
      codigo: 'paquete-aviso',
      linea: 7,
      original: a + '\ncontinued on input line 7.',
    });
  });
  it('keeps HTML-sensitive variables escaped by the shared formatter', () => {
    const p = primero(
      "! LaTeX Error: File `imagenes/a&b.png' not found.\nl.2 \\includegraphics{imagenes/a&b.png}",
    );
    expect(p.variables).toEqual({ archivo: 'imagenes/a&b.png' });
    expect(p.titulo).toContain('a&amp;b.png');
    expect(p.original).toContain('a&b.png');
  });
  it('uses a text key for nonauthor empty fields', () => {
    const p = analizarBibtex('Warning--empty year in demo')[0];
    expect(p?.variables).toEqual({
      campo: TEXTOS_FOLIO['errores.latex.bibliografia_campo_vacio.campo_otro'],
      cita: 'demo',
    });
    expect(p?.original).toContain('year');
  });
});

describe('file stack', () => {
  it('ignores nonfile balanced parentheses', () =>
    expect(
      archivoPorLinea(desenvolver('(./principal.tex\n(text (nested))\n! Missing $ inserted.\nl.9 (x)\n)')),
    ).toEqual(['principal.tex', 'principal.tex', 'principal.tex', 'principal.tex', undefined]));
  it('does not report TeX Live paths as project files', () =>
    expect(archivoPorLinea(desenvolver('(/texmf/article.cls\n! Missing $ inserted.\n)'))).toEqual([
      undefined,
      undefined,
      undefined,
    ]));
  it('keeps project location while library is active', () =>
    expect(archivoPorLinea(desenvolver('(./principal.tex\n(/texmf/a.sty\n! Missing $ inserted.'))).toEqual([
      'principal.tex',
      'principal.tex',
      'principal.tex',
    ]));
  it('supports quoted paths with spaces', () =>
    expect(
      archivoPorLinea(
        desenvolver('(./principal.tex\n("./capitulos/marco teorico.tex"\n! Missing $ inserted.'),
      )[2],
    ).toBe('capitulos/marco teorico.tex'));
});

describe('wrapping', () => {
  it('joins an unfinished warning at 79 columns and preserves original', () => {
    const linea = 'Package demo Warning: ' + 'a'.repeat(57);
    const log = linea + '\ncontinued on input line 7.';
    expect(linea).toHaveLength(79);
    expect(desenvolver(log)).toEqual([{ texto: linea + 'continued on input line 7.', original: log }]);
  });
  it('keeps ordinary 79-column lines', () => expect(desenvolver('x'.repeat(79) + '\nnext')).toHaveLength(2));
  it('keeps completed diagnostics at 79 columns', () =>
    expect(desenvolver('! ' + 'x'.repeat(76) + '.\nnext')).toHaveLength(2));
  it('never joins an error with a source location', () =>
    expect(desenvolver('! ' + 'x'.repeat(77) + '\nl.3 text')).toHaveLength(2));
  it('handles CRLF and chained wraps', () => {
    const a = '! ' + 'a'.repeat(77);
    expect(desenvolver(a + '\r\n' + 'b'.repeat(79) + '\r\nend')[0]).toEqual({
      texto: a + 'b'.repeat(79) + 'end',
      original: a + '\n' + 'b'.repeat(79) + '\nend',
    });
  });
  it('joins wrapped project file paths', () => {
    const a = '(./' + 'a'.repeat(76);
    expect(archivoPorLinea(desenvolver(a + '\n.tex\n! Missing $ inserted.'))[1]).toBe(
      'a'.repeat(76) + '.tex',
    );
  });
});

describe('bibtex and makeindex', () => {
  it('reads field, entry and syntax diagnostics', () => {
    expect(analizarBibtex(fixture('bibliografia.blg'))).toMatchObject([
      {
        codigo: 'bibliografia-campo-vacio',
        gravedad: 'aviso',
        archivo: 'referencias.bib',
        variables: {
          campo: TEXTOS_FOLIO['errores.latex.bibliografia_campo_vacio.campo_autor'],
          cita: 'obra-demo',
        },
      },
      { codigo: 'bibliografia-entrada-faltante', variables: { cita: 'otra-obra' } },
      {
        codigo: 'bibliografia-sintaxis',
        gravedad: 'error',
        archivo: 'referencias.bib',
        linea: 7,
        variables: { linea: 7 },
      },
    ]);
  });
  it('reads missing database and absent citations', () =>
    expect(analizarBibtex(fixture('bibliografia-faltante.blg'))).toMatchObject([
      { codigo: 'bibliografia-faltante', variables: { archivo: 'ausente.bib' } },
      { codigo: 'bibliografia-sin-citas' },
    ]));
  it('keeps multiline syntax detail', () =>
    expect(analizarBibtex('Illegal end of database file\n---line 9 of file demo.bib').at(-1)).toMatchObject({
      codigo: 'bibliografia-sintaxis',
      archivo: 'demo.bib',
      linea: 9,
      original: 'Illegal end of database file\n---line 9 of file demo.bib',
    }));
  it('reads rejected entries and warnings', () => {
    const r = analizarMakeindex(fixture('indice.ilg'));
    expect(r[0]).toMatchObject({ codigo: 'indice-rechazadas', gravedad: 'aviso', variables: { n: 2 } });
    expect(r[1]).toMatchObject({
      codigo: 'indice-aviso',
      gravedad: 'aviso',
      archivo: 'principal.idx',
      linea: 6,
    });
    expect(r[1]?.original).toContain('Conflicting entries.');
  });
  it('ignores clean index totals', () =>
    expect(analizarMakeindex('done (4 entries accepted, 0 rejected).')).toEqual([]));
  it('supports singular rejected entry', () =>
    expect(analizarMakeindex('done (1 entry accepted, 1 rejected).')[0]?.variables).toEqual({ n: 1 }));
  it('integrates all three logs and their signals', () => {
    const r = analizar({
      log: fixture('repetir.log'),
      blg: fixture('bibliografia-faltante.blg') + fixture('bibliografia.blg'),
      ilg: fixture('indice.ilg'),
    });
    expect(r.problemas).toHaveLength(8);
    expect(r.senales).toMatchObject({
      repetirPasada: true,
      citasIndefinidas: true,
      faltantes: ['ausente.bib'],
    });
  });
});

describe('catalog contract', () => {
  const textos = aplanarToml(
    readFileSync(new URL('../../../contenido/textos/es.toml', import.meta.url), 'utf8'),
  ).textos as Record<string, string>;
  it.each(Object.entries(CATALOGO))('%s has keys and matching variables', (_id, entrada) => {
    expect(textos[entrada.titulo]).toBeTypeOf('string');
    expect(textos[entrada.ayuda]).toBeTypeOf('string');
    const vars = [
      ...new Set([...variablesDe(textos[entrada.titulo]), ...variablesDe(textos[entrada.ayuda])]),
    ].sort();
    expect(vars).toEqual([...entrada.variables].sort());
    const valores = Object.fromEntries(entrada.variables.map((v) => [v, v === 'n' ? 2 : 'demo']));
    const p = crearProblema(
      { codigo: entrada.codigo, variante: _id, variables: valores },
      { gravedad: 'error', original: 'diagnostic' },
    );
    expect(p.codigo).toBe(entrada.codigo);
    expect(p.variables).toEqual(valores);
    expect(p.titulo + p.accion).not.toMatch(/\{[a-z_]|errores\.latex/);
  });
  it('keeps generated texts in sync with TOML', () => expect(TEXTOS_FOLIO).toEqual(textos));
  it('formats index plurals with ICU', () => {
    const uno = crearProblema(
      { codigo: 'indice-rechazadas', variables: { n: 1 } },
      { gravedad: 'aviso', original: '' },
    );
    const dos = crearProblema(
      { codigo: 'indice-rechazadas', variables: { n: 2 } },
      { gravedad: 'aviso', original: '' },
    );
    expect(uno.titulo).toContain('1');
    expect(dos.titulo).toContain('2');
    expect(uno.titulo).not.toEqual(dos.titulo);
  });
  it('provides at least 15 synthetic TeX fixtures', () =>
    expect(
      readdirSync(new URL('./fixtures/', import.meta.url)).filter((n) => n.endsWith('.log')).length,
    ).toBeGreaterThanOrEqual(15));
});
