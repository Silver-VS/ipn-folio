// SPDX-License-Identifier: AGPL-3.0-or-later
// Exportar e importar proyectos como .zip (compatible con Overleaf y con cualquier gestor de archivos).
import { unzipSync, zipSync } from 'fflate';
import type { Zippable } from 'fflate';
import { t } from '../textos/t';
import { ErrorAlmacen } from './errores';
import type { AvisoImportacion } from './errores';
import { aBytes, aTexto, decodificarTexto, extension, normalizarRuta, tipoPorRuta } from './rutas';
import type { Almacen, ArchivoInicial, Contenido, Proyecto } from './tipos';

/** Extensiones de archivos auxiliares que genera la compilación: no se importan. */
const AUXILIARES = new Set([
  'aux',
  'log',
  'toc',
  'lof',
  'lot',
  'out',
  'bbl',
  'blg',
  'idx',
  'ind',
  'ilg',
  'nlo',
  'nls',
]);

/** Tope de tamaño descomprimido (protege contra zips «bomba»). */
export const MAXIMO_BYTES_ZIP = 256 * 1024 * 1024;

const esAuxiliar = (ruta: string): boolean => {
  const nombre = ruta.slice(ruta.lastIndexOf('/') + 1).toLowerCase();
  return nombre.endsWith('.synctex.gz') || nombre === '.ds_store' || AUXILIARES.has(extension(ruta));
};

const esMacosx = (ruta: string): boolean => ruta.startsWith('__MACOSX/') || ruta.includes('/__MACOSX/');

const DOCUMENTCLASS = /^[^%\r\n]*\\documentclass\b/m;

/**
 * Elige el archivo principal: el `.tex` con `\documentclass` (ignorando comentarios). Si hay varios, el de la raíz
 * (con preferencia por `main.tex` y luego orden alfabético); si ninguno lo tiene, `main.tex` si existe, si no el
 * primer `.tex` y, por último, el primer archivo. Sin archivos, `main.tex`.
 */
export function detectarPrincipal(archivos: ArchivoInicial[]): string {
  const rutas = archivos.map((a) => a.ruta).sort();
  const tex = archivos
    .filter((a) => extension(a.ruta) === 'tex')
    .sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : 0));
  const conClase = tex.filter((a) => DOCUMENTCLASS.test(aTexto(a.contenido)));
  const eleccion = (lista: ArchivoInicial[]): string | undefined => {
    const raiz = lista.filter((a) => !a.ruta.includes('/'));
    const grupo = raiz.length > 0 ? raiz : lista;
    return (grupo.find((a) => a.ruta === 'main.tex') ?? grupo[0])?.ruta;
  };
  return (
    eleccion(conClase) ??
    (tex.some((a) => a.ruta === 'main.tex') ? 'main.tex' : undefined) ??
    tex[0]?.ruta ??
    rutas[0] ??
    'main.tex'
  );
}

/** Empaqueta el árbol del proyecto tal cual está (sin comprimir lo que ya viene comprimido). */
export async function exportarZip(almacen: Almacen, id: string): Promise<Uint8Array> {
  const info = await almacen.listarArchivos(id);
  const entradas: Zippable = {};
  for (const { ruta } of info) {
    const archivo = await almacen.leer(id, ruta);
    if (!archivo) continue;
    const mtime = Math.max(archivo.modificado, Date.UTC(1980, 0, 2));
    entradas[ruta] = [aBytes(archivo.contenido), { level: tipoPorRuta(ruta) === 'texto' ? 6 : 0, mtime }];
  }
  return zipSync(entradas);
}

export interface ResultadoImportacion {
  proyecto: Proyecto;
  /** Rutas que no se importaron (auxiliares, `__MACOSX/`, rutas inválidas). */
  ignorados: string[];
  /** Avisos para mostrar al alumnado con `textoDeAviso`: texto convertido de otra codificación, entradas repetidas. */
  avisos: AvisoImportacion[];
}

/** Crea un proyecto nuevo con el contenido del zip. `nombre` puede traer la extensión `.zip`. */
export async function importarZip(
  almacen: Almacen,
  bytes: Uint8Array,
  nombre: string,
): Promise<ResultadoImportacion> {
  const ignorados: string[] = [];
  let total = 0;
  let crudo: Record<string, Uint8Array>;
  try {
    crudo = unzipSync(bytes, {
      filter(archivo) {
        if (archivo.name.endsWith('/')) return false;
        const ruta = archivo.name.replace(/\\/g, '/');
        if (esMacosx(ruta) || esAuxiliar(ruta)) {
          ignorados.push(ruta);
          return false;
        }
        total += archivo.originalSize;
        if (total > MAXIMO_BYTES_ZIP) throw new ErrorAlmacen('zip_demasiado_grande');
        return true;
      },
    });
  } catch (e) {
    if (e instanceof ErrorAlmacen) throw e;
    throw new ErrorAlmacen('zip_invalido');
  }

  // Por ruta ya normalizada: si dos entradas coinciden (`a.tex` y `./a.tex`) gana la última y se avisa.
  const porRuta = new Map<string, { contenido: Contenido; convertido: boolean }>();
  const avisos: AvisoImportacion[] = [];
  for (const [nombreEnZip, datos] of Object.entries(crudo)) {
    let ruta: string;
    try {
      ruta = normalizarRuta(nombreEnZip);
    } catch {
      ignorados.push(nombreEnZip);
      continue;
    }
    if (porRuta.has(ruta)) avisos.push({ clave: 'entrada_duplicada', variables: { ruta } });
    if (tipoPorRuta(ruta) === 'texto') {
      const { texto, convertido } = decodificarTexto(datos);
      porRuta.set(ruta, { contenido: texto, convertido });
    } else {
      porRuta.set(ruta, { contenido: datos, convertido: false });
    }
  }
  const archivos: ArchivoInicial[] = [];
  for (const [ruta, { contenido, convertido }] of porRuta) {
    archivos.push({ ruta, contenido });
    if (convertido) avisos.push({ clave: 'codificacion_convertida', variables: { ruta } });
  }

  const proyecto = await almacen.crearProyecto(
    {
      nombre: nombre.replace(/\.zip$/i, '').trim() || t('almacen.proyecto_sin_nombre'),
      principal: detectarPrincipal(archivos),
    },
    archivos,
  );
  return { proyecto, ignorados, avisos };
}
