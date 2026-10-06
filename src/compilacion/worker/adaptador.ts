// SPDX-License-Identifier: AGPL-3.0-or-later
// ÚNICO archivo que toca los internos de BusytexPipeline (texlyre-busytex 1.4.0; revisar al actualizar).
//
// No usamos `BusytexPipeline.compile` (D9): aquí se replica lo que `compile` hace antes de ejecutar
// (montar un MEMFS limpio en `project_dir`, escribir los archivos, `chdir`, guardar la cabecera de memoria)
// y se ejecutan comandos sueltos con `_run_cmd`, que restaura la memoria del WASM después de cada uno.
import type { ArchivoProyecto, ArchivoRemoto, CodigoErrorWorker, ResultadoEjecucion } from '../tipos';
import { medirDescarga, ProgresoDescarga, totalesDeActivos } from './progreso';

/** Error del adaptador con un código que el Motor traduce a un texto de interfaz; `message` es solo para la consola. */
export class ErrorAdaptador extends Error {
  constructor(
    public readonly codigo: CodigoErrorWorker,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorAdaptador';
  }
}

const PROGRESO_DESCARGA = /^Downloading data\.\.\. \((\d+)\/(\d+)\)$/;
/** Ruta que no existe: `_run_cmd` pide rutas de `.aux`/`.bbl` que aquí no se usan. */
const SIN_RUTA = '/__sin_ruta__';

export interface OpcionesInicio {
  /** URL absoluta de la carpeta con los activos de BusyTeX. */
  base: string;
  /** Paquetes de datos (nombres de `.js`, relativos a `base`). Folio solo usa `texlive-basic.js`. */
  catalogo: string[];
  /** URL absoluta del espejo de TeX Live (opcional). */
  espejo?: string;
}

export interface Escuchas {
  progreso(cargado: number, total: number): void;
  salida(texto: string): void;
}

function quitarExtension(ruta: string): string {
  return ruta.replace(/\.[^./]+$/, '');
}

/**
 * Deduce de un comando qué bitácora produce, para devolverla con el resultado:
 * `.log` (TeX), `.blg` (bibtex*) o `.ilg` (makeindex). Función pura, sin acceso al pipeline.
 */
export function rutaDeBitacora(cmd: readonly string[]): string {
  const programa = cmd[0] ?? '';
  const argumentos = cmd.slice(1);
  if (programa.startsWith('bibtex')) {
    const aux = [...argumentos].reverse().find((a) => !a.startsWith('-')) ?? 'texput.aux';
    return quitarExtension(aux) + '.blg';
  }
  if (programa === 'makeindex') {
    const conValor = new Set(['-s', '-o', '-t', '-p']);
    let entrada = '';
    let bitacora = '';
    for (let i = 0; i < argumentos.length; i++) {
      const a = argumentos[i] ?? '';
      if (a === '-t') bitacora = argumentos[i + 1] ?? '';
      if (conValor.has(a)) i++;
      else if (!a.startsWith('-') && !entrada) entrada = a;
    }
    return bitacora || quitarExtension(entrada || 'texput.idx') + '.ilg';
  }
  const jobname = argumentos.map((a) => /^--?jobname=(.+)$/.exec(a)?.[1]).find(Boolean);
  if (jobname) return jobname + '.log';
  const tex = [...argumentos].reverse().find((a) => !a.startsWith('-') && /\.tex$/i.test(a));
  return tex ? quitarExtension(tex) + '.log' : 'texput.log';
}

/** Rechaza rutas que salgan de la raíz del proyecto. */
function rutaSegura(ruta: string): string {
  const partes = ruta.split('/').filter((p) => p !== '' && p !== '.');
  if (partes.includes('..')) throw new ErrorAdaptador('ruta_no_permitida', `Path not allowed: ${ruta}`);
  return partes.join('/');
}

export class Adaptador {
  private pipeline: BusytexPipeline | null = null;
  private modulo: BusytexModulo | null = null;
  private cabecera: Uint8Array | null = null;
  /** El WASM abortó: el módulo de Emscripten falla en todas las llamadas siguientes; hay que crear otro worker. */
  inutilizable = false;

  constructor(private readonly escuchas: Escuchas) {}

  async iniciar({ base, catalogo, espejo }: OpcionesInicio): Promise<Record<string, string>> {
    importScripts(`${base}/busytex_pipeline.js`);
    const paquetes = catalogo.map((nombre) => `${base}/${nombre}`);
    const progreso = new ProgresoDescarga(
      (cargado, total) => this.escuchas.progreso(cargado, total),
      await this.leerTotales(base, catalogo),
    );
    const imprimir = (texto: string) => {
      const m = PROGRESO_DESCARGA.exec(texto);
      if (m) progreso.datos(Number(m[1]), Number(m[2]));
      else if (texto === 'All downloads complete.') progreso.terminar();
      else this.escuchas.salida(texto);
    };
    // Los paquetes del catálogo son también los que se precargan: así no hay recarga del módulo después.
    // El constructor pide `busytex.wasm` con el `fetch` global: se envuelve solo durante esa llamada para medirlo.
    const urlWasm = `${base}/busytex.wasm`;
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (entrada, init) => {
      const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      const peticion = fetchOriginal(entrada, init);
      return url === urlWasm
        ? peticion.then((r) =>
            medirDescarga(
              r,
              (acumulado) => progreso.wasm(acumulado),
              () => progreso.wasmTerminado(),
            ),
          )
        : peticion;
    };
    let pipeline: BusytexPipeline;
    try {
      pipeline = new BusytexPipeline(
        `${base}/busytex.js`,
        urlWasm,
        paquetes,
        paquetes,
        [],
        imprimir,
        () => undefined,
        true,
        BusytexPipeline.ScriptLoaderWorker,
      );
    } finally {
      globalThis.fetch = fetchOriginal;
    }
    this.pipeline = pipeline;
    const modulo = await pipeline.Module;
    const versiones = (await pipeline.on_initialized_promise) as Record<string, string> | undefined;
    if (espejo) modulo.ENV['TEXLIVE_REMOTE_ENDPOINT'] = espejo;
    this.modulo = modulo;
    return versiones ?? modulo.applet_versions ?? {};
  }

  /** Tamaños esperados (de `activos.json`) para que el progreso conozca el total desde el principio. */
  private async leerTotales(base: string, catalogo: string[]) {
    try {
      const respuesta = await fetch(`${base}/activos.json`);
      return respuesta.ok ? totalesDeActivos(await respuesta.json(), catalogo) : {};
    } catch {
      return {};
    }
  }

  private requerir(): { pipeline: BusytexPipeline; modulo: BusytexModulo } {
    if (this.inutilizable)
      throw new ErrorAdaptador('abortado', 'The WASM module aborted; this worker is unusable.');
    if (!this.pipeline || !this.modulo)
      throw new ErrorAdaptador('no_listo', 'The compilation engine is not ready yet.');
    return { pipeline: this.pipeline, modulo: this.modulo };
  }

  /** Monta un sistema de archivos limpio con los archivos del proyecto y se ubica en `directorio`. */
  montar(archivos: ArchivoProyecto[], directorio = ''): void {
    const { pipeline, modulo } = this.requerir();
    const { FS, PATH } = modulo;
    const raiz = pipeline.project_dir;
    if (FS.analyzePath(raiz).object?.mount?.mountpoint === raiz) FS.unmount(raiz);
    FS.mount(FS.filesystems.MEMFS, {}, raiz);

    const creadas = new Set<string>(['/', raiz]);
    const crearCarpetas = (ruta: string) => {
      if (!ruta || ruta === '/' || creadas.has(ruta)) return;
      crearCarpetas(PATH.dirname(ruta));
      if (!FS.analyzePath(ruta).exists) FS.mkdir(ruta);
      creadas.add(ruta);
    };
    const ordenados = [...archivos].sort((a, b) => (a.ruta < b.ruta ? -1 : 1));
    for (const { ruta, contenido } of ordenados) {
      const absoluta = PATH.join(raiz, rutaSegura(ruta));
      crearCarpetas(PATH.dirname(absoluta));
      FS.writeFile(absoluta, contenido);
    }
    const carpeta = PATH.join(raiz, rutaSegura(directorio));
    crearCarpetas(carpeta);
    FS.chdir(carpeta);
    // Memoria del WASM al empezar: `_run_cmd` la restaura después de cada programa.
    this.cabecera = modulo.HEAPU8.slice(0, pipeline.mem_header_size);
  }

  ejecutar(cmd: string[], enVivo = false): ResultadoEjecucion {
    const { pipeline, modulo } = this.requerir();
    if (!this.cabecera) throw new ErrorAdaptador('sin_montar', 'The project must be mounted first.');
    const bitacora = rutaDeBitacora(cmd);
    const entradas: Array<{ stdout: string; stderr: string; exit_code: number }> = [];
    const inicio = performance.now();
    // error_messages [''] hace que `_run_cmd` devuelva siempre el código de salida real del programa.
    let log: string;
    try {
      ({ log } = pipeline._run_cmd(
        modulo,
        modulo.FS,
        cmd,
        [''],
        enVivo ? 'info' : 'silent',
        bitacora,
        bitacora,
        SIN_RUTA,
        SIN_RUTA,
        this.cabecera,
        entradas,
      ));
    } catch (error) {
      // `_run_cmd` no lanza en un fallo normal de TeX (devuelve el código de salida): si lanza, el WASM abortó
      // (pila, memoria, abort()) y `callMain` no restauró la memoria. El módulo ya no sirve.
      this.inutilizable = true;
      const detalle = error instanceof Error ? error.message : String(error);
      throw new ErrorAdaptador('abortado', detalle);
    }
    const ms = performance.now() - inicio;
    const ultima = entradas[entradas.length - 1];
    return {
      codigo: ultima?.exit_code ?? 1,
      stdout: ultima?.stdout ?? '',
      stderr: ultima?.stderr ?? '',
      log,
      ms,
    };
  }

  private absoluta(ruta: string): string {
    const { pipeline, modulo } = this.requerir();
    return modulo.PATH.join(pipeline.project_dir, rutaSegura(ruta));
  }

  leer(ruta: string): Uint8Array | null {
    const { modulo } = this.requerir();
    const absoluta = this.absoluta(ruta);
    return modulo.FS.analyzePath(absoluta).exists
      ? modulo.FS.readFile(absoluta, { encoding: 'binary' })
      : null;
  }

  existe(ruta: string): boolean {
    return this.requerir().modulo.FS.analyzePath(this.absoluta(ruta)).exists;
  }

  async registrarRemotos(archivos: ArchivoRemoto[]): Promise<void> {
    await this.requerir().pipeline.write_texlive_remote_files(archivos);
  }

  async registrarFallos(claves: string[]): Promise<void> {
    await this.requerir().pipeline.write_texlive_remote_misses(claves);
  }
}
