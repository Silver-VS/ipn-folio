// SPDX-License-Identifier: AGPL-3.0-or-later
// Avisos entre pestañas: cuando una pestaña escribe, las demás se enteran por BroadcastChannel.
import { nuevoId } from './rutas';
import type { Almacen, EventoAlmacen } from './tipos';

export const CANAL_ALMACEN = 'ipn-folio-almacen';

export type Aviso = EventoAlmacen & { origen: string };

export interface Avisos {
  /** Identificador de esta pestaña. */
  readonly origen: string;
  publicar(evento: EventoAlmacen): void;
  /** Recibe los avisos de OTRAS pestañas (los propios se ignoran). */
  escuchar(fn: (aviso: Aviso) => void): () => void;
  cerrar(): void;
}

export interface OpcionesAvisos {
  nombreCanal?: string;
  origen?: string;
}

/** Sin `BroadcastChannel` (navegadores muy viejos) los avisos no hacen nada; el almacén sigue funcionando. */
export function crearAvisos(opciones: OpcionesAvisos = {}): Avisos {
  const origen = opciones.origen ?? nuevoId();
  const canal =
    typeof BroadcastChannel === 'undefined'
      ? undefined
      : new BroadcastChannel(opciones.nombreCanal ?? CANAL_ALMACEN);
  const oyentes = new Set<(aviso: Aviso) => void>();

  canal?.addEventListener('message', (m: MessageEvent<unknown>) => {
    const aviso = m.data as Aviso | null;
    if (!aviso || typeof aviso !== 'object' || aviso.origen === origen) return;
    if (aviso.tipo !== 'cambio-archivo' && aviso.tipo !== 'cambio-proyecto') return;
    for (const fn of oyentes) fn(aviso);
  });

  return {
    origen,
    publicar(evento) {
      try {
        canal?.postMessage({ ...evento, origen } satisfies Aviso);
      } catch {
        /* canal cerrado */
      }
    },
    escuchar(fn) {
      oyentes.add(fn);
      return () => void oyentes.delete(fn);
    },
    cerrar() {
      oyentes.clear();
      canal?.close();
    },
  };
}

/** Publica en el canal cada cambio que hace este almacén. Devuelve la función para desconectar. */
export function conectarAvisos(almacen: Almacen, avisos: Avisos): () => void {
  const quitar = [
    almacen.al('cambio-archivo', (e) => avisos.publicar(e)),
    almacen.al('cambio-proyecto', (e) => avisos.publicar(e)),
  ];
  return () => quitar.forEach((q) => q());
}
