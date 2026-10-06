// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import desarrollo from '../config/desarrollo.json';
import produccion from '../config/produccion.json';
import { acerca } from './acerca';

describe('acerca', () => {
  it('REPO_URL de producción es https y apunta a Silver-VS/ipn-folio', () => {
    const url = new URL(produccion.REPO_URL);
    expect(url.protocol).toBe('https:');
    expect(url.pathname).toBe('/Silver-VS/ipn-folio');
  });

  it('la licencia de desarrollo es AGPL-3.0', () => {
    expect(desarrollo.LICENCIA).toBe('AGPL-3.0');
  });

  it('expone los datos del entorno elegido al compilar (en las pruebas, desarrollo)', () => {
    expect(acerca.REPO_URL).toBe(desarrollo.REPO_URL);
    expect(acerca.version).toBe(desarrollo.version);
  });
});
