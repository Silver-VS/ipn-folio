// SPDX-License-Identifier: AGPL-3.0-or-later
// Textos de los pasos de la compilación (claves `compilacion.paso.*` de es.toml).
import { t } from '../../textos/t';
import type { NombrePaso } from './plan';

export function etiquetaDePaso(nombre: NombrePaso): string {
  switch (nombre) {
    case 'primera':
      return t('compilacion.paso.primera');
    case 'bibliografia':
      return t('compilacion.paso.bibliografia');
    case 'indice':
      return t('compilacion.paso.indice');
    case 'nomenclatura':
      return t('compilacion.paso.nomenclatura');
    case 'glosario':
      return t('compilacion.paso.glosario');
    case 'pasada':
      return t('compilacion.paso.pasada');
    case 'final':
      return t('compilacion.paso.final');
  }
}

/** «Paso 2 de 4: bibliografía». */
export function textoDeProgreso(n: number, total: number, nombre: NombrePaso): string {
  const etiqueta = etiquetaDePaso(nombre);
  return t('compilacion.paso.progreso', { n, total, nombre: etiqueta });
}
