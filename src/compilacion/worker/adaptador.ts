// SPDX-License-Identifier: AGPL-3.0-or-later
// ÚNICO archivo que toca los internos de BusytexPipeline (texlyre-busytex 1.4.0; revisar al actualizar).
//
// No usamos `BusytexPipeline.compile` (D9): aquí se replica lo que `compile` hace antes de ejecutar
// (montar un MEMFS limpio en `project_dir`, escribir los archivos, `chdir`, guardar la cabecera de memoria)
// y se ejecutan comandos sueltos con `_run_cmd`, que restaura la memoria del WASM después de cada uno.
import type { ArchivoProyecto, ArchivoRemoto, ResultadoEjecucion } from '../tipos';

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
  if (partes.includes('..')) throw new Error(`Ruta no permitida: ${ruta}`);
  return partes.join('/');
}

export class Adaptador {
  private pipeline: BusytexPipeline | null = null;
  private modulo: BusytexModulo | null = null;
  private cabecera: Uint8Array | null = null;

  constructor(private readonly escuchas: Escuchas) {}

  async iniciar({ base, catalogo, espejo }: OpcionesInicio): Promise<Record<string, string>> {
    importScripts(`${base}/busytex_pipeline.js`);
    const paquetes = catalogo.map((nombre) => `${base}/${nombre}`);
    let totalVisto = 0;
    let ultimoAviso = 0;
    const imprimir = (texto: string) => {
      const m = PROGRESO_DESCARGA.exec(texto);
      if (m) {
        // Emscripten avisa cada fragmento descargado (miles de veces): se reenvía a lo más cada 0,5 %.
        const cargado = Number(m[1]);
        totalVisto = Number(m[2]);
        if (cargado - ultimoAviso >= totalVisto / 200) {
          ultimoAviso = cargado;
          this.escuchas.progreso(cargado, totalVisto);
        }
      } else if (texto === 'All downloads complete.') {
        if (totalVisto > 0) this.escuchas.progreso(totalVisto, totalVisto);
      } else {
        this.escuchas.salida(texto);
      }
    };
    // Los paquetes del catálogo son también los que se precargan: así no hay recarga del módulo después.
    const pipeline = new BusytexPipeline(
      `${base}/busytex.js`,
      `${base}/busytex.wasm`,
      paquetes,
      paquetes,
      [],
      imprimir,
      () => undefined,
      true,
      BusytexPipeline.ScriptLoaderWorker,
    );
    this.pipeline = pipeline;
    const modulo = await pipeline.Module;
    const versiones = (await pipeline.on_initialized_promise) as Record<string, string> | undefined;
    if (espejo) modulo.ENV['TEXLIVE_REMOTE_ENDPOINT'] = espejo;
    this.modulo = modulo;
    return versiones ?? modulo.applet_versions ?? {};
  }

  private requerir(): { pipeline: BusytexPipeline; modulo: BusytexModulo } {
    if (!this.pipeline || !this.modulo) throw new Error('El motor de compilación todavía no está listo.');
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
    if (!this.cabecera) throw new Error('Primero hay que montar el proyecto.');
    const bitacora = rutaDeBitacora(cmd);
    const entradas: Array<{ stdout: string; stderr: string; exit_code: number }> = [];
    const inicio = performance.now();
    // error_messages [''] hace que `_run_cmd` devuelva siempre el código de salida real del programa.
    const { log } = pipeline._run_cmd(
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
    );
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
