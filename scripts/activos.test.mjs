// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { adaptarCargador } from './activos.mjs';

it('3: el cargador usa una base exclusiva de Folio', () => {
  expect(adaptarCargador('var DB_NAME = "EM_PRELOAD_CACHE"; return packageData.buffer;')).toContain(
    '"folio-EM_PRELOAD_CACHE"',
  );
});

it('2: rechaza un .data de igual tamaño pero versión distinta de su .js', async () => {
  const datos = new Uint8Array([1, 2, 3]);
  const uuid = 'sha256-' + createHash('sha256').update(datos).digest('hex');
  const fuente = adaptarCargador('var DB_NAME = "EM_PRELOAD_CACHE"; return packageData.buffer;');
  const verificar = (contenido, packageSize = 3) =>
    runInNewContext(`(async () => { ${fuente} })()`, {
      crypto: webcrypto,
      Uint8Array,
      packageData: contenido,
      loaded: contenido.length,
      packageSize,
      metadata: { package_uuid: uuid },
    });
  await expect(verificar(datos)).resolves.toBe(datos.buffer);
  await expect(verificar(new Uint8Array([3, 2, 1]))).rejects.toThrow('folio-version');
  await expect(verificar(datos, 4)).rejects.toThrow('folio-version');
});

it('19: tamaños y dependencia de BusyTeX llevan la misma versión', () => {
  const tamanos = JSON.parse(
    readFileSync(new URL('../src/herramientas/tamanos.gen.json', import.meta.url), 'utf8'),
  );
  const paquete = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  expect(tamanos.busytex).toBe(paquete.devDependencies['texlyre-busytex']);
});
