// SPDX-License-Identifier: AGPL-3.0-or-later
import { escapar } from '@ipn/comun/js/texto.js';
import { describe, expect, it } from 'vitest';
import { plano } from './plano';

describe('plano', () => {
  it('deshace el escape de las variables', () => {
    expect(plano(`Archivo ${escapar(`a&b "c" <d> 'e'.tex`)}`)).toBe(`Archivo a&b "c" <d> 'e'.tex`);
  });

  it('quita las etiquetas de la plantilla pero no el texto que parece etiqueta en una variable', () => {
    expect(plano(`<b>Hola</b> ${escapar('<script>')}`)).toBe('Hola <script>');
  });

  it('no deshace dos veces: «&amp;lt;» queda «&lt;»', () => {
    expect(plano(escapar('&lt;'))).toBe('&lt;');
  });
});
