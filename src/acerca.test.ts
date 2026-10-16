// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import desarrollo from '../config/desarrollo.json';
import produccion from '../config/produccion.json';
import { acerca } from './acerca';
import { RUTA_HORA } from './pwa/nombres';

const entornos = { desarrollo, produccion };

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

  describe.each(Object.entries(entornos))('papelera (%s)', (_nombre, config) => {
    const p = config.papelera;

    it('la caducidad por omisión es una de las opciones, y las opciones son 7, 30 y 90', () => {
      expect(p.opcionesDias).toEqual([7, 30, 90]);
      expect(p.opcionesDias).toContain(p.diasPorOmision);
      expect(p.diasPorOmision).toBe(30);
    });

    it('los umbrales tienen sentido', () => {
      expect(Number.isInteger(p.margenDias) && p.margenDias >= 0).toBe(true);
      expect(p.intervaloPurgaHoras).toBeGreaterThan(0);
      expect(p.avisoMegas).toBeGreaterThan(0);
      expect(p.avisoFraccionUso).toBeGreaterThan(0);
      expect(p.avisoFraccionUso).toBeLessThanOrEqual(1);
    });

    it('la URL de la hora es relativa al sitio (mismo origen) y apunta al archivo que el service worker deja pasar', () => {
      expect(p.urlHora).toMatch(/^\.\/[\w.-]+$/);
      // El build emite ese archivo (scripts/lib/pwa.mjs) o está en public/.
      const enPublic = existsSync(join(process.cwd(), 'public', p.urlHora));
      expect(enPublic || p.urlHora === `./${RUTA_HORA}`).toBe(true);
    });
  });

  it('expone la configuración de la papelera del entorno elegido al compilar', () => {
    expect(acerca.papelera).toEqual(desarrollo.papelera);
  });
});
