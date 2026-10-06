// SPDX-License-Identifier: AGPL-3.0-or-later
// Banco de pruebas del motor: expone `window.banco` para que Playwright compile fixtures o una carpeta
// con el orquestador (sesión 06). Parámetro de la URL: ?espejo=<URL del espejo de TeX Live> (opcional).
import { Motor } from '../../src/compilacion/motor';
import { Orquestador } from '../../src/compilacion/orquestador/orquestador';
import type { EventoOrquestador } from '../../src/compilacion/orquestador/orquestador';
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
  cancelado: boolean;
  bytesPdf: number;
  inicioPdf: string;
  paginas: number | null;
  pasos: string[];
  /** Nombre de cada paso del orquestador (`primera`, `bibliografia`…). */
  nombresPasos: string[];
  /** Textos «Paso n de m: …» de los eventos `paso`. */
  textosPasos: string[];
  msTotal: number;
  msPorPaso: number[];
  existe: Record<string, boolean>;
  problemas: Array<{ codigo: string; gravedad: string; archivo?: string; linea?: number; titulo: string }>;
  pdfAnteriorConservado: boolean;
  cacheUsada: boolean;
  saltadas: string[];
  motivo: string;
  /** Problemas en una línea cada uno: «archivo:línea título». */
  errores: string;
}

/** Un orquestador por clave: lo que recuerda entre compilaciones no debe mezclarse entre fixtures distintos. */
const orquestadores = new Map<string, { orquestador: Orquestador; eventos: EventoOrquestador[] }>();

function orquestadorDe(clave: string) {
  let entrada = orquestadores.get(clave);
  if (!entrada) {
    const eventos: EventoOrquestador[] = [];
    entrada = { orquestador: new Orquestador(motor, { alEvento: (e) => eventos.push(e) }), eventos };
    orquestadores.set(clave, entrada);
  }
  return entrada;
}

async function resumir(
  clave: string,
  entrada: { archivos: ArchivoProyecto[]; principal: string },
  existentes: string[],
): Promise<ResumenCompilacion> {
  const { orquestador, eventos } = orquestadorDe(clave);
  eventos.length = 0;
  const t0 = performance.now();
  const r = await orquestador.compilar(entrada);
  const msTotal = performance.now() - t0;
  const existe: Record<string, boolean> = {};
  // Tras una compilación fallida el sistema de archivos del motor sigue montado (salvo cancelación).
  for (const ruta of existentes) existe[ruta] = r.cancelado ? false : await motor.existe(ruta);
  return {
    exito: r.exito,
    cancelado: r.cancelado,
    bytesPdf: r.pdf?.byteLength ?? 0,
    inicioPdf: r.pdf ? new TextDecoder('latin1').decode(r.pdf.slice(0, 5)) : '',
    paginas: r.exito ? Number(PAGINAS.exec(await ultimaBitacora(entrada.principal))?.[1]) || null : null,
    pasos: r.pasos.map((p) => `${p.cmd[0]}→${p.codigo}`),
    nombresPasos: r.pasos.map((p) => p.nombre),
    textosPasos: eventos.flatMap((e) => (e.tipo === 'paso' ? [e.texto] : [])),
    msTotal,
    msPorPaso: r.pasos.map((p) => Math.round(p.ms)),
    existe,
    problemas: r.problemas.map((p) => ({
      codigo: p.codigo,
      gravedad: p.gravedad,
      archivo: p.archivo,
      linea: p.linea,
      titulo: p.titulo,
    })),
    pdfAnteriorConservado: r.pdfAnteriorConservado,
    cacheUsada: r.cacheUsada,
    saltadas: r.saltadas,
    motivo: r.motivo,
    errores: r.problemas
      .filter((p) => p.gravedad === 'error')
      .map((p) => `${p.archivo ?? ''}:${p.linea ?? ''} ${p.titulo}`)
      .join('\n'),
  };
}

/** Texto de la bitácora de TeX de la última compilación (para contar páginas). */
async function ultimaBitacora(principal: string): Promise<string> {
  const dir = principal.includes('/') ? principal.slice(0, principal.lastIndexOf('/') + 1) : '';
  const base = principal.slice(principal.lastIndexOf('/') + 1).replace(/\.tex$/i, '');
  try {
    const bytes = await motor.leer(`${dir}${base}.log`);
    return bytes ? new TextDecoder().decode(bytes) : '';
  } catch {
    return '';
  }
}

function archivosDeFixture(nombre: string, reemplazos: Record<string, string> = {}): ArchivoProyecto[] {
  const prefijo = `../fixtures/${nombre}/`;
  const propios = Object.entries(fixtures)
    .filter(([ruta]) => ruta.startsWith(prefijo))
    .map(([ruta, contenido]) => ({ ruta: ruta.slice(prefijo.length), contenido }));
  return propios.map((a) => ({ ...a, contenido: reemplazos[a.ruta] ?? a.contenido }));
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
  /**
   * Compila un fixture. `reemplazos` cambia el contenido de archivos del fixture (para simular una edición);
   * `clave` elige el orquestador (y su caché): por omisión, el nombre del fixture.
   */
  compilarFixture: (
    nombre: string,
    existentes: string[] = [],
    opciones: { reemplazos?: Record<string, string>; clave?: string } = {},
  ) =>
    resumir(
      opciones.clave ?? nombre,
      { archivos: archivosDeFixture(nombre, opciones.reemplazos), principal: 'main.tex' },
      existentes,
    ),

  compilarCarpeta: async (principal: string, existentes: string[] = [], clave = 'carpeta') =>
    resumir(clave, { archivos: await archivosDeCarpeta(), principal }, existentes),

  /** Lee un archivo del sistema de archivos del motor (texto), o `null`. */
  async leerTexto(ruta: string) {
    const bytes = await motor.leer(ruta);
    return bytes ? new TextDecoder().decode(bytes) : null;
  },

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

  /** Empieza a compilar, cancela tras `despuesDeMs` y devuelve cuánto tardó en terminar la compilación. */
  async cancelarEnCurso(nombre: string, despuesDeMs: number) {
    // Con una clave propia la compilación empieza sin caché y dura lo suficiente para poder cancelarla.
    const clave = `${nombre}:cancelar`;
    const compilacion = banco
      .compilarFixture(nombre, [], { clave })
      .then((r) => ({ cancelada: r.cancelado }));
    await new Promise((r) => setTimeout(r, despuesDeMs));
    const t0 = performance.now();
    orquestadorDe(clave).orquestador.cancelar();
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
