// SPDX-License-Identifier: AGPL-3.0-or-later
// Lógica de la pantalla de proyecto sobre un almacén real en memoria y el autoguardado de verdad (reloj falso).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearAlmacenMemoria, crearAutoguardado, crearAvisos, conectarAvisos } from '../../almacen';
import type { Almacen, RelojConfiable } from '../../almacen';
import type { Servicios } from '../servicios';
import { EstadoProyecto } from './estado.svelte';

const sinHora: RelojConfiable = {
  horaConfiable: () => undefined,
  medir: async () => false,
  medirSiToca: async () => false,
};

async function montar(): Promise<{
  almacen: Almacen;
  servicios: Servicios;
  estado: EstadoProyecto;
  id: string;
}> {
  const almacen = crearAlmacenMemoria();
  const proyecto = await almacen.crearProyecto({ nombre: 'Proyecto de prueba', principal: 'main.tex' }, [
    { ruta: 'main.tex', contenido: '\\documentclass{article}' },
    { ruta: 'capitulos/uno.tex', contenido: 'uno' },
    { ruta: 'referencias.bib', contenido: '@book{a}' },
  ]);
  const auto = crearAutoguardado(almacen, { espera: 400, maximo: 2000 });
  const avisos = crearAvisos({ nombreCanal: `prueba-${proyecto.id}` });
  conectarAvisos(almacen, avisos);
  const servicios: Servicios = { almacen, persistente: true, auto, avisos, reloj: sinHora, cerrar: () => {} };
  const estado = await EstadoProyecto.abrir(servicios, proyecto.id);
  if (!estado) throw new Error('no abrió');
  return { almacen, servicios, estado, id: proyecto.id };
}

describe('EstadoProyecto', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('abre el proyecto con el archivo principal en una pestaña y no abre uno en la papelera', async () => {
    const { almacen, servicios, estado, id } = await montar();
    expect(estado.abiertos).toEqual(['main.tex']);
    expect(estado.activo).toBe('main.tex');
    expect(estado.archivos.map((a) => a.ruta).sort()).toEqual([
      'capitulos/uno.tex',
      'main.tex',
      'referencias.bib',
    ]);
    await almacen.moverAPapelera(id);
    expect(await EstadoProyecto.abrir(servicios, id)).toBeUndefined();
    expect(await EstadoProyecto.abrir(servicios, 'no-existe')).toBeUndefined();
  });

  it('crear un archivo lo guarda, lo lista y lo abre; un nombre repetido (sin importar mayúsculas) se rechaza', async () => {
    const { almacen, estado, id } = await montar();
    expect(await estado.crearArchivo('notas/ideas.tex')).toBe(true);
    expect((await almacen.leer(id, 'notas/ideas.tex'))?.contenido).toBe('');
    expect(estado.activo).toBe('notas/ideas.tex');
    expect(await estado.crearArchivo('MAIN.TEX')).toBe(false);
    expect(estado.mensajes.at(-1)?.tipo).toBe('error');
    expect(await estado.crearArchivo('../fuera.tex')).toBe(false);
  });

  it('renombrar con un cambio pendiente no resucita la ruta vieja y el texto viaja a la nueva', async () => {
    const { almacen, estado, id } = await montar();
    estado.alEditar('referencias.bib', '@book{pendiente}');
    expect(estado.servicios.auto.estado).toBe('pendiente');
    expect(await estado.renombrarArchivo('referencias.bib', 'bibliografia.bib')).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await almacen.leer(id, 'referencias.bib')).toBeUndefined();
    expect((await almacen.leer(id, 'bibliografia.bib'))?.contenido).toBe('@book{pendiente}');
    expect(estado.archivos.map((a) => a.ruta)).toContain('bibliografia.bib');
    expect(estado.archivos.map((a) => a.ruta)).not.toContain('referencias.bib');
  });

  it('renombrar una carpeta mueve las pestañas abiertas que cuelgan de ella', async () => {
    const { estado } = await montar();
    estado.abrirArchivo('capitulos/uno.tex');
    expect(await estado.renombrarArchivo('capitulos', 'partes')).toBe(true);
    expect(estado.abiertos).toContain('partes/uno.tex');
    expect(estado.abiertos).not.toContain('capitulos/uno.tex');
    expect(estado.activo).toBe('partes/uno.tex');
  });

  it('renombrar el archivo principal actualiza el proyecto', async () => {
    const { estado } = await montar();
    expect(await estado.renombrarArchivo('main.tex', 'tesis.tex')).toBe(true);
    expect(estado.proyecto.principal).toBe('tesis.tex');
  });

  it('borrar con un cambio pendiente deja la última versión en la papelera (no se vuelve a crear) y «Deshacer» la restaura', async () => {
    const { almacen, estado, id } = await montar();
    estado.abrirArchivo('referencias.bib');
    estado.alEditar('referencias.bib', '@book{pendiente}');
    await estado.borrarArchivo('referencias.bib');
    await vi.advanceTimersByTimeAsync(5000);
    expect(await almacen.leer(id, 'referencias.bib')).toBeUndefined();
    expect(estado.abiertos).not.toContain('referencias.bib');
    const aviso = estado.mensajes.at(-1);
    expect(aviso?.accion?.etiqueta).toBe('Deshacer');
    aviso?.accion?.ejecutar();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await almacen.leer(id, 'referencias.bib'))?.contenido).toBe('@book{pendiente}');
  });

  it('el aviso de borrado dice cuántos días hay para recuperarlo', async () => {
    const { estado } = await montar();
    await estado.borrarArchivo('referencias.bib');
    expect(estado.mensajes.at(-1)?.texto).toBe(
      'Se movió referencias.bib a la papelera. Tienes 30 días para recuperarlo.',
    );
  });

  it('lo borrado sigue en la papelera después de recargar y se restaura con los mismos bytes', async () => {
    const { almacen, servicios, estado, id } = await montar();
    await estado.borrarArchivo('capitulos');
    expect(estado.papelera.map((e) => e.ruta)).toEqual(['capitulos']);
    const otra = (await EstadoProyecto.abrir(servicios, id))!;
    expect(otra.papelera.map((e) => e.ruta)).toEqual(['capitulos']);
    await otra.restaurarDePapelera(otra.papelera[0]!);
    expect(otra.papelera).toEqual([]);
    expect(otra.archivos.map((a) => a.ruta)).toContain('capitulos/uno.tex');
    expect((await almacen.leer(id, 'capitulos/uno.tex'))?.contenido).toBe('uno');
    expect(otra.mensajes.at(-1)?.texto).toBe('Se restauró capitulos.');
    expect(otra.enfocarArbol?.ruta).toBe('capitulos/uno.tex');
  });

  it('restaurar con la ruta ocupada lo dice y no pisa nada', async () => {
    const { almacen, estado, id } = await montar();
    await estado.borrarArchivo('referencias.bib');
    await almacen.escribir(id, 'referencias.bib', 'nuevo');
    await estado.restaurarDePapelera(estado.papelera[0]!);
    expect((await almacen.leer(id, 'referencias.bib'))?.contenido).toBe('nuevo');
    expect((await almacen.leer(id, 'referencias (2).bib'))?.contenido).toBe('@book{a}');
    expect(estado.mensajes.at(-1)?.texto).toBe(
      'Se restauró como referencias (2).bib porque referencias.bib ya existía.',
    );
  });

  it('borrar una carpeta quita todo lo que cuelga de ella', async () => {
    const { almacen, estado, id } = await montar();
    await estado.borrarArchivo('capitulos');
    expect(await almacen.leer(id, 'capitulos/uno.tex')).toBeUndefined();
    expect(estado.archivos.map((a) => a.ruta)).toEqual(['main.tex', 'referencias.bib']);
  });

  it('mover el proyecto a la papelera guarda antes lo pendiente', async () => {
    const { almacen, estado, id } = await montar();
    estado.alEditar('main.tex', 'último cambio');
    await estado.moverAPapelera();
    const proyecto = await almacen.obtenerProyecto(id);
    expect(proyecto?.enPapelera).toBeDefined();
    expect((await almacen.leer(id, 'main.tex'))?.contenido).toBe('último cambio');
  });

  it('las pestañas abiertas se recuerdan por proyecto', async () => {
    const { servicios, estado, id } = await montar();
    estado.abrirArchivo('referencias.bib');
    estado.activarArchivo('main.tex');
    await vi.advanceTimersByTimeAsync(10);
    const otra = await EstadoProyecto.abrir(servicios, id);
    expect(otra?.abiertos).toEqual(['main.tex', 'referencias.bib']);
    expect(otra?.activo).toBe('main.tex');
  });

  it('abrir una imagen la deja en una pestaña; otro binario avisa y no se abre', async () => {
    const { almacen, estado, id } = await montar();
    await almacen.escribir(id, 'imagenes/foto.png', new Uint8Array([1, 2, 3]));
    await almacen.escribir(id, 'datos/modelo.mat', new Uint8Array([4, 5]));
    await estado.refrescarArchivos();
    estado.abrirArchivo('imagenes/foto.png');
    expect(estado.abiertos).toContain('imagenes/foto.png');
    estado.abrirArchivo('datos/modelo.mat');
    expect(estado.abiertos).not.toContain('datos/modelo.mat');
    expect(estado.mensajes.at(-1)?.texto).toMatch(/No se puede mostrar datos\/modelo\.mat/);
  });

  it('subir archivos los agrega con nombre libre y cuenta cuántos fueron', async () => {
    const { almacen, estado, id } = await montar();
    const archivo = (nombre: string, bytes: number[]) => new File([new Uint8Array(bytes)], nombre);
    await estado.subirArchivos([archivo('referencias.bib', [64]), archivo('figura.png', [1, 2, 3])], '');
    expect(await almacen.leer(id, 'referencias (2).bib')).toBeDefined();
    expect(await almacen.leer(id, 'figura.png')).toBeDefined();
    expect(estado.mensajes.at(-1)?.texto).toBe('Se agregaron 2 archivos al proyecto.');
  });

  it('el PDF recibido (aunque sea el mismo) cambia de versión', async () => {
    const { estado } = await montar();
    const bytes = new Uint8Array([37, 80, 68, 70]);
    estado.mostrarPdf(bytes, 'a.pdf');
    const v1 = estado.pdf?.version ?? 0;
    estado.mostrarPdf(bytes, 'a.pdf');
    expect(estado.pdf?.version).toBe(v1 + 1);
  });

  it('los mensajes informativos se quitan solos; los de error se quedan', async () => {
    const { estado } = await montar();
    estado.avisar('info', 'hola');
    estado.avisar('error', 'mal');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(estado.mensajes.map((m) => m.texto)).toEqual(['mal']);
  });

  it('el aviso con Deshacer permanece más de quince segundos hasta cerrarlo', async () => {
    const { estado } = await montar();
    await estado.borrarArchivo('referencias.bib');
    const aviso = estado.mensajes.at(-1)!;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(estado.mensajes).toContain(aviso);
    estado.quitarMensaje(aviso.id);
    expect(estado.mensajes).not.toContain(aviso);
  });

  it('un fallo de guardado publica un error y evita borrar la versión sin guardar', async () => {
    const { almacen, estado, id } = await montar();
    vi.spyOn(almacen, 'escribir').mockRejectedValue(new Error('almacén no disponible'));
    estado.alEditar('main.tex', 'cambio sin guardar');
    await estado.borrarArchivo('main.tex');
    expect(estado.guardado).toBe('error');
    expect(estado.mensajes.at(-1)?.tipo).toBe('error');
    expect((await almacen.leer(id, 'main.tex'))?.contenido).toBe('\\documentclass{article}');
    expect(estado.abiertos).toContain('main.tex');
  });

  it('el conflicto cancela el guardado y bloquea nuevas pulsaciones hasta elegir', async () => {
    const { almacen, servicios, estado, id } = await montar();
    let recibir: Parameters<typeof servicios.avisos.escuchar>[0] | undefined;
    const escuchar = vi.spyOn(servicios.avisos, 'escuchar').mockImplementation((fn) => {
      recibir = fn;
      return () => {};
    });
    const otra = (await EstadoProyecto.abrir(servicios, id))!;
    escuchar.mockRestore();
    otra.alEditar('main.tex', 'mi versión');
    await almacen.escribir(id, 'main.tex', 'otra versión');
    recibir?.({ tipo: 'cambio-archivo', proyectoId: id, ruta: 'main.tex', origen: 'otra' });
    await vi.advanceTimersByTimeAsync(0);
    expect(otra.conflictos).toContain('main.tex');
    otra.alEditar('main.tex', 'mi versión con más cambios');
    // Un archivo distinto puede guardarse sin desbloquear el conflicto.
    otra.alEditar('referencias.bib', 'bibliografía');
    await vi.advanceTimersByTimeAsync(3000);
    expect((await almacen.leer(id, 'main.tex'))?.contenido).toBe('otra versión');
    otra.alEditar('main.tex', 'todavía en conflicto');
    await vi.advanceTimersByTimeAsync(3000);
    expect((await almacen.leer(id, 'main.tex'))?.contenido).toBe('otra versión');
    await otra.destruir();
    await estado.destruir();
    servicios.avisos.cerrar();
  });
});
