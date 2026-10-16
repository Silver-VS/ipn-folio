// SPDX-License-Identifier: AGPL-3.0-or-later
// Proyecto de ejemplo ficticio para probar la pantalla de proyecto (el inicio real, con plantillas, es de la sesión 09).
import type { Almacen, Proyecto } from '../../almacen';
import { t } from '../../textos/t';
import desarrollo from './desarrollo.tex?raw';
import principal from './main.tex?raw';
import referencias from './referencias.bib?raw';

export async function crearProyectoDeEjemplo(almacen: Almacen): Promise<Proyecto> {
  return almacen.crearProyecto({ nombre: t('inicio.ejemplo.nombre'), principal: 'main.tex' }, [
    { ruta: 'main.tex', contenido: principal },
    { ruta: 'capitulos/desarrollo.tex', contenido: desarrollo },
    { ruta: 'referencias.bib', contenido: referencias },
  ]);
}
