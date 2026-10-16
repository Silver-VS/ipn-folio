// SPDX-License-Identifier: AGPL-3.0-or-later
// Purga de la papelera (D29): al abrir la app y al volver a la pestaña si pasaron 6 h o más desde la última. Sin
// temporizadores en segundo plano. Solo con hora confiable (ver almacen/hora.ts); sin ella la papelera lo conserva
// todo. La purga no avisa ni pide confirmación (decisión del dueño): borra lo que caducó y ya.
import type { ConfigPapelera } from '../../acerca';
import type { Autoguardado, Almacen, ElementoPapelera, RelojConfiable } from '../../almacen';
import { diasValidos, MS_HORA, tocaPurgar } from '../../almacen/papelera';

export const AJUSTE_DIAS = 'papelera.dias';
export const AJUSTE_ULTIMA_PURGA = 'papelera.ultimaPurga';

/** Caducidad elegida por el alumno; un valor que no esté entre las opciones vale el de omisión. */
export async function leerDias(
  almacen: Pick<Almacen, 'leerAjuste'>,
  config: ConfigPapelera,
): Promise<number> {
  const guardado = await almacen.leerAjuste(AJUSTE_DIAS).catch(() => undefined);
  return diasValidos(guardado, config.opcionesDias, config.diasPorOmision);
}

export async function guardarDias(almacen: Pick<Almacen, 'guardarAjuste'>, dias: number): Promise<void> {
  await almacen.guardarAjuste(AJUSTE_DIAS, dias);
}

export interface Purga {
  /**
   * Mide la hora y purga. Con `siempre` (al abrir la app) no mira cuándo fue la última purga; sin él (al volver a la
   * pestaña) solo purga si `tocaPurgar`. Devuelve lo que se borró.
   */
  purgar(siempre?: boolean): Promise<ElementoPapelera[]>;
  detener(): void;
}

export interface OpcionesPurga {
  almacen: Pick<Almacen, 'leerAjuste' | 'guardarAjuste'>;
  auto: Pick<Autoguardado, 'purgarCaducados'>;
  reloj: RelojConfiable;
  config: ConfigPapelera;
  /** `document` (o lo mínimo que usa); sin él no se engancha a «volver a la pestaña». */
  documento?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
}

export function crearPurga(opciones: OpcionesPurga): Purga {
  const { almacen, auto, reloj, config, documento } = opciones;
  const intervaloMs = config.intervaloPurgaHoras * MS_HORA;
  let enCurso: Promise<ElementoPapelera[]> | undefined;

  async function ejecutar(siempre: boolean): Promise<ElementoPapelera[]> {
    // Al abrir se mide siempre; al volver a la pestaña, solo si la última medición ya tiene 6 h.
    const hayHora = siempre ? await reloj.medir() : await reloj.medirSiToca(intervaloMs);
    const hora = reloj.horaConfiable();
    if (!hayHora || hora === undefined) return [];
    const ultima = await almacen.leerAjuste<number>(AJUSTE_ULTIMA_PURGA).catch(() => undefined);
    if (!siempre && !tocaPurgar(ultima, hora, intervaloMs)) return [];
    const dias = await leerDias(almacen, config);
    const borrados = await auto.purgarCaducados(dias);
    await almacen.guardarAjuste(AJUSTE_ULTIMA_PURGA, hora);
    return borrados;
  }

  const purga: Purga = {
    purgar(siempre = false) {
      // Dos disparos a la vez (abrir + volver a la pestaña) comparten la misma purga.
      enCurso ??= ejecutar(siempre)
        .catch(() => [] as ElementoPapelera[])
        .finally(() => {
          enCurso = undefined;
        });
      return enCurso;
    },
    detener() {
      documento?.removeEventListener('visibilitychange', alVolver);
    },
  };

  function alVolver() {
    if (documento?.visibilityState === 'visible') void purga.purgar(false);
  }
  documento?.addEventListener('visibilitychange', alVolver);
  return purga;
}
