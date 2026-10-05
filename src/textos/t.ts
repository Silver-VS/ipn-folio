// SPDX-License-Identifier: AGPL-3.0-or-later
// Punto único para pedir textos: t('clave', { variable }). El formateador (variables, plurales, saneo)
// es el de @ipn/comun; aquí solo se le agregan los tipos de clave generados.
import { configurar, registrar, t as formatear } from '@ipn/comun/js/texto.js';
import { TEXTOS_COMUN, TEXTOS_FOLIO } from './es.gen';
import type { ClaveTexto, VariablesPorClave } from './es.gen';

registrar('es', { ...TEXTOS_COMUN, ...TEXTOS_FOLIO });
configurar({ desarrollo: import.meta.env.DEV });

type Argumentos<K extends ClaveTexto> = K extends keyof VariablesPorClave
  ? [variables: VariablesPorClave[K]]
  : [variables?: Record<string, never>];

export function t<K extends ClaveTexto>(clave: K, ...variables: Argumentos<K>): string {
  return formatear(clave, variables[0] ?? {});
}
