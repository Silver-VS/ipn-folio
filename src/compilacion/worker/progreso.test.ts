// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { medirDescarga, ProgresoDescarga, totalesDeActivos } from './progreso';

describe('ProgresoDescarga', () => {
  it('suma wasm y datos: eventos crecientes hasta el total', () => {
    const eventos: Array<[number, number]> = [];
    const p = new ProgresoDescarga((c, t) => eventos.push([c, t]), { wasm: 1000, datos: 3000 });
    for (let c = 100; c <= 1000; c += 100) p.wasm(c);
    p.wasmTerminado();
    for (let c = 300; c <= 3000; c += 300) p.datos(c, 3000);
    p.terminar();
    expect(eventos.length).toBeGreaterThan(5);
    for (let i = 1; i < eventos.length; i++)
      expect(eventos[i]![0]).toBeGreaterThanOrEqual(eventos[i - 1]![0]);
    expect(eventos.at(-1)).toEqual([4000, 4000]);
    expect(eventos.every(([c, t]) => c <= t)).toBe(true);
  });

  it('si los datos ya estaban en caché, el total solo cuenta lo descargado', () => {
    const eventos: Array<[number, number]> = [];
    const p = new ProgresoDescarga((c, t) => eventos.push([c, t]), { wasm: 1000, datos: 3000 });
    p.wasm(500);
    p.wasm(1000);
    p.wasmTerminado();
    p.terminar();
    expect(eventos.at(-1)).toEqual([1000, 1000]);
  });

  it('sin totales conocidos, usa el total que reportan los datos y el tamaño real del wasm', () => {
    const eventos: Array<[number, number]> = [];
    const p = new ProgresoDescarga((c, t) => eventos.push([c, t]));
    p.wasm(400);
    p.wasm(800);
    p.wasmTerminado();
    p.datos(1000, 2000);
    p.datos(2000, 2000);
    p.terminar();
    expect(eventos.at(-1)).toEqual([2800, 2800]);
  });
});

describe('medirDescarga', () => {
  it('cuenta los bytes sin alterar el cuerpo ni las cabeceras', async () => {
    const trozos = [new Uint8Array([0, 97, 115, 109]), new Uint8Array([1, 0, 0, 0, 9, 9])];
    const original = new Response(
      new ReadableStream({
        start(c) {
          trozos.forEach((t) => c.enqueue(t));
          c.close();
        },
      }),
      { status: 200, headers: { 'content-type': 'application/wasm' } },
    );
    const avances: number[] = [];
    let terminado = 0;
    const medida = medirDescarga(
      original,
      (acumulado) => avances.push(acumulado),
      () => terminado++,
    );
    expect(medida.ok).toBe(true);
    expect(medida.headers.get('content-type')).toBe('application/wasm');
    const bytes = new Uint8Array(await medida.arrayBuffer());
    expect([...bytes]).toEqual([0, 97, 115, 109, 1, 0, 0, 0, 9, 9]);
    expect(avances).toEqual([4, 10]);
    expect(terminado).toBe(1);
  });
});

describe('totalesDeActivos', () => {
  const activos = {
    archivos: [
      { nombre: 'busytex.wasm', bytes: 32507525 },
      { nombre: 'texlive-basic.data', bytes: 92785062 },
    ],
  };

  it('toma los bytes del wasm y de los .data del catálogo', () => {
    expect(totalesDeActivos(activos, ['texlive-basic.js'])).toEqual({ wasm: 32507525, datos: 92785062 });
  });

  it('si falta algún paquete del catálogo o el JSON no sirve, no inventa totales', () => {
    expect(totalesDeActivos(activos, ['texlive-extra.js']).datos).toBeUndefined();
    expect(totalesDeActivos(null, ['texlive-basic.js'])).toEqual({});
  });
});
