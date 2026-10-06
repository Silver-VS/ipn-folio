// SPDX-License-Identifier: AGPL-3.0-or-later
// Banco de pruebas del motor: expone `window.banco` para que Playwright compile fixtures o una carpeta.
// Parámetro de la URL: ?espejo=<URL del espejo de TeX Live> (opcional).
import { Motor } from '../../src/compilacion/motor';
import { compilarProvisional } from '../../src/compilacion/secuencia-provisional';
import type { ArchivoProyecto } from '../../src/compilacion/tipos';

const fixtures = import.meta.glob('../fixtures/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const parametros = new URLSearchParams(location.search);
const progreso: Array<[number, number]> = [];
const motor = new Motor({
  base: '/busytex',
  espejo: parametros.get('espejo'),
  eventos: { progreso: (cargado, total) => progreso.push([cargado, total]) },
});

const PAGINAS = /\((\d+) pages?,/;

export interface ResumenCompilacion {
  exito: boolean;
  bytesPdf: number;
  inicioPdf: string;
  paginas: number | null;
  pasos: string[];
  msTotal: number;
  msPorPaso: number[];
  existe: Record<string, boolean>;
  errores: string;
}

async function resumir(
  entrada: { archivos: ArchivoProyecto[]; principal: string },
  existentes: string[],
): Promise<ResumenCompilacion> {
  const t0 = performance.now();
  const r = await compilarProvisional(motor, entrada);
  const msTotal = performance.now() - t0;
  const existe: Record<string, boolean> = {};
  for (const ruta of existentes) existe[ruta] = await motor.existe(ruta);
  return {
    exito: r.exito,
    bytesPdf: r.pdf?.byteLength ?? 0,
    inicioPdf: r.pdf ? new TextDecoder('latin1').decode(r.pdf.slice(0, 5)) : '',
    paginas: Number(PAGINAS.exec(r.bitacoras.log)?.[1]) || null,
    pasos: r.pasos.map((p) => `${p.cmd[0]}→${p.codigo}`),
    msTotal,
    msPorPaso: r.pasos.map((p) => Math.round(p.ms)),
    existe,
    errores: [...r.bitacoras.log.matchAll(/^.*:\d+: .+$|^! .+$/gm)]
      .map((m) => m[0])
      .slice(0, 10)
      .join('\n'),
  };
}

function archivosDeFixture(nombre: string): ArchivoProyecto[] {
  const prefijo = `../fixtures/${nombre}/`;
  return Object.entries(fixtures)
    .filter(([ruta]) => ruta.startsWith(prefijo))
    .map(([ruta, contenido]) => ({ ruta: ruta.slice(prefijo.length), contenido }));
}

const IGNORAR =
  /(^|\/)(adicionales\/|texput\.log$)|\.(aux|log|toc|lof|lot|out|bbl|blg|idx|ind|ilg|nlo|nls|synctex\.gz)$/i;

async function archivosDeCarpeta(): Promise<ArchivoProyecto[]> {
  const entrada = document.getElementById('carpeta') as HTMLInputElement;
  const archivos = [...(entrada.files ?? [])];
  const resultado: ArchivoProyecto[] = [];
  for (const f of archivos) {
    const ruta = f.webkitRelativePath.split('/').slice(1).join('/');
    // Un PDF en la raíz es salida de una compilación anterior; los de subcarpetas (logos, figuras) sí son del proyecto.
    if (IGNORAR.test(ruta) || (!ruta.includes('/') && ruta.toLowerCase().endsWith('.pdf'))) continue;
    resultado.push({ ruta, contenido: new Uint8Array(await f.arrayBuffer()) });
  }
  return resultado;
}

const banco = {
  compilarFixture: (nombre: string, existentes: string[] = []) =>
    resumir({ archivos: archivosDeFixture(nombre), principal: 'main.tex' }, existentes),

  compilarCarpeta: async (principal: string, existentes: string[] = []) =>
    resumir({ archivos: await archivosDeCarpeta(), principal }, existentes),

  /** Compila un fixture y, mientras tanto, mide el mayor retraso de un temporizador de 50 ms. */
  async compilarMidiendoBloqueo(nombre: string) {
    let ultimo = performance.now();
    let mayorRetraso = 0;
    const reloj = setInterval(() => {
      const ahora = performance.now();
      mayorRetraso = Math.max(mayorRetraso, ahora - ultimo - 50);
      ultimo = ahora;
    }, 50);
    try {
      const resumen = await banco.compilarFixture(nombre);
      return { resumen, mayorRetraso: Math.round(mayorRetraso) };
    } finally {
      clearInterval(reloj);
    }
  },

  /** Empieza a compilar, cancela tras `despuesDeMs` y devuelve cuánto tardó en rechazarse la compilación. */
  async cancelarEnCurso(nombre: string, despuesDeMs: number) {
    const compilacion = banco.compilarFixture(nombre).then(
      () => ({ cancelada: false }),
      (error: { codigo?: string }) => ({ cancelada: error.codigo === 'cancelado' }),
    );
    await new Promise((r) => setTimeout(r, despuesDeMs));
    const t0 = performance.now();
    motor.cancelar();
    const { cancelada } = await compilacion;
    return { cancelada, ms: Math.round(performance.now() - t0) };
  },

  async iniciar() {
    const t0 = performance.now();
    const versiones = await motor.iniciar();
    return { ms: Math.round(performance.now() - t0), applets: Object.keys(versiones) };
  },

  progreso: () => progreso,
};

declare global {
  interface Window {
    banco: typeof banco;
  }
}
window.banco = banco;

/** Ayuda de depuración: monta un fixture y corre un comando crudo. */
(window.banco as unknown as Record<string, unknown>)['crudo'] = async (nombre: string, cmd: string[]) => {
  await motor.montar(archivosDeFixture(nombre), '');
  return motor.ejecutar(cmd);
};
