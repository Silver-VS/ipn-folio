// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  caducadosCon,
  caducaEl,
  diasRestantes,
  diasValidos,
  estaCaducado,
  MS_DIA,
  MS_HORA,
  ocupaMucho,
  requiereResello,
  sellar,
  tamanoTotal,
  tocaPurgar,
} from './papelera';
import type { ElementoPapelera } from './tipos';

const T0 = 1_800_000_000_000;

function elemento(parcial: Partial<ElementoPapelera>): ElementoPapelera {
  return {
    id: 'x',
    clase: 'archivo',
    proyectoId: 'p',
    nombreProyecto: 'Proyecto',
    ruta: 'a.tex',
    fecha: T0,
    fechaConfiable: true,
    tamano: 10,
    cuantos: 1,
    ...parcial,
  };
}

describe('caducidad', () => {
  it('suma días y margen', () => {
    expect(caducaEl(T0, 30)).toBe(T0 + 30 * MS_DIA);
    expect(caducaEl(T0, 30, 1)).toBe(T0 + 31 * MS_DIA);
  });

  it('con 30 días y margen de 1, a 30 d 23 h aún no; a 31 d sí', () => {
    expect(estaCaducado(T0, 30, 1, T0 + 30 * MS_DIA + 23 * MS_HORA)).toBe(false);
    expect(estaCaducado(T0, 30, 1, T0 + 31 * MS_DIA)).toBe(true);
    expect(estaCaducado(T0, 7, 1, T0 + 8 * MS_DIA)).toBe(true);
    expect(estaCaducado(T0, 7, 1, T0 + 7 * MS_DIA)).toBe(false);
  });

  it('diasRestantes redondea hacia arriba y nunca es negativo', () => {
    expect(diasRestantes(T0, 30, T0)).toBe(30);
    expect(diasRestantes(T0, 30, T0 + MS_HORA)).toBe(30);
    expect(diasRestantes(T0, 30, T0 + 29 * MS_DIA + MS_HORA)).toBe(1);
    expect(diasRestantes(T0, 30, T0 + 40 * MS_DIA)).toBe(0);
  });

  it('caducadosCon ignora los de fecha sin confirmar', () => {
    const lista = [
      elemento({ id: 'a', fecha: T0 }),
      elemento({ id: 'b', fecha: T0, fechaConfiable: false }),
      elemento({ id: 'c', fecha: T0 + 20 * MS_DIA }),
    ];
    expect(caducadosCon(lista, 7, 1, T0 + 10 * MS_DIA).map((e) => e.id)).toEqual(['a']);
  });
});

describe('tocaPurgar', () => {
  const seis = 6 * MS_HORA;
  it('la primera vez toca', () => {
    expect(tocaPurgar(undefined, T0, seis)).toBe(true);
  });
  it('a 5 h 59 min no; a 6 h sí', () => {
    expect(tocaPurgar(T0, T0 + seis - 60_000, seis)).toBe(false);
    expect(tocaPurgar(T0, T0 + seis, seis)).toBe(true);
  });
  it('una marca en el futuro (la hora cambió) también toca', () => {
    expect(tocaPurgar(T0 + MS_DIA, T0, seis)).toBe(true);
  });
});

describe('tamaño y avisos', () => {
  it('suma los bytes', () => {
    expect(tamanoTotal([elemento({ tamano: 3 }), elemento({ tamano: 4 })])).toBe(7);
    expect(tamanoTotal([])).toBe(0);
  });

  it('avisa por megas o por fracción del uso, y nunca si está vacía', () => {
    const MB = 1024 * 1024;
    expect(ocupaMucho(0, 100 * MB, 100, 0.25)).toBe(false);
    expect(ocupaMucho(99 * MB, undefined, 100, 0.25)).toBe(false);
    expect(ocupaMucho(100 * MB, undefined, 100, 0.25)).toBe(true);
    expect(ocupaMucho(30 * MB, 100 * MB, 100, 0.25)).toBe(true);
    expect(ocupaMucho(20 * MB, 100 * MB, 100, 0.25)).toBe(false);
  });
});

describe('ajuste de días', () => {
  it('un valor fuera de las opciones vale el de omisión', () => {
    expect(diasValidos(90, [7, 30, 90], 30)).toBe(90);
    expect(diasValidos(15, [7, 30, 90], 30)).toBe(30);
    expect(diasValidos('7', [7, 30, 90], 30)).toBe(30);
    expect(diasValidos(undefined, [7, 30, 90], 30)).toBe(30);
    expect(diasValidos(Number.NaN, [7, 30, 90], 30)).toBe(30);
  });
});

describe('sello de entrada', () => {
  it('con hora confiable la fecha lo es; sin ella usa el reloj del equipo', () => {
    expect(sellar(T0, () => 5)).toEqual({ fecha: T0, fechaConfiable: true });
    expect(sellar(undefined, () => 5)).toEqual({ fecha: 5, fechaConfiable: false });
  });
  it('con hora confiable nunca sella antes del reloj del equipo (equivocarse hacia el futuro es seguro)', () => {
    expect(sellar(T0, () => T0 + 100)).toEqual({ fecha: T0 + 100, fechaConfiable: true });
  });
  it('se vuelve a sellar lo no confiable y lo que está en el futuro', () => {
    expect(requiereResello(T0, true, T0)).toBe(false);
    expect(requiereResello(T0, false, T0 + 1)).toBe(true);
    expect(requiereResello(T0 + 1, true, T0)).toBe(true);
  });
});
