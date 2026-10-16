// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { sinRespaldoHtml } from './lib/espejo-vite.mjs';

it('un auxiliar remoto ausente responde 404, un archivo real sigue al servidor y una ruta ajena conserva la SPA', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'folio-espejo-vite-'));
  try {
    mkdirSync(join(raiz, '26'));
    writeFileSync(join(raiz, '26/spanish.ldf'), 'fuente de prueba');
    const middleware = sinRespaldoHtml(raiz);
    for (const prefijo of ['', '/folio']) {
      const siguiente = vi.fn();
      const res = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
      middleware({ url: `${prefijo}/espejo/26/main.aux` }, res, siguiente);
      expect(res.statusCode).toBe(404);
      expect(siguiente).not.toHaveBeenCalled();
      middleware({ url: `${prefijo}/espejo/26/spanish.ldf` }, res, siguiente);
      middleware({ url: `${prefijo}/#/proyecto/ejemplo` }, res, siguiente);
      expect(siguiente).toHaveBeenCalledTimes(2);
    }
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
