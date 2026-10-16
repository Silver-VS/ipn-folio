// SPDX-License-Identifier: AGPL-3.0-or-later
import { detectarPrincipal, normalizarRuta, type Almacen } from '../almacen';
import type { ArchivoInicial } from '../almacen/tipos';
import type { Plantilla } from './catalogo';

export async function crearDesdePlantilla(almacen: Almacen, plantilla: Plantilla) {
  const archivos: ArchivoInicial[] = [];
  for (const ruta of plantilla.archivos) {
    const normalizada = normalizarRuta(ruta);
    if (normalizada !== ruta || !/^[a-z0-9-]+$/.test(plantilla.id))
      throw new Error('ruta_plantilla_invalida');
    let base = 'plantillas';
    if (import.meta.env.DEV) {
      if (plantilla.origen === 'local') base = 'plantillas-locales';
    }
    if (plantilla.origen === 'local' && !import.meta.env.DEV) throw new Error('plantilla_solo_local');
    const respuesta = await fetch(
      `${import.meta.env.BASE_URL}${base}/${encodeURIComponent(plantilla.id)}/${ruta.split('/').map(encodeURIComponent).join('/')}`,
    );
    if (!respuesta.ok) throw new Error(`plantilla: ${ruta}: HTTP ${respuesta.status}`);
    archivos.push({ ruta, contenido: new Uint8Array(await respuesta.arrayBuffer()) });
  }
  return almacen.crearProyecto(
    { nombre: plantilla.nombre, plantilla: plantilla.id, principal: detectarPrincipal(archivos) },
    archivos,
  );
}
