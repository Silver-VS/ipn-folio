// SPDX-License-Identifier: AGPL-3.0-or-later
import { detectarPrincipal, normalizarRuta, type Almacen } from '../almacen';
import type { ArchivoInicial } from '../almacen/tipos';
import type { Plantilla } from './catalogo';

export async function crearDesdePlantilla(almacen: Almacen, plantilla: Plantilla) {
  const archivos: ArchivoInicial[] = [];
  for (const ruta of plantilla.archivos) {
    normalizarRuta(ruta);
    const respuesta = await fetch(`${import.meta.env.BASE_URL}plantillas/${encodeURIComponent(plantilla.id)}/${ruta}`);
    if (!respuesta.ok) throw new Error(`plantilla: ${ruta}: HTTP ${respuesta.status}`);
    archivos.push({ ruta, contenido: new Uint8Array(await respuesta.arrayBuffer()) });
  }
  return almacen.crearProyecto({ nombre: plantilla.nombre, plantilla: plantilla.id, principal: detectarPrincipal(archivos) }, archivos);
}
