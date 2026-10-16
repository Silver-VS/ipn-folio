// SPDX-License-Identifier: AGPL-3.0-or-later
// Texto del aviso al restaurar, común a la vista Papelera y a la lista de la papelera del proyecto.
import type { ElementoPapelera, ResultadoRestaurar } from '../../almacen';
import { plano } from '../../textos/plano';
import { t } from '../../textos/t';

/** Nombre para mostrar y para los lectores de pantalla: la ruta original, o el nombre del proyecto. */
export function nombreDe(e: Pick<ElementoPapelera, 'clase' | 'ruta' | 'nombreProyecto'>): string {
  return e.clase === 'proyecto' ? e.nombreProyecto : (e.ruta ?? '');
}

/** Ruta final del archivo o carpeta restaurado (la raíz del elemento, ya con su nombre nuevo si hizo falta). */
export function rutaFinal(e: Pick<ElementoPapelera, 'ruta'>, r: ResultadoRestaurar): string {
  const primera = r.rutas[0];
  const raiz = e.ruta ?? '';
  if (!primera) return raiz;
  // «final» = raíz final + lo que cuelgue; se quita lo que cuelga para quedarse con la raíz.
  return primera.final.slice(0, primera.final.length - (primera.original.length - raiz.length));
}

/** «Se restauró {ruta}.», «Se restauró como {ruta_final} porque {ruta} ya existía.» o el del proyecto, en texto plano. */
export function textoRestaurado(e: ElementoPapelera, r: ResultadoRestaurar): string {
  if (e.clase === 'proyecto') return plano(t('papelera.restaurado_proyecto', { nombre: e.nombreProyecto }));
  const ruta = e.ruta ?? '';
  const final = rutaFinal(e, r);
  return final === ruta
    ? plano(t('papelera.restaurado', { ruta }))
    : plano(t('papelera.restaurado_como', { ruta_final: final, ruta }));
}
