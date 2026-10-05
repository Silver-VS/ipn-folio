// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import produccion from '../config/produccion.json';
import { obtenerAcerca } from './acerca';

describe('acerca', () => {
  it('REPO_URL de producción es https y apunta a Silver-VS/ipn-folio', () => {
    const url = new URL(produccion.REPO_URL);
    expect(url.protocol).toBe('https:');
    expect(url.pathname).toBe('/Silver-VS/ipn-folio');
  });

  it('lee la configuración del entorno pedido', () => {
    expect(obtenerAcerca('produccion').REPO_URL).toBe(produccion.REPO_URL);
    expect(obtenerAcerca('desarrollo').LICENCIA).toBe('AGPL-3.0');
  });
});
