// SPDX-License-Identifier: AGPL-3.0-or-later
// Orquestador de compilación (D9, «al estilo de latexmk»). Corre en el hilo principal y habla con el Motor
// (sesión 03) con `ejecutar(cmd)`; las decisiones las toma `plan.ts` (lógica pura). Entrega PDF y problemas
// en español (lector de bitácoras, sesión 05) y conserva el último PDF bueno si una compilación falla.
import { analizar } from '../bitacora';
import { crearProblema } from '../bitacora/mensajes';
import type { Problema } from '../bitacora/tipos';
import { ErrorMotor, textoDeError } from '../motor';
import type { PuertoMotor } from '../motor';
import type { ArchivoProyecto } from '../tipos';
import { analizarProyecto } from './analisis-proyecto';
import type { AnalisisProyecto } from './analisis-proyecto';
import { cmdTex } from './comandos';
import { etiquetaDePaso, textoDeProgreso } from './etiquetas';
import { huella } from './huella';
import { candidatas, decidir, estimarTotalInicial } from './plan';
import type { Candidata, NombrePaso } from './plan';
import { prerevisar } from './prerevision';

export interface PuertoOrquestador extends PuertoMotor {
  /** Detiene el motor de inmediato (lo pendiente falla con `ErrorMotor('cancelado')`). */
  cancelar(): void;
}

export interface PasoEjecutado {
  nombre: NombrePaso;
  /** Comando completo, tal como se ejecutó. */
  cmd: string[];
  codigo: number;
  ms: number;
}

export interface EntradaCompilacion {
  archivos: ArchivoProyecto[];
  /** Ruta del `.tex` principal, relativa a la raíz del proyecto. */
  principal: string;
}

export interface ResultadoCompilacion {
  exito: boolean;
  cancelado: boolean;
  pdf: Uint8Array | null;
  synctex: Uint8Array | null;
  problemas: Problema[];
  duracionMs: number;
  /** La compilación falló pero hay un PDF bueno anterior que la interfaz puede seguir mostrando. */
  pdfAnteriorConservado: boolean;
  pasos: PasoEjecutado[];
  /** `true` si se reutilizaron archivos de la compilación anterior (bibliografía, índices, referencias). */
  cacheUsada: boolean;
  /** Herramientas que se saltaron porque su entrada no cambió respecto de la compilación anterior. */
  saltadas: string[];
  /** Por qué terminó el ciclo de pasadas (`limite`: TeX seguía pidiendo repetir tras el máximo). */
  motivo: 'completo' | 'limite' | 'fatal' | 'sin-pdf' | 'cancelado' | 'motor';
}

export type EventoOrquestador =
  | { tipo: 'inicio' }
  | { tipo: 'paso'; n: number; total: number; nombre: NombrePaso; etiqueta: string; texto: string }
  | { tipo: 'salida'; texto: string }
  | ({ tipo: 'fin' } & ResultadoCompilacion);

export interface OpcionesOrquestador {
  alEvento?: (evento: EventoOrquestador) => void;
  /** Pide al motor la salida de TeX en vivo (la recibe el `eventos.salida` del Motor). */
  enVivo?: boolean;
}

interface Registro {
  tipo: 'blg' | 'ilg';
  texto: string;
}

/** Lo que se recuerda entre compilaciones de la misma sesión (no sobrevive a recargar la página). */
interface Cache {
  principal: string;
  rutas: string;
  huellas: Record<string, string>;
  huellaAuxiliares: string;
  registros: Record<string, Registro>;
  generados: ArchivoProyecto[];
}

const decodificador = new TextDecoder('utf-8');
const aTexto = (c: ArchivoProyecto['contenido']) => (typeof c === 'string' ? c : decodificador.decode(c));
const dirname = (ruta: string) => (ruta.includes('/') ? ruta.slice(0, ruta.lastIndexOf('/')) : '');
const basename = (ruta: string) => ruta.slice(ruta.lastIndexOf('/') + 1);
const EXTENSIONES_AUXILIARES = ['toc', 'lof', 'lot', 'out'];

/** Líneas del `.aux` que indican «cambió algo y hay que repetir»: etiquetas, citas resueltas y escritos a toc/lof/lot. */
const LINEA_RELEVANTE = /^\\(?:newlabel|bibcite|@writefile|zref@newlabel)\b.*$/gm;

/** Huella de lo que indica «cambió algo, hay que repetir»: líneas relevantes de los .aux y contenido de toc/lof/lot/out. */
function huellaDeAuxiliares(
  base: string,
  auxiliares: string[],
  contenidos: Readonly<Record<string, string | undefined>>,
): string {
  const lineas = auxiliares.flatMap((a) => (contenidos[a] ?? '').match(LINEA_RELEVANTE) ?? []);
  const generales = EXTENSIONES_AUXILIARES.map((e) => contenidos[`${base}.${e}`] ?? '');
  return huella(lineas.join('\n') + '\n--\n' + generales.join('\n--\n'));
}

/** Nombres (sin carpeta) de lo que una compilación genera y vale la pena reutilizar. */
function generables(analisis: AnalisisProyecto, base: string): string[] {
  return [
    `${base}.aux`,
    ...analisis.incluidos.map((i) => `${i}.aux`),
    ...EXTENSIONES_AUXILIARES.map((e) => `${base}.${e}`),
    `${base}.bbl`,
    `${base}.ind`,
    ...analisis.indicesExtra.map((i) => `${i.nombre}.ind`),
    `${base}.nls`,
    `${base}.gls`,
    `${base}.acr`,
    ...analisis.glosariosExtra.map((g) => `${base}.${g.salida}`),
  ];
}

export class Orquestador {
  private cache: Cache | null = null;
  private ultimoPdf: Uint8Array | null = null;
  private proyectoPdf: string | null = null;
  private cola: Promise<unknown> = Promise.resolve();
  private enCurso = false;
  /** Se pidió cancelar: se revisa antes de cada operación con el motor (puede llegar entre dos de ellas). */
  private cancelacionPedida = false;

  constructor(
    private readonly motor: PuertoOrquestador,
    private readonly opciones: OpcionesOrquestador = {},
  ) {}

  /** Último PDF generado sin errores en esta sesión (el que la interfaz sigue mostrando si falla una compilación). */
  get pdfAnterior(): Uint8Array | null {
    return this.ultimoPdf;
  }

  /** Olvida la caché y el PDF anterior al cambiar de proyecto; la siguiente corre todas las herramientas. */
  olvidarCache(): void {
    this.cache = null;
    this.ultimoPdf = null;
    this.proyectoPdf = null;
  }

  /** Cancela la compilación en curso; el evento `fin` llega con `cancelado: true`. */
  cancelar(): void {
    if (!this.enCurso) return;
    this.cancelacionPedida = true;
    this.motor.cancelar();
  }

  /** Compila el proyecto. Las compilaciones se atienden de una en una. */
  compilar(entrada: EntradaCompilacion): Promise<ResultadoCompilacion> {
    const turno = this.cola.then(() =>
      this.correr(entrada).finally(() => {
        this.enCurso = false;
      }),
    );
    this.cola = turno.catch(() => undefined);
    return turno;
  }

  /** Una cancelación pedida entre dos operaciones con el motor debe detener la compilación igual que una en curso. */
  private verificarCancelacion(): void {
    if (this.cancelacionPedida) throw new ErrorMotor('cancelado');
  }

  private emitir(evento: EventoOrquestador): void {
    this.opciones.alEvento?.(evento);
  }

  private async correr({ archivos, principal }: EntradaCompilacion): Promise<ResultadoCompilacion> {
    this.enCurso = true;
    this.cancelacionPedida = false;
    const inicio = performance.now();
    this.emitir({ tipo: 'inicio' });

    const dir = dirname(principal);
    const tex = basename(principal);
    const base = tex.replace(/\.tex$/i, '');
    const ruta = (nombre: string) => (dir ? `${dir}/${nombre}` : nombre);
    const conDir = (archivo: string | undefined) =>
      archivo && dir && !/^(?:\/|[A-Za-z]:)/.test(archivo) ? `${dir}/${archivo}` : archivo;
    const leerTexto = async (nombre: string): Promise<string | undefined> => {
      this.verificarCancelacion();
      const bytes = await this.motor.leer(ruta(nombre));
      return bytes ? decodificador.decode(bytes) : undefined;
    };

    const analisis = analizarProyecto(archivos);
    const previos = prerevisar(archivos);
    if (analisis.biber)
      previos.push(
        crearProblema({ codigo: 'biber-no-soportado', variables: {} }, { gravedad: 'aviso', original: '' }),
      );
    const lista = candidatas(analisis, base);

    const rutasProyecto = new Set(archivos.map((a) => a.ruta));
    const clave = [...rutasProyecto].sort().join('\n');
    const proyecto = `${principal}\n${clave}`;
    if (this.proyectoPdf !== proyecto) this.ultimoPdf = null;
    let cache =
      this.cache && this.cache.principal === principal && this.cache.rutas === clave ? this.cache : null;
    const extraBib = huella(
      archivos
        .filter((a) => /\.(bib|bst)$/i.test(a.ruta))
        .sort((a, b) => a.ruta.localeCompare(b.ruta))
        .map((a) => `${a.ruta}\n${aTexto(a.contenido)}`)
        .join('\n'),
    );

    const pasos: PasoEjecutado[] = [];
    const extraEstilos = huella(
      archivos
        .filter((a) => /\.ist$/i.test(a.ruta))
        .sort((a, b) => a.ruta.localeCompare(b.ruta))
        .map((a) => `${a.ruta}\n${aTexto(a.contenido)}`)
        .join('\n'),
    );
    const usadas: Record<string, string> = { ...(cache?.huellas ?? {}) };
    const registros: Record<string, Registro> = { ...(cache?.registros ?? {}) };
    const corridas = new Set<string>();
    let entradas: Record<string, string | null> = {};
    let texEjecutadas = 0;
    let herramientaTrasUltimaTex = false;
    let ultimaTex: { codigo: number; repetir: boolean; fatal: boolean } | null = null;
    let auxiliaresCambiaron = false;
    let huellaAuxiliares = cache?.huellaAuxiliares ?? huellaDeAuxiliares(base, [], {});
    let logTex = '';
    let total = estimarTotalInicial(analisis, cache !== null);
    let motivo!: ResultadoCompilacion['motivo'];
    let errorMotor: ErrorMotor | null = null;

    const correrComando = async (nombre: NombrePaso, cmd: string[]) => {
      this.verificarCancelacion();
      const r = await this.motor.ejecutar(cmd, this.opciones.enVivo ? { enVivo: true } : {});
      pasos.push({ nombre, cmd, codigo: r.codigo, ms: r.ms });
      if (!this.opciones.enVivo && (r.stdout || r.stderr))
        this.emitir({ tipo: 'salida', texto: `${r.stdout}${r.stderr}` });
      return r;
    };

    try {
      const generadosPrevios = cache ? cache.generados.filter((g) => !rutasProyecto.has(g.ruta)) : [];
      await this.motor.montar([...archivos, ...generadosPrevios], dir);

      for (;;) {
        const decision = decidir(
          {
            candidatas: lista,
            texEjecutadas,
            pasosHechos: pasos.length,
            ultimaTex,
            entradas,
            usadas,
            herramientaTrasUltimaTex,
            auxiliaresCambiaron,
            bibliografiaCorrida: pasos.some((p) => p.nombre === 'bibliografia'),
          },
          total,
        );
        if (decision.tipo === 'fin') {
          motivo = decision.motivo;
          break;
        }
        const { paso } = decision;
        const n = pasos.length + 1;
        total = Math.max(decision.total, n);
        this.emitir({
          tipo: 'paso',
          n,
          total,
          nombre: paso.nombre,
          etiqueta: etiquetaDePaso(paso.nombre),
          texto: textoDeProgreso(n, total, paso.nombre),
        });

        if (paso.tipo === 'herramienta') {
          const r = await correrComando(paso.nombre, paso.cmd);
          corridas.add(paso.clave);
          usadas[paso.clave] = paso.huella;
          registros[paso.clave] = { tipo: paso.nombre === 'bibliografia' ? 'blg' : 'ilg', texto: r.log };
          herramientaTrasUltimaTex = true;
          continue;
        }

        const r = await correrComando(paso.nombre, cmdTex(tex));
        logTex = r.log;
        const lectura = analizar({ log: r.log }).senales;
        ultimaTex = { codigo: r.codigo, repetir: lectura.repetirPasada, fatal: lectura.fatal };
        texEjecutadas++;
        herramientaTrasUltimaTex = false;
        if (r.codigo !== 0 || lectura.fatal) continue;

        // Lo que TeX dejó: auxiliares (¿cambiaron?) y entradas de las herramientas (¿hay algo nuevo que procesar?).
        const auxiliares = [`${base}.aux`, ...analisis.incluidos.map((i) => `${i}.aux`)];
        const rutasLeer = new Set([
          ...auxiliares,
          ...EXTENSIONES_AUXILIARES.map((e) => `${base}.${e}`),
          ...lista.flatMap((c) => c.lee),
        ]);
        const contenidos: Record<string, string | undefined> = {};
        for (const nombre of rutasLeer) contenidos[nombre] = await leerTexto(nombre);
        const nueva = huellaDeAuxiliares(base, auxiliares, contenidos);
        auxiliaresCambiaron = nueva !== huellaAuxiliares;
        huellaAuxiliares = nueva;
        entradas = Object.fromEntries(
          lista.map((c: Candidata) => [
            c.clave,
            c.huella(contenidos, c.nombre === 'bibliografia' ? extraBib : extraEstilos),
          ]),
        );
        if (cache && lista.some((c) => usadas[c.clave] && entradas[c.clave] === null)) {
          // Las salidas montadas ya pudieron imprimirse: repetir con un sistema de archivos limpio.
          this.cache = cache = null;
          for (const clave of Object.keys(usadas)) delete usadas[clave];
          for (const clave of Object.keys(registros)) delete registros[clave];
          corridas.clear();
          entradas = {};
          texEjecutadas = 0;
          ultimaTex = null;
          auxiliaresCambiaron = false;
          huellaAuxiliares = huellaDeAuxiliares(base, [], {});
          this.verificarCancelacion();
          await this.motor.montar(archivos, dir);
        }
      }
    } catch (error) {
      if (!(error instanceof ErrorMotor)) {
        this.enCurso = false;
        throw error;
      }
      errorMotor = error;
      motivo = error.codigo === 'cancelado' ? 'cancelado' : 'motor';
    }

    let pdf: Uint8Array | null = null;
    let synctex: Uint8Array | null = null;
    if (motivo === 'fatal') this.cache = null;
    const huboFallo = motivo === 'fatal' || motivo === 'cancelado' || motivo === 'motor';
    if (!huboFallo) {
      try {
        this.verificarCancelacion();
        const bytes = await this.motor.leer(ruta(`${base}.pdf`));
        if (bytes && bytes.byteLength > 0) {
          const sincronizacion = await this.motor.leer(ruta(`${base}.synctex.gz`));
          const generados = await this.leerGenerados(analisis, base, ruta);
          this.verificarCancelacion();
          this.guardarCache(principal, clave, usadas, huellaAuxiliares, registros, generados);
          pdf = bytes;
          synctex = sincronizacion;
        } else motivo = 'sin-pdf';
      } catch (error) {
        if (!(error instanceof ErrorMotor)) {
          this.enCurso = false;
          throw error;
        }
        errorMotor = error;
        motivo = error.codigo === 'cancelado' ? 'cancelado' : 'motor';
      }
    }

    const exito = pdf !== null;
    const problemas: Problema[] = [...previos];
    if (motivo !== 'cancelado') {
      const blg = Object.values(registros)
        .filter((r) => r.tipo === 'blg')
        .map((r) => r.texto)
        .join('\n');
      const ilg = Object.values(registros)
        .filter((r) => r.tipo === 'ilg')
        .map((r) => r.texto)
        .join('\n');
      problemas.push(
        ...analizar({ log: logTex, blg, ilg }).problemas.map((p) => ({
          ...p,
          archivo: conDir(p.archivo),
        })),
      );
    }
    if (motivo === 'sin-pdf')
      problemas.push(
        crearProblema({ codigo: 'compilacion-fatal', variables: {} }, { gravedad: 'error', original: '' }),
      );
    if (errorMotor && motivo === 'motor')
      problemas.push({
        ...crearProblema(
          { codigo: 'motor-detenido', variables: {} },
          { gravedad: 'error', original: errorMotor.detalle },
        ),
        accion: textoDeError(errorMotor.codigo),
      });
    if (exito) {
      this.ultimoPdf = pdf;
      this.proyectoPdf = proyecto;
    }
    const resultado: ResultadoCompilacion = {
      exito,
      cancelado: motivo === 'cancelado',
      pdf,
      synctex,
      problemas,
      duracionMs: performance.now() - inicio,
      pdfAnteriorConservado: !exito && this.ultimoPdf !== null,
      pasos,
      cacheUsada: cache !== null,
      saltadas: cache
        ? lista.filter((c) => entradas[c.clave] != null && !corridas.has(c.clave)).map((c) => c.clave)
        : [],
      motivo,
    };
    this.enCurso = false;
    this.emitir({ tipo: 'fin', ...resultado });
    return resultado;
  }

  private async leerGenerados(
    analisis: AnalisisProyecto,
    base: string,
    ruta: (nombre: string) => string,
  ): Promise<ArchivoProyecto[]> {
    const generados: ArchivoProyecto[] = [];
    for (const nombre of generables(analisis, base)) {
      this.verificarCancelacion();
      const bytes = await this.motor.leer(ruta(nombre));
      if (bytes) generados.push({ ruta: ruta(nombre), contenido: bytes });
    }
    return generados;
  }

  private guardarCache(
    principal: string,
    rutas: string,
    huellas: Record<string, string>,
    huellaAuxiliares: string,
    registros: Record<string, Registro>,
    generados: ArchivoProyecto[],
  ): void {
    this.cache = { principal, rutas, huellas, huellaAuxiliares, registros, generados };
  }
}
