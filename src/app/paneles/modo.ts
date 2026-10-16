// SPDX-License-Identifier: AGPL-3.0-or-later
// Modo de la pantalla de proyecto: «amplio» (paneles acomodables con dockview) o «compacto» (un panel a la vez, para
// teléfonos). dockview no se descarga en modo compacto (D23).

export type ModoEspacio = 'amplio' | 'compacto';

/** Teléfono (ancho < 768 px) o pantalla táctil de hasta 1023 px de ancho (tableta chica). */
export const CONSULTA_COMPACTO = '(max-width: 767px), (pointer: coarse) and (max-width: 1023px)';

export function modoSegunCoincidencia(coincide: boolean): ModoEspacio {
  return coincide ? 'compacto' : 'amplio';
}

/** Lo mínimo que se usa de `window` (así se puede probar sin navegador). */
export interface VentanaConMedios {
  matchMedia(consulta: string): Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>;
}

export interface ObservadorModo {
  readonly actual: ModoEspacio;
  detener(): void;
}

/** Observa la consulta de medios; llama a `alCambiar` solo cuando el modo cambia de verdad (girar una tableta, por ejemplo). */
export function observarModo(
  ventana: VentanaConMedios,
  alCambiar: (modo: ModoEspacio) => void,
): ObservadorModo {
  const consulta = ventana.matchMedia(CONSULTA_COMPACTO);
  let actual = modoSegunCoincidencia(consulta.matches);
  const oyente = (e: Event) => {
    const nuevo = modoSegunCoincidencia((e as MediaQueryListEvent).matches ?? consulta.matches);
    if (nuevo === actual) return;
    actual = nuevo;
    alCambiar(nuevo);
  };
  consulta.addEventListener('change', oyente);
  return {
    get actual() {
      return actual;
    },
    detener: () => consulta.removeEventListener('change', oyente),
  };
}
