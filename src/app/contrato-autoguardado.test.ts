// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrato «todo vía autoguardado» (HANDOFF 02, sesión 11): la interfaz nunca llama a un método del almacén que
// escribe, renombra o borra; todo pasa por `auto`, para que un cambio pendiente no resucite una ruta vieja ni se
// pierda al mandar algo a la papelera. Leer (listar, leer, obtener) y guardar ajustes sí se puede.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RAIZ = fileURLToPath(new URL('.', import.meta.url));
const PROHIBIDO =
  /almacen\s*\.\s*(escribir|renombrar|moverAPapelera|moverArchivosAPapelera|restaurar|restaurarDePapelera|borrarDefinitivo|vaciarPapelera|purgarCaducados|borrar)\s*\(/;

function fuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta));
    else if (/\.(ts|svelte)$/.test(nombre) && !/\.test\.ts$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

describe('contrato del autoguardado', () => {
  it('ningún archivo de src/app llama a métodos de escritura del almacén', () => {
    const infractores = fuentes(RAIZ).filter((f) => PROHIBIDO.test(readFileSync(f, 'utf8')));
    expect(infractores.map((f) => relative(RAIZ, f))).toEqual([]);
  });

  it('la prueba sabe reconocer una llamada prohibida', () => {
    expect(PROHIBIDO.test('await s.almacen.restaurar(id);')).toBe(true);
    expect(PROHIBIDO.test('await this.servicios.almacen.moverArchivosAPapelera(id, ruta)')).toBe(true);
    expect(PROHIBIDO.test('await auto.restaurarDePapelera(id)')).toBe(false);
    expect(PROHIBIDO.test('await almacen.listarPapelera()')).toBe(false);
  });
});
