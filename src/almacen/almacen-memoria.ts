// SPDX-License-Identifier: AGPL-3.0-or-later
// Implementación en memoria: pruebas y respaldo si IndexedDB no está disponible (nada sobrevive a cerrar la pestaña).
import { ErrorAlmacen } from './errores';
import {
  ajustarContenido,
  Emisor,
  estaBajo,
  normalizarRuta,
  nuevoId,
  planearRenombrado,
  sinContenido,
  validarArbol,
} from './rutas';
import type {
  Almacen,
  ArchivoInicial,
  ArchivoProyecto,
  Contenido,
  DatosProyecto,
  EventoAlmacen,
  FiltroProyectos,
  OpcionesAlmacen,
  Proyecto,
} from './tipos';

const copiar = <T>(v: T): T => structuredClone(v);

export function crearAlmacenMemoria(opciones: OpcionesAlmacen = {}): Almacen {
  const ahora = opciones.ahora ?? Date.now;
  const proyectos = new Map<string, Proyecto>();
  const archivos = new Map<string, Map<string, ArchivoProyecto>>();
  const ajustes = new Map<string, unknown>();
  const distribuciones = new Map<string, unknown>();
  const herramientas = new Map<string, unknown>();
  const emisor = new Emisor<EventoAlmacen>();

  const proyecto = (id: string): Proyecto => {
    const p = proyectos.get(id);
    if (!p) throw new ErrorAlmacen('proyecto_inexistente');
    return p;
  };
  const activo = (id: string): Proyecto => {
    const p = proyecto(id);
    if (p.enPapelera !== undefined) throw new ErrorAlmacen('proyecto_en_papelera');
    return p;
  };
  const arbol = (id: string): Map<string, ArchivoProyecto> => {
    let a = archivos.get(id);
    if (!a) archivos.set(id, (a = new Map()));
    return a;
  };
  const nombreValido = (nombre: string): string => {
    const limpio = typeof nombre === 'string' ? nombre.trim() : '';
    if (!limpio) throw new ErrorAlmacen('nombre_invalido');
    return limpio;
  };
  const crearArchivo = (
    proyectoId: string,
    ruta: string,
    contenido: Contenido,
    t: number,
  ): ArchivoProyecto => ({
    proyectoId,
    ruta,
    ...ajustarContenido(ruta, copiar(contenido)),
    modificado: t,
  });

  return {
    async listarProyectos(filtro: FiltroProyectos = 'activos') {
      return [...proyectos.values()]
        .filter((p) => filtro === 'todos' || (filtro === 'papelera') === (p.enPapelera !== undefined))
        .sort((a, b) => b.modificado - a.modificado || a.id.localeCompare(b.id))
        .map(copiar);
    },

    async crearProyecto(datos: DatosProyecto, iniciales: ArchivoInicial[] = []) {
      const nombre = nombreValido(datos.nombre);
      const t = ahora();
      const rutas = iniciales.map((a) => normalizarRuta(a.ruta));
      validarArbol(rutas);
      const principal = datos.principal === undefined ? 'main.tex' : normalizarRuta(datos.principal);
      const p: Proyecto = {
        id: nuevoId(),
        nombre,
        creado: t,
        modificado: t,
        principal,
        motor: datos.motor ?? 'pdflatex',
      };
      if (datos.plantilla !== undefined) p.plantilla = datos.plantilla;
      const nuevos = new Map<string, ArchivoProyecto>();
      iniciales.forEach((a, i) => nuevos.set(rutas[i]!, crearArchivo(p.id, rutas[i]!, a.contenido, t)));
      proyectos.set(p.id, p);
      archivos.set(p.id, nuevos);
      emisor.emitir({ tipo: 'cambio-proyecto', proyectoId: p.id });
      return copiar(p);
    },

    async obtenerProyecto(id) {
      const p = proyectos.get(id);
      return p && copiar(p);
    },

    async renombrarProyecto(id, nombre) {
      const p = activo(id);
      p.nombre = nombreValido(nombre);
      p.modificado = ahora();
      emisor.emitir({ tipo: 'cambio-proyecto', proyectoId: id });
    },

    async moverAPapelera(id) {
      proyecto(id).enPapelera = ahora();
      emisor.emitir({ tipo: 'cambio-proyecto', proyectoId: id });
    },

    async restaurar(id) {
      delete proyecto(id).enPapelera;
      emisor.emitir({ tipo: 'cambio-proyecto', proyectoId: id });
    },

    async listarArchivos(id) {
      proyecto(id);
      return [...arbol(id).values()]
        .map(sinContenido)
        .sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : 0));
    },

    async leer(id, ruta) {
      proyecto(id);
      const a = arbol(id).get(normalizarRuta(ruta));
      return a && copiar(a);
    },

    async escribir(id, ruta, contenido) {
      const p = activo(id);
      const r = normalizarRuta(ruta);
      const a = arbol(id);
      validarArbol([...[...a.keys()].filter((k) => k !== r), r]);
      const t = ahora();
      a.set(r, crearArchivo(id, r, contenido, t));
      p.modificado = t;
      emisor.emitir({ tipo: 'cambio-archivo', proyectoId: id, ruta: r });
    },

    async renombrar(id, rutaVieja, rutaNueva) {
      const p = activo(id);
      const vieja = normalizarRuta(rutaVieja);
      const nueva = normalizarRuta(rutaNueva);
      const a = arbol(id);
      const plan = planearRenombrado([...a.keys()], vieja, nueva);
      if (plan.size === 0) return;
      // Se trabaja sobre una copia y se confirma al final: si algo falla a la mitad, no cambia nada.
      const copia = new Map(a);
      const t = ahora();
      let i = 0;
      for (const [desde, hasta] of plan) {
        opciones.inyectarFallo?.('renombrar', i++);
        const archivo = copia.get(desde)!;
        copia.delete(desde);
        copia.set(hasta, { ...archivo, ...ajustarContenido(hasta, archivo.contenido), ruta: hasta, modificado: t });
      }
      archivos.set(id, copia);
      p.modificado = t;
      if (estaBajo(p.principal, vieja)) p.principal = nueva + p.principal.slice(vieja.length);
      for (const [desde, hasta] of plan) {
        emisor.emitir({ tipo: 'cambio-archivo', proyectoId: id, ruta: desde });
        emisor.emitir({ tipo: 'cambio-archivo', proyectoId: id, ruta: hasta });
      }
    },

    async borrar(id, ruta) {
      const p = activo(id);
      const r = normalizarRuta(ruta);
      const a = arbol(id);
      const quitar = [...a.keys()].filter((k) => estaBajo(k, r));
      if (quitar.length === 0) throw new ErrorAlmacen('archivo_inexistente', { ruta: r });
      for (const k of quitar) a.delete(k);
      p.modificado = ahora();
      for (const k of quitar) emisor.emitir({ tipo: 'cambio-archivo', proyectoId: id, ruta: k });
    },

    async leerAjuste<T>(clave: string) {
      return copiar(ajustes.get(clave)) as T | undefined;
    },
    async guardarAjuste(clave, valor) {
      ajustes.set(clave, copiar(valor));
    },
    async leerDistribucion<T>(clave: string) {
      return copiar(distribuciones.get(clave)) as T | undefined;
    },
    async guardarDistribucion(clave, json) {
      distribuciones.set(clave, copiar(json));
    },
    async leerHerramienta<T>(id: string) {
      return copiar(herramientas.get(id)) as T | undefined;
    },
    async guardarHerramienta(id, estado) {
      herramientas.set(id, copiar(estado));
    },

    al: (evento, fn) => emisor.al(evento, fn),
    cerrar() {
      emisor.limpiar();
    },
  };
}
