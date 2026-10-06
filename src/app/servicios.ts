// SPDX-License-Identifier: AGPL-3.0-or-later
// Servicios compartidos de la aplicación: UNA instancia del almacén, del autoguardado y de los avisos entre pestañas
// (HANDOFF 02, «Ideas para la 08»). Todo lo que escribe, renombra o borra pasa por `auto`, no por `almacen.*`.
import {
  conectarAvisos,
  crearAlmacen,
  crearAutoguardado,
  crearAvisos,
  type Almacen,
  type Autoguardado,
  type Avisos,
} from '../almacen';

export interface Servicios {
  almacen: Almacen;
  /** `false`: se usa el respaldo en memoria y el trabajo se perderá al cerrar la pestaña (hay que avisarlo). */
  persistente: boolean;
  auto: Autoguardado;
  avisos: Avisos;
  cerrar(): void;
}

/** Arma los servicios sobre un almacén ya creado (las pruebas pasan uno en memoria). */
export function armarServicios(almacen: Almacen, persistente: boolean): Servicios {
  const auto = crearAutoguardado(almacen);
  const avisos = crearAvisos();
  const quitarAvisos = conectarAvisos(almacen, avisos);
  const quitarSalida = typeof window === 'undefined' ? () => {} : auto.protegerSalida();
  return {
    almacen,
    persistente,
    auto,
    avisos,
    cerrar() {
      quitarSalida();
      quitarAvisos();
      avisos.cerrar();
      auto.cerrar();
      almacen.cerrar();
    },
  };
}

let compartidos: Promise<Servicios> | undefined;

/** Servicios de la aplicación (se crean la primera vez que se piden). */
export function servicios(): Promise<Servicios> {
  compartidos ??= crearAlmacen().then(({ almacen, persistente }) => armarServicios(almacen, persistente));
  return compartidos;
}
