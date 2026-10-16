// SPDX-License-Identifier: AGPL-3.0-or-later
// Estado reactivo de las herramientas para las pantallas (bienvenida, Ajustes, aviso de descarga). Una sola instancia:
// la descarga sigue aunque cambie la pantalla. La lógica de verdad vive en instalador.ts y red.ts.
import { AJUSTE_SOLO_WIFI, espacio, type Almacen } from '../almacen';
import type { EspacioUsado } from '../almacen/persistencia';
import { servicios } from '../app/servicios';
import { decidirDescarga, type InfoConexion } from '../pwa/red';
import type { IdHerramienta } from './catalogo';
import { ESTADO_INICIAL, type CodigoErrorInstalacion, type EstadoHerramienta } from './estado';
import { ErrorInstalacion, type Instalador, type ProgresoInstalacion } from './instalador';
import { crearInstaladorReal } from './servicio';

/** Lo que hay que preguntar al usuario antes de descargar (D15). */
export type PreguntaDescarga = 'datos-moviles' | 'desconocida' | 'ahorro';

export interface DependenciasTienda {
  almacen: Almacen;
  instalador: Instalador;
  conexion?: () => InfoConexion | undefined;
}

export class TiendaHerramientas {
  latex = $state<EstadoHerramienta>({ ...ESTADO_INICIAL });
  progreso = $state<ProgresoInstalacion | null>(null);
  pausada = $state(false);
  error = $state<CodigoErrorInstalacion | null>(null);
  pregunta = $state<PreguntaDescarga | null>(null);
  soloWifi = $state(true);
  cargada = $state(false);
  espacioUsado = $state<EspacioUsado | undefined>();
  persistente = $state<boolean | undefined>();
  /** Termina cuando la instalación en curso acaba (para las pruebas y para quien necesite esperar). */
  private enCurso: Promise<void> | null = null;

  constructor(private readonly d: DependenciasTienda) {}

  get descargando(): boolean {
    return this.latex.estado === 'descargando' && !this.pausada;
  }

  get instalada(): boolean {
    return this.latex.estado === 'instalada';
  }

  async cargar(): Promise<void> {
    this.soloWifi = (await this.d.almacen.leerAjuste<boolean>(AJUSTE_SOLO_WIFI)) ?? true;
    this.latex = await this.d.instalador.estado('latex');
    if (this.latex.estado === 'descargando' && !this.d.instalador.ocupado) {
      // Una descarga interrumpida (se cerró la pestaña): queda en pausa, lista para reanudar.
      this.pausada = true;
    }
    if (this.latex.estado === 'error') this.error = this.latex.error ?? 'otro';
    await this.medirEspacio();
    this.cargada = true;
  }

  async medirEspacio(): Promise<void> {
    this.espacioUsado = await espacio();
    this.persistente = (await navigator.storage?.persisted?.().catch(() => undefined)) ?? undefined;
  }

  async cambiarSoloWifi(valor: boolean): Promise<void> {
    this.soloWifi = valor;
    await this.d.almacen.guardarAjuste(AJUSTE_SOLO_WIFI, valor);
  }

  /** Pide instalar LaTeX respetando D15: o empieza, o deja `pregunta` para que la pantalla pregunte. */
  solicitar(): Promise<void> {
    if (this.instalada || this.descargando) return this.enCurso ?? Promise.resolve();
    const decision = decidirDescarga(this.soloWifi, this.d.conexion?.());
    if (decision === 'descargar') return this.iniciar();
    this.pregunta =
      decision === 'confirmar-datos' ? 'datos-moviles' : decision === 'preguntar' ? 'desconocida' : 'ahorro';
    return Promise.resolve();
  }

  /** El usuario acepta la pregunta de red: «Descargar de todos modos». */
  confirmar(): Promise<void> {
    this.pregunta = null;
    return this.iniciar();
  }

  rechazar(): void {
    this.pregunta = null;
  }

  iniciar(id: IdHerramienta = 'latex'): Promise<void> {
    if (this.enCurso) return this.enCurso;
    this.pausada = false;
    this.error = null;
    this.latex = { ...this.latex, estado: 'descargando' };
    this.enCurso = this.d.instalador
      .instalar(id, (p) => (this.progreso = p))
      .then(() => {
        this.progreso = null;
      })
      .catch((e: unknown) => {
        if (!(e instanceof ErrorInstalacion) || (e.codigo !== 'pausado' && e.codigo !== 'cancelado'))
          console.error('Folio: fallo de instalación', {
            herramienta: id,
            version: this.latex.version,
            error: e,
          });
        if (e instanceof ErrorInstalacion) {
          if (e.codigo === 'pausado') this.pausada = true;
          else if (e.codigo === 'cancelado') this.progreso = null;
          else this.error = e.codigo;
        } else this.error = 'otro';
      })
      .finally(async () => {
        try {
          this.latex = await this.d.instalador.estado(id);
          await this.medirEspacio();
        } finally {
          this.enCurso = null;
        }
      });
    return this.enCurso;
  }

  pausar(): void {
    this.d.instalador.pausar();
  }

  reanudar(): Promise<void> {
    return this.solicitar();
  }

  async cancelar(id: IdHerramienta = 'latex'): Promise<void> {
    if (this.d.instalador.ocupado) {
      this.d.instalador.cancelar();
      await this.enCurso;
    } else {
      await this.d.instalador.quitar(id);
    }
    this.pausada = false;
    this.progreso = null;
    this.latex = { ...ESTADO_INICIAL };
    await this.medirEspacio();
  }

  async quitar(id: IdHerramienta = 'latex'): Promise<void> {
    await this.d.instalador.quitar(id);
    await this.enCurso;
    this.pausada = false;
    this.progreso = null;
    this.error = null;
    this.latex = { ...ESTADO_INICIAL };
    await this.medirEspacio();
  }
}

let unica: Promise<TiendaHerramientas> | undefined;

/** La tienda de la aplicación (se crea y carga la primera vez que se pide). */
export function tienda(): Promise<TiendaHerramientas> {
  unica ??= servicios().then(async (s) => {
    const t = new TiendaHerramientas({ almacen: s.almacen, instalador: crearInstaladorReal(s.almacen) });
    await t.cargar();
    return t;
  });
  return unica;
}
