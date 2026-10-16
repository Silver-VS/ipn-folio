// SPDX-License-Identifier: AGPL-3.0-or-later
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Se inspecciona el resultado real, incluidos nombres y activos binarios, después del build.
function comprobar(dir) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    const prohibido = /plantillas-locales|UpiiTeXis|TT_UPIITA/i;
    if (prohibido.test(entrada.name)) throw new Error(`Folio: activo local en producción: ${ruta}`);
    if (entrada.isDirectory()) comprobar(ruta);
    else if (prohibido.test(readFileSync(ruta).toString('utf8')))
      throw new Error(`Folio: referencia local en producción: ${ruta}`);
  }
}
comprobar('dist');
console.info('Folio: dist sin referencias a plantillas locales.');
