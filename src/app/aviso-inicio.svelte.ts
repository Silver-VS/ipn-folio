// SPDX-License-Identifier: AGPL-3.0-or-later
// Aviso que sobrevive al cambio de pantalla: al mandar un proyecto a la papelera se vuelve al inicio y ahí se
// muestra el aviso con «Deshacer». Persiste hasta que se cierra (WCAG 2.2.1).

export interface AvisoDeInicio {
  texto: string;
  accion?: { etiqueta: string; ejecutar: () => void | Promise<void> };
}

class EstadoAvisoInicio {
  actual = $state.raw<AvisoDeInicio | undefined>();

  mostrar(aviso: AvisoDeInicio): void {
    this.actual = aviso;
  }

  quitar(): void {
    this.actual = undefined;
  }
}

export const avisoInicio = new EstadoAvisoInicio();
