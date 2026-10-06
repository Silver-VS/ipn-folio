// SPDX-License-Identifier: AGPL-3.0-or-later
import { t } from '../../textos/t';
import type { Problema } from './tipos';

export interface Clasificacion {
  codigo: string;
  variables: Record<string, string | number>;
  variante?: string;
}
export const CATALOGO = {
  'archivo-faltante': {
    codigo: 'archivo-faltante',
    variables: ['archivo'],
    titulo: 'errores.latex.archivo_faltante.titulo',
    ayuda: 'errores.latex.archivo_faltante.ayuda',
    resolver: (v: Record<string, string | number>) => ({
      titulo: t('errores.latex.archivo_faltante.titulo', { archivo: v.archivo ?? '?' }),
      accion: t('errores.latex.archivo_faltante.ayuda', { archivo: v.archivo ?? '?' }),
    }),
  },
  'imagen-faltante': {
    codigo: 'archivo-faltante',
    variables: ['archivo'],
    titulo: 'errores.latex.imagen_faltante.titulo',
    ayuda: 'errores.latex.imagen_faltante.ayuda',
    resolver: (v: Record<string, string | number>) => ({
      titulo: t('errores.latex.imagen_faltante.titulo', { archivo: v.archivo ?? '?' }),
      accion: t('errores.latex.imagen_faltante.ayuda', { archivo: v.archivo ?? '?' }),
    }),
  },
  'comando-indefinido': {
    codigo: 'comando-indefinido',
    variables: ['comando'],
    titulo: 'errores.latex.comando_indefinido.titulo',
    ayuda: 'errores.latex.comando_indefinido.ayuda',
    resolver: (v: Record<string, string | number>) => ({
      titulo: t('errores.latex.comando_indefinido.titulo', { comando: v.comando ?? '?' }),
      accion: t('errores.latex.comando_indefinido.ayuda', { comando: v.comando ?? '?' }),
    }),
  },
  'matematicas-delimitador': {
    codigo: 'matematicas-delimitador',
    variables: [],
    titulo: 'errores.latex.matematicas_delimitador.titulo',
    ayuda: 'errores.latex.matematicas_delimitador.ayuda',
    resolver: () => ({
      titulo: t('errores.latex.matematicas_delimitador.titulo'),
      accion: t('errores.latex.matematicas_delimitador.ayuda'),
    }),
  },
  'llave-extra': {
    codigo: 'llave-extra',
    variables: [],
    titulo: 'errores.latex.llave_extra.titulo',
    ayuda: 'errores.latex.llave_extra.ayuda',
    resolver: () => ({
      titulo: t('errores.latex.llave_extra.titulo'),
      accion: t('errores.latex.llave_extra.ayuda'),
    }),
  },
  'llave-faltante': {
    codigo: 'llave-faltante',
    variables: [],
    titulo: 'errores.latex.llave_faltante.titulo',
    ayuda: 'errores.latex.llave_faltante.ayuda',
    resolver: () => ({
      titulo: t('errores.latex.llave_faltante.titulo'),
      accion: t('errores.latex.llave_faltante.ayuda'),
    }),
  },
  'argumento-incompleto': {
    codigo: 'argumento-incompleto',
    variables: [],
    titulo: 'errores.latex.argumento_incompleto.titulo',
    ayuda: 'errores.latex.argumento_incompleto.ayuda',
    resolver: () => ({
      titulo: t('errores.latex.argumento_incompleto.titulo'),
      accion: t('errores.latex.argumento_incompleto.ayuda'),
    }),
  },
  'entorno-indefinido': {
    codigo: 'entorno-indefinido',
    variables: ['entorno'],
    titulo: 'errores.latex.entorno_indefinido.titulo',
    ayuda: 'errores.latex.entorno_indefinido.ayuda',
    resolver: (v: Record<string, string | number>) => ({
      titulo: t('errores.latex.entorno_indefinido.titulo', { entorno: v.entorno ?? '?' }),
      accion: t('errores.latex.entorno_indefinido.ayuda', { entorno: v.entorno ?? '?' }),
    }),
  },
  'entorno-cierre': {
    codigo: 'entorno-cierre',
    variables: ['entorno', 'cierre'],
    titulo: 'errores.latex.entorno_cierre.titulo',
    ayuda: 'errores.latex.entorno_cierre.ayuda',
    resolver: (v: Record<string, string | number>) => ({
      titulo: t('errores.latex.entorno_cierre.titulo', {
        entorno: v.entorno ?? '?',
        cierre: v.cierre ?? '?',
      }),
      accion: t('errores.latex.entorno_cierre.ayuda', { entorno: v.entorno ?? '?' }),
    }),
  },
  'compilacion-detenida': {
    codigo: 'compilacion-detenida',
    variables: [],
    titulo: 'errores.latex.compilacion_detenida.titulo',
    ayuda: 'errores.latex.compilacion_detenida.ayuda',
    resolver: () => ({
      titulo: t('errores.latex.compilacion_detenida.titulo'),
      accion: t('errores.latex.compilacion_detenida.ayuda'),
    }),
  },
  'compilacion-fatal': {
    codigo: 'compilacion-fatal',
    variables: [],
    titulo: 'errores.latex.compilacion_fatal.titulo',
    ayuda: 'errores.latex.compilacion_fatal.ayuda',
    resolver: () => ({
      titulo: t('errores.latex.compilacion_fatal.titulo'),
      accion: t('errores.latex.compilacion_fatal.ayuda'),
    }),
  },
  'idioma-espanol-faltante': {
    codigo: 'idioma-espanol-faltante',
    variables: [],
    titulo: 'errores.latex.idioma_espanol_faltante.titulo',
    ayuda: 'errores.latex.idioma_espanol_faltante.ayuda',
    resolver: () => ({
      titulo: t('errores.latex.idioma_espanol_faltante.titulo'),
      accion: t('errores.latex.idioma_espanol_faltante.ayuda'),
    }),
  },
  'referencia-indefinida': {
    codigo: 'referencia-indefinida',
    variables: ['referencia'],
    titulo: 'errores.latex.referencia_indefinida.titulo',
    ayuda: 'errores.latex.referencia_indefinida.ayuda',
    resolver: (v: Record<string, string | number>) => ({
      titulo: t('errores.latex.referencia_indefinida.titulo', { referencia: v.referencia ?? '?' }),
      accion: t('errores.latex.referencia_indefinida.ayuda', { referencia: v.referencia ?? '?' }),
    }),
  },
  'cita-indefinida': {
    codigo: 'cita-indefinida',
    variables: ['cita'],
    titulo: 'errores.latex.cita_indefinida.titulo',
    ayuda: 'errores.latex.cita_indefinida.ayuda',
    resolver: (v: Record<string, string | number>) => ({
      titulo: t('errores.latex.cita_indefinida.titulo', { cita: v.cita ?? '?' }),
      accion: t('errores.latex.cita_indefinida.ayuda', { cita: v.cita ?? '?' }),
    }),
  },
  'referencias-indefinidas': {
    codigo: 'referencias-indefinidas',
    variables: [],
    titulo: 'errores.latex.referencias_indefinidas.titulo',
    ayuda: 'errores.latex.referencias_indefinidas.ayuda',
    resolver: () => ({
      titulo: t('errores.latex.referencias_indefinidas.titulo'),
      accion: t('errores.latex.referencias_indefinidas.ayuda'),
    }),
  },
  'repetir-pasada': {
    codigo: 'repetir-pasada',
    variables: [],
    titulo: 'errores.latex.repetir_pasada.titulo',
    ayuda: 'errores.latex.repetir_pasada.ayuda',
    resolver: () => ({
      titulo: t('errores.latex.repetir_pasada.titulo'),
      accion: t('errores.latex.repetir_pasada.ayuda'),
    }),
  },
  'formato-desbordado': {
    codigo: 'formato-desbordado',
    variables: ['puntos'],
    titulo: 'errores.latex.formato_desbordado.titulo',
    ayuda: 'errores.latex.formato_desbordado.ayuda',
    resolver: (v: Record<string, string | number>) => ({
      titulo: t('errores.latex.formato_desbordado.titulo', { puntos: v.puntos ?? '?' }),
      accion: t('errores.latex.formato_desbordado.ayuda'),
    }),
  },
  'fuente-indefinida': {
    codigo: 'fuente-indefinida',
    variables: [],
    titulo: 'errores.latex.fuente_indefinida.titulo',
    ayuda: 'errores.latex.fuente_indefinida.ayuda',
    resolver: () => ({
      titulo: t('errores.latex.fuente_indefinida.titulo'),
      accion: t('errores.latex.fuente_indefinida.ayuda'),
    }),
  },
  'paquete-aviso': {
    codigo: 'paquete-aviso',
    variables: ['paquete'],
    titulo: 'errores.latex.paquete_aviso.titulo',
    ayuda: 'errores.latex.paquete_aviso.ayuda',
    resolver: (v: Record<string, string | number>) => ({
      titulo: t('errores.latex.paquete_aviso.titulo', { paquete: v.paquete ?? '?' }),
      accion: t('errores.latex.paquete_aviso.ayuda', { paquete: v.paquete ?? '?' }),
    }),
  },
  'bibliografia-faltante': {
    codigo: 'bibliografia-faltante',
    variables: ['archivo'],
    titulo: 'errores.latex.bibliografia_faltante.titulo',
    ayuda: 'errores.latex.bibliografia_faltante.ayuda',
    resolver: (v: Record<string, string | number>) => ({
      titulo: t('errores.latex.bibliografia_faltante.titulo', { archivo: v.archivo ?? '?' }),
      accion: t('errores.latex.bibliografia_faltante.ayuda', { archivo: v.archivo ?? '?' }),
    }),
  },
  'bibliografia-sin-citas': {
    codigo: 'bibliografia-sin-citas',
    variables: [],
    titulo: 'errores.latex.bibliografia_sin_citas.titulo',
    ayuda: 'errores.latex.bibliografia_sin_citas.ayuda',
    resolver: () => ({
      titulo: t('errores.latex.bibliografia_sin_citas.titulo'),
      accion: t('errores.latex.bibliografia_sin_citas.ayuda'),
    }),
  },
  'bibliografia-campo-vacio': {
    codigo: 'bibliografia-campo-vacio',
    variables: ['campo', 'cita'],
    titulo: 'errores.latex.bibliografia_campo_vacio.titulo',
    ayuda: 'errores.latex.bibliografia_campo_vacio.ayuda_otro',
    resolver: (v: Record<string, string | number>) => ({
      titulo: t('errores.latex.bibliografia_campo_vacio.titulo', { cita: v.cita ?? '?' }),
      accion: t('errores.latex.bibliografia_campo_vacio.ayuda_otro', {
        campo: v.campo ?? '?',
        cita: v.cita ?? '?',
      }),
    }),
  },
  'bibliografia-autor-vacio': {
    codigo: 'bibliografia-campo-vacio',
    variables: ['cita'],
    titulo: 'errores.latex.bibliografia_campo_vacio.titulo',
    ayuda: 'errores.latex.bibliografia_campo_vacio.ayuda_autor',
    resolver: (v: Record<string, string | number>) => ({
      titulo: t('errores.latex.bibliografia_campo_vacio.titulo', { cita: v.cita ?? '?' }),
      accion: t('errores.latex.bibliografia_campo_vacio.ayuda_autor', { cita: v.cita ?? '?' }),
    }),
  },
  'bibliografia-entrada-faltante': {
    codigo: 'bibliografia-entrada-faltante',
    variables: ['cita'],
    titulo: 'errores.latex.bibliografia_entrada_faltante.titulo',
    ayuda: 'errores.latex.bibliografia_entrada_faltante.ayuda',
    resolver: (v: Record<string, string | number>) => ({
      titulo: t('errores.latex.bibliografia_entrada_faltante.titulo', { cita: v.cita ?? '?' }),
      accion: t('errores.latex.bibliografia_entrada_faltante.ayuda', { cita: v.cita ?? '?' }),
    }),
  },
  'bibliografia-sintaxis': {
    codigo: 'bibliografia-sintaxis',
    variables: ['linea'],
    titulo: 'errores.latex.bibliografia_sintaxis.titulo',
    ayuda: 'errores.latex.bibliografia_sintaxis.ayuda',
    resolver: (v: Record<string, string | number>) => ({
      titulo: t('errores.latex.bibliografia_sintaxis.titulo', { linea: v.linea ?? '?' }),
      accion: t('errores.latex.bibliografia_sintaxis.ayuda'),
    }),
  },
  'indice-rechazadas': {
    codigo: 'indice-rechazadas',
    variables: ['n'],
    titulo: 'errores.latex.indice_rechazadas.titulo',
    ayuda: 'errores.latex.indice_rechazadas.ayuda',
    resolver: (v: Record<string, string | number>) => ({
      titulo: t('errores.latex.indice_rechazadas.titulo', { n: v.n ?? '?' }),
      accion: t('errores.latex.indice_rechazadas.ayuda'),
    }),
  },
  'indice-aviso': {
    codigo: 'indice-aviso',
    variables: [],
    titulo: 'errores.latex.indice_aviso.titulo',
    ayuda: 'errores.latex.indice_aviso.ayuda',
    resolver: () => ({
      titulo: t('errores.latex.indice_aviso.titulo'),
      accion: t('errores.latex.indice_aviso.ayuda'),
    }),
  },
  desconocido: {
    codigo: 'desconocido',
    variables: ['linea'],
    titulo: 'errores.latex.desconocido.titulo',
    ayuda: 'errores.latex.desconocido.ayuda',
    resolver: (v: Record<string, string | number>) => ({
      titulo: t('errores.latex.desconocido.titulo', { linea: v.linea ?? '?' }),
      accion: t('errores.latex.desconocido.ayuda'),
    }),
  },
} as const;

export function crearProblema(
  c: Clasificacion,
  detalle: Omit<Problema, 'codigo' | 'variables' | 'titulo' | 'accion'>,
): Problema {
  const entrada = CATALOGO[(c.variante ?? c.codigo) as keyof typeof CATALOGO] ?? CATALOGO.desconocido;
  return {
    ...detalle,
    codigo: entrada.codigo,
    variables: { ...c.variables },
    ...entrada.resolver(c.variables),
  };
}

export function clasificar(mensaje: string, contexto: string, linea?: number): Clasificacion | undefined {
  const resultado = (
    codigo: string,
    variables: Record<string, string | number> = {},
    variante?: string,
  ): Clasificacion => ({ codigo, variables, variante });
  const faltante = /File\s+[`'"]([^`'"]+)[`'"]\s+not found/i.exec(mensaje);
  if (faltante) {
    const archivo = faltante[1]!;
    const imagen =
      /\.(?:png|jpe?g|pdf|eps|svg|webp|bmp)$/i.test(archivo) || /\\includegraphics/.test(contexto);
    return resultado('archivo-faltante', { archivo }, imagen ? 'imagen-faltante' : undefined);
  }
  if (/Undefined control sequence/.test(mensaje)) {
    const extracto =
      /^<[^>]+>\s*(.*)$/m.exec(contexto)?.[1] ??
      /^l\.\d+\s*(.*)$/m.exec(contexto)?.[1] ??
      contexto.split('\n').slice(1).join('\n');
    const comandos = [...extracto.matchAll(/\\(?:[a-zA-Z@]+|[^\s])/g)];
    return resultado('comando-indefinido', { comando: comandos.at(-1)?.[0] ?? '?' });
  }
  if (/Missing \$ inserted/.test(mensaje)) return resultado('matematicas-delimitador');
  if (/Extra \}, or forgotten \$/.test(mensaje)) return resultado('llave-extra');
  if (/Missing \} inserted/.test(mensaje)) return resultado('llave-faltante');
  if (/Runaway argument\?/.test(mensaje)) return resultado('argumento-incompleto');
  const entorno = /Environment\s+(\S+)\s+undefined/.exec(mensaje);
  if (entorno) return resultado('entorno-indefinido', { entorno: entorno[1]! });
  const cierre = /\\begin\{([^}]+)\}[\s\S]*?ended by\s+\\end\{([^}]+)\}/.exec(mensaje);
  if (cierre) return resultado('entorno-cierre', { entorno: cierre[1]!, cierre: cierre[2]! });
  if (/Emergency stop/.test(mensaje)) return resultado('compilacion-detenida');
  if (/Fatal error occurred/.test(mensaje)) return resultado('compilacion-fatal');
  if (/Package babel Error:[\s\S]*?Unknown option\s+[`'"]spanish['"]/.test(mensaje))
    return resultado('idioma-espanol-faltante');
  const referencia = /Reference\s+[`'"]([^`'"]+)['"][\s\S]*?undefined/.exec(mensaje);
  if (referencia) return resultado('referencia-indefinida', { referencia: referencia[1]! });
  const cita = /Citation\s+[`'"]([^`'"]+)['"][\s\S]*?undefined/.exec(mensaje);
  if (cita) return resultado('cita-indefinida', { cita: cita[1]! });
  if (/There were undefined (?:references|citations)/.test(mensaje))
    return resultado('referencias-indefinidas');
  if (
    /Rerun to get|Rerun LaTeX|Label\(s\) may have changed|Please (?:re)?run LaTeX/i.test(
      mensaje,
    )
  )
    return resultado('repetir-pasada');
  const desbordado = /Overfull \\hbox\s*\((\d+(?:\.\d+)?)pt too wide\)/.exec(mensaje);
  if (desbordado)
    return Number(desbordado[1]) > 10
      ? resultado('formato-desbordado', { puntos: Number(desbordado[1]) })
      : undefined;
  if (/Font shape[\s\S]*?undefined/.test(mensaje)) return resultado('fuente-indefinida');
  const paquete = /Package\s+(\S+)\s+Warning:/.exec(mensaje);
  if (paquete) return resultado('paquete-aviso', { paquete: paquete[1]! });
  return resultado('desconocido', { linea: linea ?? '?' });
}
