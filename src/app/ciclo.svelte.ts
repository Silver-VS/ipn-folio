// SPDX-License-Identifier: AGPL-3.0-or-later
// Avisos persistentes sobre la conexión con la base de datos (M4): otra pestaña la actualizó, esta quiere actualizar y
// otra no la suelta, el navegador la cerró, o la base es de una versión más nueva que esta página.
import type { EventoApertura } from '../almacen';

export type AvisoCiclo =
  | 'version-nueva'
  | 'version-nueva-sin-guardar'
  | 'bloqueada'
  | 'cerrada'
  | 'version-vieja'
  | 'apertura-fallida';

class EstadoCiclo {
  aviso = $state<AvisoCiclo | undefined>();

  /** Eventos de la apertura de la base (`blocked`). */
  alAbrir(evento: EventoApertura): void {
    if (evento.tipo === 'almacen-bloqueado') this.aviso = 'bloqueada';
    else if (this.aviso === 'bloqueada') this.aviso = undefined;
  }

  mostrar(aviso: AvisoCiclo): void {
    this.aviso = aviso;
  }
}

export const ciclo = new EstadoCiclo();
