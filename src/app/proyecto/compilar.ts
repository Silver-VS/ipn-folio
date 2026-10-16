// SPDX-License-Identifier: AGPL-3.0-or-later
import { Motor } from '../../compilacion/motor';
import { Orquestador, type EventoOrquestador, type PuertoOrquestador } from '../../compilacion/orquestador/orquestador';
import type { TiendaHerramientas } from '../../herramientas/tienda.svelte';
import { plano } from '../../textos/plano';
import { t } from '../../textos/t';
import type { EstadoProyecto } from './estado.svelte';

/** Un controlador por proyecto: no comparte PDF ni auxiliares con otro documento. */
export function conectarCompilacion(
  estado: EstadoProyecto,
  tienda: Pick<TiendaHerramientas, 'instalada' | 'solicitar'>,
  crearMotor: () => PuertoOrquestador = () => new Motor(),
) {
  let motor: PuertoOrquestador | undefined;
  let orquestador: Orquestador | undefined;
  let enCurso: Promise<void> | undefined;
  let pendiente = false;
  let inicio = 0;
  let cerrado = false;

  function evento(e: EventoOrquestador) {
    if (cerrado) return;
    if (e.tipo === 'inicio') {
      estado.compilacion = 'compilando';
      estado.progresoCompilacion = t('flujo.actualizando');
      estado.salida = '';
    } else if (e.tipo === 'paso') estado.progresoCompilacion = plano(e.texto);
    else if (e.tipo === 'salida') estado.salida += e.texto;
    else if (e.tipo === 'fin' && !e.cancelado) {
      estado.problemas = e.problemas.map((p) => ({
        severidad: p.gravedad, texto: plano(p.titulo), accion: plano(p.accion),
        ruta: p.archivo, linea: p.linea, original: p.original,
      })).sort((a, b) => Number(b.severidad === 'error') - Number(a.severidad === 'error'));
      estado.duracionCompilacion = (e.duracionMs / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 });
      estado.compilacion = e.exito ? (estado.problemas.length ? 'avisos' : 'listo') : 'error';
      estado.pdfAnterior = !e.exito && !!estado.pdf;
      if (e.exito && e.pdf) estado.mostrarPdf(e.pdf, estado.proyecto.principal.replace(/\.tex$/i, '.pdf'));
      console.info('Folio: compilación terminada', { proyecto: estado.id, principal: estado.proyecto.principal,
        exito: e.exito, motivo: e.motivo, duracionMs: e.duracionMs, pasos: e.pasos, cache: e.cacheUsada });
    }
  }

  async function correr() {
    do {
      pendiente = false;
      if (cerrado) return;
      // D11/D15: ni construir el Motor antes de pasar por la tienda.
      if (!tienda.instalada) {
        await tienda.solicitar();
        if (!tienda.instalada || cerrado) return;
      }
      if (estado.conflictos.length) {
        estado.avisar('aviso', t('flujo.resolver_conflicto'));
        return;
      }
      await estado.servicios.auto.guardarTodo();
      if (cerrado) return;
      if (estado.servicios.auto.estado !== 'guardado') throw new Error('guardado_pendiente');
      const info = await estado.servicios.almacen.listarArchivos(estado.id);
      const archivos = [];
      for (const { ruta } of info) {
        const archivo = await estado.servicios.almacen.leer(estado.id, ruta);
        if (archivo) archivos.push({ ruta, contenido: archivo.contenido });
      }
      if (cerrado) return;
      if (estado.conflictos.length) {
        estado.avisar('aviso', t('flujo.resolver_conflicto'));
        return;
      }
      motor ??= crearMotor();
      orquestador ??= new Orquestador(motor, { alEvento: evento });
      inicio = Date.now();
      await orquestador.compilar({ archivos, principal: estado.proyecto.principal });
    } while (pendiente && !cerrado);
  }

  function solicitar(): Promise<void> {
    if (cerrado) return Promise.resolve();
    if (enCurso) {
      pendiente = true;
      if (orquestador && Date.now() - inicio > 2000) orquestador.cancelar();
      return enCurso;
    }
    enCurso = correr().catch((error: unknown) => {
      if (cerrado) return;
      console.error('Folio: fallo al preparar compilación', { proyecto: estado.id, error });
      estado.compilacion = 'error';
      estado.pdfAnterior = !!estado.pdf;
      estado.avisar('error', t('flujo.fallo_preparacion'));
    }).finally(() => { enCurso = undefined; });
    return enCurso;
  }

  return { solicitar, destruir() { cerrado = true; pendiente = false; orquestador?.cancelar(); motor?.cancelar(); } };
}
