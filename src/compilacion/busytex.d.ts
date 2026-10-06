// SPDX-License-Identifier: AGPL-3.0-or-later
// Tipos mínimos de BusytexPipeline: solo lo que usa worker/adaptador.ts.
// Son internos de texlyre-busytex 1.4.0 (busytex_pipeline.js); revisar al actualizar.

interface BusytexModuloFS {
  analyzePath(ruta: string): { exists: boolean; object?: { mount?: { mountpoint: string } } };
  mkdir(ruta: string): void;
  writeFile(ruta: string, datos: string | Uint8Array): void;
  readFile(ruta: string, opciones: { encoding: 'binary' }): Uint8Array;
  readFile(ruta: string, opciones: { encoding: 'utf8' }): string;
  unlink(ruta: string): void;
  chdir(ruta: string): void;
  mount(tipo: unknown, opciones: object, ruta: string): void;
  unmount(ruta: string): void;
  filesystems: { MEMFS: unknown };
}

interface BusytexModuloRuta {
  join(...partes: string[]): string;
  dirname(ruta: string): string;
  basename(ruta: string): string;
}

interface BusytexModulo {
  FS: BusytexModuloFS;
  PATH: BusytexModuloRuta;
  HEAPU8: Uint8Array;
  ENV: Record<string, string>;
  applet_versions: Record<string, string>;
  kpse_remote_register(nombre: string, formato: number, contenido: Uint8Array | string): void;
  kpse_remote_register_misses(claves: string[]): void;
}

declare class BusytexPipeline {
  static ScriptLoaderWorker(src: string): Promise<void>;
  constructor(
    busytex_js: string,
    busytex_wasm: string,
    data_packages_js: string[],
    preload_data_packages_js: string[],
    texmf_local: string[],
    print: (texto: string) => void,
    on_initialized: (versiones: Record<string, string>) => void,
    preload: boolean,
    script_loader: (src: string) => Promise<void>,
  );
  project_dir: string;
  mem_header_size: number;
  fmt: { pdftex: string };
  Module: Promise<BusytexModulo>;
  on_initialized_promise: Promise<unknown>;
  _run_cmd(
    Module: BusytexModulo,
    FS: BusytexModuloFS,
    cmd: string[],
    error_messages: string[],
    verbose: string,
    log_path: string,
    blg_path: string,
    aux_path: string,
    bbl_path: string,
    mem_header: Uint8Array,
    logs: unknown[],
  ): { exit_code: number; log: string };
  write_texlive_remote_files(
    archivos: { name: string; format?: number; contents: Uint8Array | string }[],
  ): Promise<void>;
  write_texlive_remote_misses(claves: string[]): Promise<void>;
}

/** Solo existe dentro del worker (la lib «webworker» no se mezcla con «DOM» en este proyecto). */
declare function importScripts(...urls: string[]): void;
