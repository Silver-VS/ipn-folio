// SPDX-License-Identifier: AGPL-3.0-or-later
// Hora confiable para la caducidad de la papelera (D29, detalle i): la cabecera `Date` de una petición `HEAD` sin
// caché a un archivo del propio sitio. No hay NTP en el navegador, ni servidor propio, ni terceros. Del mismo origen
// `Date` siempre se puede leer. La petición debe llegar a la red: el service worker no debe contestarla desde caché.

export type FetchHora = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'headers'>>;

export interface MedicionHora {
  /** Milisegundos que hay que sumar al reloj del equipo para obtener la hora del sitio. */
  desfase: number;
}

/**
 * Mide el desfase entre el reloj del equipo y el del sitio: `Date` del servidor menos el punto medio local de la
 * petición. `null` si no hay red, el servidor falla o la respuesta no trae una `Date` válida.
 */
export async function medirHora(
  fetchFn: FetchHora,
  ahora: () => number,
  url: string,
): Promise<MedicionHora | null> {
  try {
    const antes = ahora();
    const respuesta = await fetchFn(url, { method: 'HEAD', cache: 'no-store' });
    const despues = ahora();
    if (respuesta.status >= 500) return null;
    const cabecera = respuesta.headers.get('Date');
    if (!cabecera) return null;
    const servidor = Date.parse(cabecera);
    if (!Number.isFinite(servidor)) return null;
    return { desfase: servidor - (antes + despues) / 2 };
  } catch {
    return null;
  }
}

export interface RelojConfiable {
  /** Hora confiable (ms) o `undefined` mientras no se haya podido medir. */
  horaConfiable(): number | undefined;
  /** Mide de nuevo; `true` si ahora hay hora confiable. */
  medir(): Promise<boolean>;
  /** Mide solo si nunca se midió o pasaron `intervaloMs` desde la última medición. */
  medirSiToca(intervaloMs: number): Promise<boolean>;
}

export interface OpcionesReloj {
  fetch?: FetchHora;
  ahora?: () => number;
  /** Archivo del propio sitio (config `papelera.urlHora`), relativo a la página. */
  url: string;
}

function resolver(url: string): string {
  return typeof location === 'undefined' ? url : new URL(url, location.href).href;
}

/** Reloj confiable de esta pestaña: guarda el desfase de la última medición correcta. */
export function crearRelojConfiable(opciones: OpcionesReloj): RelojConfiable {
  const ahora = opciones.ahora ?? Date.now;
  const fetchFn: FetchHora = opciones.fetch ?? ((url, init) => fetch(url, init));
  let desfase: number | undefined;
  let ultima: number | undefined;
  let enCurso: Promise<boolean> | undefined;

  const reloj: RelojConfiable = {
    horaConfiable: () => (desfase === undefined ? undefined : ahora() + desfase),
    medir() {
      enCurso ??= medirHora(fetchFn, ahora, resolver(opciones.url))
        .then((m) => {
          if (m) {
            desfase = m.desfase;
            ultima = ahora();
          }
          return desfase !== undefined;
        })
        .finally(() => {
          enCurso = undefined;
        });
      return enCurso;
    },
    async medirSiToca(intervaloMs) {
      if (
        desfase !== undefined &&
        ultima !== undefined &&
        ahora() - ultima < intervaloMs &&
        ahora() >= ultima
      )
        return true;
      return reloj.medir();
    },
  };
  return reloj;
}
