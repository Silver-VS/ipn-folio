// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { crearAlmacenMemoria, exportarZip, importarZip } from '../almacen';
import { cargarCatalogo, filtrarPlantillas, type Plantilla } from './catalogo';
import { crearDesdePlantilla } from './crear-desde-plantilla';

const catalogo = JSON.parse(readFileSync('public/plantillas/catalogo.json', 'utf8')) as Plantilla[];
afterEach(() => vi.unstubAllGlobals());

it('muestra las generales y las de la unidad elegida, con opción de ver todas', () => {
  const local = { ...catalogo[0]!, id: 'otra', unidad: 'escom' };
  expect(filtrarPlantillas([...catalogo, local], 'upibi')).toEqual(catalogo);
  expect(filtrarPlantillas([...catalogo, local], 'escom')).toHaveLength(2);
  expect(filtrarPlantillas([...catalogo, local], 'upibi', true)).toHaveLength(2);
});

it('crea desde fuentes reales, exporta e importa con archivos y principal idénticos', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('plantillas-locales/catalogo.json')) return Response.json([]);
      return new Response(readFileSync(`public/${url.replace(/^\.\//, '/').replace(/^\//, '')}`));
    }),
  );
  const plantilla = (await cargarCatalogo())[0]!;
  const almacen = crearAlmacenMemoria();
  const original = await crearDesdePlantilla(almacen, plantilla);
  const copia = (await importarZip(almacen, await exportarZip(almacen, original.id), 'copia.zip')).proyecto;
  expect(copia.principal).toBe(original.principal);
  for (const ruta of plantilla.archivos) {
    expect((await almacen.leer(copia.id, ruta))?.contenido).toEqual(
      (await almacen.leer(original.id, ruta))?.contenido,
    );
  }
});

it('una descarga incompleta o ruta peligrosa no deja un proyecto parcial', async () => {
  const almacen = crearAlmacenMemoria();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 404 })),
  );
  await expect(crearDesdePlantilla(almacen, catalogo[0]!)).rejects.toThrow('HTTP 404');
  await expect(
    crearDesdePlantilla(almacen, { ...catalogo[0]!, archivos: ['../secreto.tex'] }),
  ).rejects.toThrow();
  expect(await almacen.listarProyectos()).toEqual([]);
});
