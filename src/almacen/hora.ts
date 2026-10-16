// SPDX-License-Identifier: AGPL-3.0-or-later
// Hora confiable para la caducidad de la papelera (D29, detalle i): la cabecera `Date` de una petición `HEAD` sin
// caché a un archivo del propio sitio. No hay NTP en el navegador, ni servidor propio, ni terceros. Del mismo origen
// `Date` siempre se puede leer. La petición debe llegar a la red: el service worker no debe contestarla desde caché.
//
// El desfase se mide contra un reloj MONÓTONO (`performance.now()` sobre una base fija), que no cambia si el
// alumno mueve la hora del equipo. Si `Date.now()` se separa de ese reloj más de un minuto, el reloj del equipo se
// movió y el desfase deja de valer hasta medir de nuevo.

export type FetchHora = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'headers'>>;

/** Tiempo máximo (ms) de la petición antes de abortarla. */
export const TIEMPO_LIMITE_HORA = 10_000;
/** Una medición cuya ida y vuelta tardó más que esto (ms) se descarta: el punto medio ya no es fiable. */
export const IDA_Y_VUELTA_MAXIMA = 30_000;
/** Separación (ms) entre `Date.now()` y el reloj monótono que invalida el desfase. */
export const SALTO_MAXIMO = 60_000;

export interface MedicionHora {
  /** Milisegundos que hay que sumar al reloj de referencia (`ahora`) para obtener la hora del sitio. */
  desfase: number;
}

/**
 * Mide el desfase entre el reloj dado y el del sitio: `Date` del servidor (más `Age`, si viene) menos el punto medio
 * local de la petición. `null` si no hay red, tarda demasiado, el servidor falla o la respuesta no trae una `Date`
 * válida.
 */
export async function medirHora(
  fetchFn: FetchHora,
  ahora: () => number,
  url: string,
): Promise<MedicionHora | null> {
  try {
    const antes = ahora();
    const respuesta = await fetchFn(url, {
      method: 'HEAD',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIEMPO_LIMITE_HORA),
    });
    const despues = ahora();
    if (respuesta.status >= 500) return null;
    if (despues - antes > IDA_Y_VUELTA_MAXIMA || despues < antes) return null;
    const cabecera = respuesta.headers.get('Date');
    if (!cabecera) return null;
    let servidor = Date.parse(cabecera);
    if (!Number.isFinite(servidor)) return null;
    // Una respuesta que pasó por una caché trae su antigüedad en `Age` (segundos).
    const edad = Number(respuesta.headers.get('Age'));
    if (Number.isFinite(edad) && edad > 0) servidor += edad * 1000;
    return { desfase: servidor - (antes + despues) / 2 };
  } catch {
    return null;
  }
}

export interface RelojConfiable {
  /** Hora confiable (ms) o `undefined` mientras no se haya podido medir (o si el reloj del equipo se movió). */
  horaConfiable(): number | undefined;
  /** Mide de nuevo; `true` solo si ESTA medición funcionó (una medición vieja no cuenta). */
  medir(): Promise<boolean>;
  /** Mide solo si nunca se midió, el desfase ya no vale o pasaron `intervaloMs`; `true` si hay una medición vigente. */
  medirSiToca(intervaloMs: number): Promise<boolean>;
}

export interface OpcionesReloj {
  fetch?: FetchHora;
  /** Reloj del equipo (`Date.now`). */
  ahora?: () => number;
  /** Reloj monótono en ms (por omisión `performance.now()` sobre una base fija). */
  monotono?: () => number;
  /** Archivo del propio sitio (config `papelera.urlHora`), relativo a la página. */
  url: string;
}

function resolver(url: string): string {
  return typeof location === 'undefined' ? url : new URL(url, location.href).href;
}

// Base fijada la primera vez que se usa (no depende de `performance.timeOrigin`, que algunos entornos no mantienen).
let base: number | undefined;
const monotonoPorOmision = () => {
  base ??= Date.now() - performance.now();
  return base + performance.now();
};

/** Reloj confiable de esta pestaña: guarda el desfase de la última medición correcta. */
export function crearRelojConfiable(opciones: OpcionesReloj): RelojConfiable {
  const ahora = opciones.ahora ?? Date.now;
  // Si solo se inyecta `ahora` (pruebas), se usa también como monótono: no hay saltos que detectar.
  const monotono = opciones.monotono ?? (opciones.ahora ? ahora : monotonoPorOmision);
  const fetchFn: FetchHora = opciones.fetch ?? ((url, init) => fetch(url, init));
  let desfase: number | undefined;
  let ultima: number | undefined;
  /** `Date.now() - monotono` cuando se midió: si cambia, el reloj del equipo se movió. */
  let saltoAlMedir = 0;
  let enCurso: Promise<boolean> | undefined;

  /** Descarta el desfase si el reloj del equipo se movió desde la medición. */
  const vigente = (): boolean => {
    if (desfase === undefined) return false;
    if (Math.abs(ahora() - monotono() - saltoAlMedir) > SALTO_MAXIMO) {
      desfase = undefined;
      ultima = undefined;
      return false;
    }
    return true;
  };

  const reloj: RelojConfiable = {
    horaConfiable: () => (vigente() ? monotono() + desfase! : undefined),
    medir() {
      enCurso ??= medirHora(fetchFn, monotono, resolver(opciones.url))
        .then((m) => {
          if (!m) return false;
          desfase = m.desfase;
          ultima = monotono();
          saltoAlMedir = ahora() - monotono();
          return true;
        })
        .finally(() => {
          enCurso = undefined;
        });
      return enCurso;
    },
    async medirSiToca(intervaloMs) {
      if (vigente() && ultima !== undefined && monotono() - ultima < intervaloMs) return true;
      return reloj.medir();
    },
  };
  return reloj;
}
