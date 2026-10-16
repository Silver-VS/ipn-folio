// SPDX-License-Identifier: AGPL-3.0-or-later
// Servicios compartidos de la aplicación: UNA instancia del almacén, del autoguardado y de los avisos entre pestañas
// (HANDOFF 02, «Ideas para la 08»). Todo lo que escribe, renombra o borra pasa por `auto`, no por `almacen.*`.
import { acerca } from '../acerca';
import {
  conectarAvisos,
  crearAlmacen,
  crearAutoguardado,
  crearAvisos,
  crearRelojConfiable,
  ErrorAlmacen,
  type Almacen,
  type Autoguardado,
  type Avisos,
  type RelojConfiable,
} from '../almacen';
import { ciclo } from './ciclo.svelte';
import { crearPurga, type Purga } from './papelera/purga';

/** Lo más que se espera a guardar lo pendiente cuando otra pestaña actualiza la base (M4). */
const ESPERA_GUARDAR_AL_ACTUALIZAR = 2000;

export interface Servicios {
  almacen: Almacen;
  /** `false`: se usa el respaldo en memoria y el trabajo se perderá al cerrar la pestaña (hay que avisarlo). */
  persistente: boolean;
  auto: Autoguardado;
  avisos: Avisos;
  /** Hora confiable (cabecera `Date` del propio sitio) para la caducidad de la papelera. */
  reloj: RelojConfiable;
  cerrar(): void;
}

/** Arma los servicios sobre un almacén ya creado (las pruebas pasan uno en memoria). */
export function armarServicios(almacen: Almacen, persistente: boolean, reloj?: RelojConfiable): Servicios {
  const auto = crearAutoguardado(almacen);
  const avisos = crearAvisos();
  const quitarAvisos = conectarAvisos(almacen, avisos);
  const quitarSalida = typeof window === 'undefined' ? () => {} : auto.protegerSalida();
  const relojFinal = reloj ?? crearRelojConfiable({ url: acerca.papelera.urlHora });
  const quitarCiclo = [
    // Otra pestaña actualizó la base: se guarda lo pendiente (máximo 2 s) y se suelta la conexión (M4, `blocking`).
    almacen.al('version-nueva', () => {
      ciclo.mostrar('version-nueva');
      const limite = new Promise<void>((resolver) => setTimeout(resolver, ESPERA_GUARDAR_AL_ACTUALIZAR));
      void Promise.race([auto.guardarTodo().catch(() => undefined), limite]).then(() => almacen.cerrar());
    }),
    // El navegador cerró la conexión (M4, `terminated`).
    almacen.al('almacen-cerrado', () => ciclo.mostrar('cerrada')),
  ];
  return {
    almacen,
    persistente,
    auto,
    avisos,
    reloj: relojFinal,
    cerrar() {
      quitarSalida();
      quitarAvisos();
      quitarCiclo.forEach((q) => q());
      avisos.cerrar();
      auto.cerrar();
      almacen.cerrar();
    },
  };
}

let compartidos: Promise<Servicios> | undefined;
let purga: Purga | undefined;

async function crear(): Promise<Servicios> {
  const reloj = crearRelojConfiable({ url: acerca.papelera.urlHora });
  try {
    const { almacen, persistente } = await crearAlmacen({
      horaConfiable: () => reloj.horaConfiable(),
      margenDias: acerca.papelera.margenDias,
      alAbrir: (e) => ciclo.alAbrir(e),
    });
    const s = armarServicios(almacen, persistente, reloj);
    // Purga de la papelera al abrir la app y, después, al volver a la pestaña (sin temporizadores).
    purga = crearPurga({
      almacen,
      auto: s.auto,
      reloj,
      config: acerca.papelera,
      documento: typeof document === 'undefined' ? undefined : document,
    });
    void purga.purgar(true);
    return s;
  } catch (e) {
    // La base es de una versión más nueva que esta página: no se trabaja en memoria, se pide recargar.
    if (e instanceof ErrorAlmacen && e.codigo === 'version_nueva') ciclo.mostrar('version-vieja');
    throw e;
  }
}

/** Servicios de la aplicación (se crean la primera vez que se piden). */
export function servicios(): Promise<Servicios> {
  compartidos ??= crear();
  return compartidos;
}

/** La purga de esta pestaña (después de `servicios()`); la usan las pruebas y la vista Papelera. */
export function purgaActual(): Purga | undefined {
  return purga;
}
