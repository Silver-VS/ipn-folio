// SPDX-License-Identifier: AGPL-3.0-or-later
// Motor falso para probar el plan y el orquestador sin WASM: simula un sistema de archivos y lo que cada
// programa deja en él. Solo lo usan las pruebas.
import { ErrorMotor } from '../motor';
import type { ResultadoEjecucion, ArchivoProyecto } from '../tipos';
import type { PuertoOrquestador } from './orquestador';

const codificador = new TextEncoder();

export interface Escenario {
  /** Archivos que deja un programa (rutas relativas a la carpeta del principal). `n`: cuántas veces ha corrido ese programa. */
  generar?: (cmd: string[], n: number) => Record<string, string | undefined>;
  /** Bitácora de cada pasada de TeX (`n` desde 1). */
  logTex?: (n: number) => string;
  /** Código de salida (por omisión 0). */
  codigo?: (cmd: string[], n: number) => number;
  /** Bitácora de las herramientas distintas de TeX. */
  logHerramienta?: (cmd: string[]) => string;
}

export function crearMotorFalso(escenario: Escenario = {}) {
  const sistema = new Map<string, Uint8Array>();
  const comandos: string[][] = [];
  const montajes: Array<{ archivos: ArchivoProyecto[]; directorio?: string }> = [];
  const ejecuciones = new Map<string, number>();
  let directorio = '';
  let enEspera: ((e: Error) => void) | null = null;
  let detener: Promise<void> | null = null;

  const motor: PuertoOrquestador & { alEjecutar?: (cmd: string[]) => Promise<void> | void } = {
    async montar(archivos, dir = '') {
      montajes.push({ archivos, directorio: dir });
      directorio = dir;
      sistema.clear();
      for (const a of archivos) {
        sistema.set(a.ruta, typeof a.contenido === 'string' ? codificador.encode(a.contenido) : a.contenido);
      }
    },
    async ejecutar(cmd) {
      comandos.push(cmd);
      await motor.alEjecutar?.(cmd);
      const programa = cmd[0] ?? '';
      const n = (ejecuciones.get(programa) ?? 0) + 1;
      ejecuciones.set(programa, n);
      const prefijo = directorio ? `${directorio}/` : '';
      let log = '';
      if (programa === 'pdflatex') {
        log = escenario.logTex?.(n) ?? '';
        sistema.set(`${prefijo}main.pdf`, codificador.encode('%PDF-1.5 falso'));
      } else log = escenario.logHerramienta?.(cmd) ?? '';
      for (const [ruta, texto] of Object.entries(escenario.generar?.(cmd, n) ?? {})) {
        if (texto !== undefined) sistema.set(prefijo + ruta, codificador.encode(texto));
      }
      const resultado: ResultadoEjecucion = {
        codigo: escenario.codigo?.(cmd, n) ?? 0,
        stdout: '',
        stderr: '',
        log,
        ms: 1,
      };
      if (detener) await Promise.race([detener, new Promise<never>((_, rechazar) => (enEspera = rechazar))]);
      return resultado;
    },
    async leer(ruta) {
      return sistema.get(ruta) ?? null;
    },
    async existe(ruta) {
      return sistema.has(ruta);
    },
    cancelar() {
      enEspera?.(new ErrorMotor('cancelado'));
    },
  };

  return {
    motor,
    comandos,
    montajes,
    sistema,
    /** Programas ejecutados, en orden. */
    programas: () => comandos.map((c) => c[0]),
    /** Hace que la siguiente ejecución se quede esperando hasta que se cancele. */
    bloquear() {
      detener = new Promise<void>(() => undefined);
    },
  };
}
