// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { analizarProyecto } from './analisis-proyecto';
import { MAX_PASADAS_TEX, candidatas, decidir, estimarTotalInicial } from './plan';
import type { Instantanea } from './plan';

const analisis = analizarProyecto([{ ruta: 'main.tex', contenido: '\\bibliography{r}\n\\makeindex' }]);
const lista = candidatas(analisis, 'main');

const inicial = (): Instantanea => ({
  candidatas: lista,
  texEjecutadas: 0,
  pasosHechos: 0,
  ultimaTex: null,
  entradas: {},
  usadas: {},
  herramientaTrasUltimaTex: false,
  auxiliaresCambiaron: false,
});
const trasTex = (extra: Partial<Instantanea>): Instantanea => ({
  ...inicial(),
  texEjecutadas: 1,
  pasosHechos: 1,
  ultimaTex: { codigo: 0, repetir: false, fatal: false },
  ...extra,
});

describe('decidir', () => {
  it('lo primero siempre es la primera pasada de TeX', () => {
    expect(decidir(inicial())).toEqual({ tipo: 'paso', paso: { tipo: 'tex', nombre: 'primera' }, total: 1 });
    expect(decidir(inicial(), 4)).toMatchObject({ total: 4 });
  });

  it('sin trabajo pendiente termina', () => {
    expect(decidir(trasTex({}))).toEqual({ tipo: 'fin', motivo: 'completo' });
  });

  it('un código de salida distinto de 0 o un fatal detienen todo', () => {
    expect(decidir(trasTex({ ultimaTex: { codigo: 1, repetir: false, fatal: false } }))).toEqual({
      tipo: 'fin',
      motivo: 'fatal',
    });
    expect(decidir(trasTex({ ultimaTex: { codigo: 0, repetir: true, fatal: true } }))).toEqual({
      tipo: 'fin',
      motivo: 'fatal',
    });
  });

  it('corre una herramienta cuya entrada es nueva y no otra cuya entrada no cambió', () => {
    const d = decidir(
      trasTex({
        entradas: { bibliografia: 'h1', 'indice:principal': 'h2' },
        usadas: { 'indice:principal': 'h2' },
      }),
    );
    expect(d).toMatchObject({
      tipo: 'paso',
      paso: { tipo: 'herramienta', nombre: 'bibliografia', huella: 'h1' },
    });
  });

  it('una herramienta sin entrada (null) nunca corre', () => {
    expect(decidir(trasTex({ entradas: { bibliografia: null } }))).toEqual({
      tipo: 'fin',
      motivo: 'completo',
    });
  });

  it('tras una herramienta hace falta una pasada de TeX que use su resultado', () => {
    const d = decidir(
      trasTex({
        pasosHechos: 2,
        herramientaTrasUltimaTex: true,
        entradas: { bibliografia: 'h' },
        usadas: { bibliografia: 'h' },
      }),
    );
    expect(d).toMatchObject({ tipo: 'paso', paso: { tipo: 'tex', nombre: 'pasada' } });
  });

  it('pide otra pasada si TeX lo dice o si cambiaron los auxiliares, y la llama «final»', () => {
    expect(decidir(trasTex({ ultimaTex: { codigo: 0, repetir: true, fatal: false } }))).toMatchObject({
      paso: { tipo: 'tex', nombre: 'final' },
    });
    expect(decidir(trasTex({ auxiliaresCambiaron: true }))).toMatchObject({
      paso: { tipo: 'tex', nombre: 'final' },
    });
  });

  it(`no pasa de ${MAX_PASADAS_TEX} pasadas de TeX`, () => {
    const d = decidir(
      trasTex({
        texEjecutadas: MAX_PASADAS_TEX,
        pasosHechos: 7,
        ultimaTex: { codigo: 0, repetir: true, fatal: false },
      }),
    );
    expect(d).toEqual({ tipo: 'fin', motivo: 'limite' });
    // Tampoco corre herramientas que ya no podrían usarse.
    expect(decidir(trasTex({ texEjecutadas: MAX_PASADAS_TEX, entradas: { bibliografia: 'h' } }))).toEqual({
      tipo: 'fin',
      motivo: 'limite',
    });
  });

  it('el total estimado incluye las herramientas pendientes y las dos pasadas que exige la bibliografía', () => {
    const d = decidir(trasTex({ entradas: { bibliografia: 'h1', 'indice:principal': 'h2' } }));
    expect(d).toMatchObject({ total: 1 + 2 + 2 });
  });
});

describe('candidatas', () => {
  it('BibTeX necesita \\bibdata y al menos una \\citation (también en el .aux de un capítulo)', () => {
    const con = analizarProyecto([{ ruta: 'main.tex', contenido: '\\include{cap}' }]);
    const bib = candidatas(con, 'main')[0]!;
    expect(bib.lee).toEqual(['main.aux', 'cap.aux']);
    expect(bib.huella({ 'main.aux': '\\bibdata{r}\n' }, '')).toBeNull();
    expect(bib.huella({ 'main.aux': '\\citation{a}\n' }, '')).toBeNull();
    const h = bib.huella({ 'main.aux': '\\bibdata{r}\n', 'cap.aux': '\\citation{a}\n' }, 'x');
    expect(h).not.toBeNull();
    // Cambia con las citas y con los .bib, pero no con los números de página del .aux.
    expect(bib.huella({ 'main.aux': '\\bibdata{r}\n', 'cap.aux': '\\citation{a}\n' }, 'y')).not.toBe(h);
    expect(
      bib.huella({ 'main.aux': '\\bibdata{r}\n\\newlabel{x}{{1}{3}}\n', 'cap.aux': '\\citation{a}\n' }, 'x'),
    ).toBe(h);
  });

  it('un índice vacío no se procesa', () => {
    const idx = candidatas(analisis, 'main').find((c) => c.clave === 'indice:principal')!;
    expect(idx.huella({ 'main.idx': '  \n' }, '')).toBeNull();
    expect(idx.huella({}, '')).toBeNull();
    expect(idx.huella({ 'main.idx': '\\indexentry{a}{1}\n' }, '')).not.toBeNull();
  });
});

describe('estimarTotalInicial', () => {
  it('un documento sin herramientas son un paso; con bibliografía, cuatro; con caché, uno', () => {
    expect(estimarTotalInicial(analizarProyecto([{ ruta: 'a.tex', contenido: 'x' }]), false)).toBe(1);
    expect(
      estimarTotalInicial(analizarProyecto([{ ruta: 'a.tex', contenido: '\\bibliography{r}' }]), false),
    ).toBe(4);
    expect(
      estimarTotalInicial(analizarProyecto([{ ruta: 'a.tex', contenido: '\\bibliography{r}' }]), true),
    ).toBe(1);
  });
  it('con biblatex+Biber no cuenta BibTeX', () => {
    const a = analizarProyecto([
      { ruta: 'a.tex', contenido: '\\usepackage{biblatex}\\addbibresource{r.bib}' },
    ]);
    expect(estimarTotalInicial(a, false)).toBe(1);
  });
});
