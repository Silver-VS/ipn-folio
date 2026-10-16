// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { hashDeProyecto, rutaDeHash } from './ruta';

describe('ruta por hash', () => {
  it('sin hash o con uno desconocido es el inicio', () => {
    for (const h of ['', '#', '#/', '#/otra', '#/proyecto', '#/proyecto/'])
      expect(rutaDeHash(h), h).toEqual({ pantalla: 'inicio' });
  });

  it('#/papelera abre la papelera (con o sin barra final)', () => {
    expect(rutaDeHash('#/papelera')).toEqual({ pantalla: 'papelera' });
    expect(rutaDeHash('#/papelera/')).toEqual({ pantalla: 'papelera' });
    expect(rutaDeHash('#/papeleras')).toEqual({ pantalla: 'inicio' });
  });

  it('#/proyecto/<id> abre el proyecto (con o sin barra final)', () => {
    expect(rutaDeHash('#/proyecto/abc123')).toEqual({ pantalla: 'proyecto', id: 'abc123' });
    expect(rutaDeHash('#/proyecto/abc123/')).toEqual({ pantalla: 'proyecto', id: 'abc123' });
  });

  it('ida y vuelta con caracteres especiales; una codificación rota cae al inicio', () => {
    const id = 'a b/ñ?#';
    expect(rutaDeHash(hashDeProyecto(id))).toEqual({ pantalla: 'proyecto', id });
    expect(rutaDeHash('#/proyecto/%E0%A4%A')).toEqual({ pantalla: 'inicio' });
  });
});
