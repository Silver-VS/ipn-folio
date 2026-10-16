// SPDX-License-Identifier: AGPL-3.0-or-later
import { mount, unmount } from 'svelte';
import { crearAlmacenMemoria, crearAutoguardado, crearAvisos } from '../src/almacen';
import { EstadoProyecto } from '../src/app/proyecto/estado.svelte';
import PanelEditor from '../src/app/paneles/PanelEditor.svelte';
import PildoraEstado from '../src/app/proyecto/PildoraEstado.svelte';

const almacen = crearAlmacenMemoria();
const proyecto = await almacen.crearProyecto({ nombre: 'Prueba', principal: 'main.tex' }, [
  { ruta: 'main.tex', contenido: 'uno\ndos\ntres\ncuatro' },
]);
export const estado = (await EstadoProyecto.abrir(
  {
    almacen,
    auto: crearAutoguardado(almacen),
    avisos: crearAvisos(),
    persistente: false,
    reloj: { horaConfiable: () => undefined, medir: async () => false, medirSiToca: async () => false },
    cerrar() {},
  },
  proyecto.id,
))!;
const target = document.body.appendChild(document.createElement('main'));
target.style.height = '600px';
let editor = mount(PanelEditor, { target, props: { estado } });
mount(PildoraEstado, { target: document.body, props: { estado } });
export async function remontar() {
  await unmount(editor);
  editor = mount(PanelEditor, { target, props: { estado } });
}
declare global {
  interface Window {
    regresion: { estado: EstadoProyecto; remontar: typeof remontar };
  }
}
window.regresion = { estado, remontar };
