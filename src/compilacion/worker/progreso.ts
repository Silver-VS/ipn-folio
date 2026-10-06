// SPDX-License-Identifier: AGPL-3.0-or-later
// Progreso de la primera descarga de los activos: suma `busytex.wasm` y los paquetes de datos (`texlive-*.data`)
// en un solo avance. Sin acceso a internos de BusyTeX: solo cuenta bytes (los une `adaptador.ts`).

export interface TotalesConocidos {
  /** Bytes de `busytex.wasm` (de `activos.json`). */
  wasm?: number;
  /** Bytes de los paquetes de datos del catálogo (de `activos.json`). */
  datos?: number;
}

/**
 * Totales de la descarga a partir de `activos.json` (lo escribe `scripts/activos.mjs`). Función pura.
 * `datos` solo se informa si todos los paquetes del catálogo (`texlive-basic.js` → `texlive-basic.data`) constan.
 */
export function totalesDeActivos(activos: unknown, catalogo: readonly string[]): TotalesConocidos {
  const archivos = (activos as { archivos?: Array<{ nombre?: string; bytes?: number }> } | null)?.archivos;
  if (!Array.isArray(archivos)) return {};
  const bytes = (nombre: string) => archivos.find((a) => a.nombre === nombre)?.bytes;
  const datos = catalogo.map((js) => bytes(js.replace(/\.js$/, '.data')));
  return {
    wasm: bytes('busytex.wasm'),
    datos: datos.every((b) => typeof b === 'number')
      ? datos.reduce<number>((s, b) => s + (b ?? 0), 0)
      : undefined,
  };
}

/**
 * Acumula el avance del `.wasm` y de los datos y lo emite como (cargado, total) en bytes: crece sin retroceder
 * y el último evento trae cargado = total. Si los datos ya estaban en IndexedDB (no hubo descarga), el total
 * final solo cuenta lo que sí se descargó.
 */
export class ProgresoDescarga {
  private cargadoWasm = 0;
  private wasmListo = false;
  private cargadoDatos = 0;
  private totalDatos = 0;
  private datosVistos = false;
  private datosDescartados = false;
  private ultimoCargado = 0;
  private ultimoTotal = -1;

  constructor(
    private readonly emitir: (cargado: number, total: number) => void,
    private readonly conocidos: TotalesConocidos = {},
  ) {}

  private total(): number {
    const wasm = this.wasmListo ? this.cargadoWasm : Math.max(this.conocidos.wasm ?? 0, this.cargadoWasm);
    let datos = 0;
    if (this.datosVistos) datos = this.totalDatos;
    else if (!this.datosDescartados) datos = this.conocidos.datos ?? 0;
    return wasm + datos;
  }

  private avisar(forzar: boolean): void {
    const cargado = this.cargadoWasm + this.cargadoDatos;
    const total = Math.max(this.total(), cargado);
    // La descarga avisa miles de veces: se reenvía a lo más cada 0,5 %.
    if (!forzar && cargado - this.ultimoCargado < total / 200) return;
    if (cargado === this.ultimoCargado && total === this.ultimoTotal) return;
    this.ultimoCargado = cargado;
    this.ultimoTotal = total;
    this.emitir(cargado, total);
  }

  /** Bytes del `.wasm` recibidos hasta ahora. */
  wasm(cargado: number): void {
    this.cargadoWasm = Math.max(this.cargadoWasm, cargado);
    this.avisar(false);
  }

  wasmTerminado(): void {
    this.wasmListo = true;
    this.avisar(false);
  }

  /** Avance de los datos, como lo reporta el cargador (bytes recibidos y total). */
  datos(cargado: number, total: number): void {
    this.datosVistos = true;
    this.totalDatos = total;
    this.cargadoDatos = Math.max(this.cargadoDatos, cargado);
    this.avisar(false);
  }

  /** Terminaron todas las descargas: emite el evento final con cargado = total. */
  terminar(): void {
    this.wasmListo = true;
    if (this.datosVistos) this.cargadoDatos = this.totalDatos;
    else this.datosDescartados = true;
    this.avisar(true);
  }
}

/**
 * Devuelve una copia de la respuesta cuyo cuerpo avisa cuántos bytes lleva leídos (`alAvanzar`) y cuándo termina.
 * Conserva estado y cabeceras (`WebAssembly.compileStreaming` exige `application/wasm`).
 */
export function medirDescarga(
  respuesta: Response,
  alAvanzar: (acumulado: number) => void,
  alTerminar: () => void,
): Response {
  if (!respuesta.ok || !respuesta.body) return respuesta;
  let acumulado = 0;
  const medidor = new TransformStream<Uint8Array, Uint8Array>({
    transform(trozo, control) {
      acumulado += trozo.byteLength;
      alAvanzar(acumulado);
      control.enqueue(trozo);
    },
    flush() {
      alTerminar();
    },
  });
  return new Response(respuesta.body.pipeThrough(medidor), {
    status: respuesta.status,
    statusText: respuesta.statusText,
    headers: respuesta.headers,
  });
}
