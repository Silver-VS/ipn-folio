// SPDX-License-Identifier: AGPL-3.0-or-later
// Avisos persistentes sobre la conexión con la base de datos (M4): otra pestaña la actualizó, esta quiere actualizar y
// otra no la suelta, el navegador la cerró, o la base es de una versión más nueva que esta página.
import type { EventoApertura } from '../almacen';

export type AvisoCiclo = 'version-nueva' | 'bloqueada' | 'cerrada' | 'version-vieja';

class EstadoCiclo {
  aviso = $state<AvisoCiclo | undefined>();

  /** Eventos de la apertura de la base (`blocked`). */
  alAbrir(evento: EventoApertura): void {
    if (evento.tipo === 'almacen-bloqueado') this.aviso = 'bloqueada';
    else if (this.aviso === 'bloqueada') this.aviso = undefined;
  }

  /** Un aviso más grave no lo reemplaza uno más leve (después de «Recargar» ya no hay nada que decir). */
  mostrar(aviso: AvisoCiclo): void {
    if (this.aviso === 'bloqueada' || this.aviso === undefined) this.aviso = aviso;
  }
}

export const ciclo = new EstadoCiclo();
