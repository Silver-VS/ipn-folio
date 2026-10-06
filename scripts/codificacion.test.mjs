// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { revisarCodificacion } from './codificacion.mjs';
import { RUTA_TEXTOS } from './lib/textos.mjs';

describe('revisarCodificacion', () => {
  it('acepta texto con acentos, ñ y signos de pregunta legítimos', () => {
    expect(revisarCodificacion('a = "¿Quieres compilar? Revisa el código y la señal."')).toEqual([]);
  });

  it('detecta una letra acentuada perdida', () => {
    expect(revisarCodificacion('a = "c?digo"').join()).toMatch(/c\?d/);
  });

  it('detecta una ñ perdida y da el número de línea', () => {
    expect(revisarCodificacion('x = 1\na = "se?al"')[0]).toMatch(/:2:/);
  });

  it('detecta el carácter de reemplazo U+FFFD', () => {
    expect(revisarCodificacion('a = "c�digo"').join()).toMatch(/U\+FFFD/);
  });

  it('es.toml actual no tiene señales de codificación rota', () => {
    expect(revisarCodificacion(readFileSync(RUTA_TEXTOS, 'utf8'))).toEqual([]);
  });
});
