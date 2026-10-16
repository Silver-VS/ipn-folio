<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { detectarPrincipal, importarZip, tipoPorRuta, textoDeAviso } from '../../almacen';
  import { decodificarTexto } from '../../almacen/rutas';
  import type { ArchivoInicial } from '../../almacen/tipos';
  import { t } from '../../textos/t';
  import { plano } from '../../textos/plano';
  import type { Servicios } from '../servicios';
  import { hashDeProyecto } from '../ruta';
  let {
    servicios,
    alError,
    alAviso,
  }: { servicios: Servicios; alError: (e: unknown) => void; alAviso: (texto: string) => void } = $props();
  let ocupado = $state(false);
  const rutas = new WeakMap<File, string>();

  async function soltar(evento: DragEvent) {
    evento.preventDefault();
    if (ocupado || !evento.dataTransfer) return;
    try {
      const archivos: File[] = [];
      const recorrer = async (entrada: FileSystemEntry, prefijo = ''): Promise<void> => {
        const ruta = prefijo + entrada.name;
        if (entrada.isFile) {
          const archivo = await new Promise<File>((aceptar, rechazar) =>
            (entrada as FileSystemFileEntry).file(aceptar, rechazar),
          );
          rutas.set(archivo, ruta);
          archivos.push(archivo);
        } else if (entrada.isDirectory) {
          const lector = (entrada as FileSystemDirectoryEntry).createReader();
          for (;;) {
            const lote = await new Promise<FileSystemEntry[]>((aceptar, rechazar) =>
              lector.readEntries(aceptar, rechazar),
            );
            if (!lote.length) break;
            for (const hijo of lote) await recorrer(hijo, ruta + '/');
          }
        }
      };
      const entradas = Array.from(evento.dataTransfer.items)
        .map((item) => item.webkitGetAsEntry?.())
        .filter((e): e is FileSystemEntry => !!e);
      if (entradas.length) for (const entrada of entradas) await recorrer(entrada);
      else archivos.push(...evento.dataTransfer.files);
      await importar(archivos);
    } catch (e) {
      alError(e);
    }
  }

  async function importar(lista: FileList | File[] | null) {
    if (!lista?.length || ocupado) return;
    ocupado = true;
    try {
      const primero = lista[0]!;
      let proyecto;
      if (lista.length === 1 && /\.zip$/i.test(primero.name)) {
        const resultado = await importarZip(
          servicios.almacen,
          new Uint8Array(await primero.arrayBuffer()),
          primero.name,
        );
        proyecto = resultado.proyecto;
        for (const aviso of resultado.avisos) alAviso(plano(textoDeAviso(aviso)));
        if (resultado.ignorados.length)
          alAviso(t('plantillas.importados_ignorados', { n: resultado.ignorados.length }));
      } else {
        const archivos: ArchivoInicial[] = [];
        for (const archivo of lista) {
          const bytes = new Uint8Array(await archivo.arrayBuffer());
          const rutaOriginal = rutas.get(archivo) || archivo.webkitRelativePath || archivo.name;
          // Una carpeta importada es la raíz del proyecto: los input y las imágenes conservan sus rutas relativas.
          const ruta =
            (rutas.has(archivo) || archivo.webkitRelativePath) && rutaOriginal.includes('/')
              ? rutaOriginal.slice(rutaOriginal.indexOf('/') + 1)
              : rutaOriginal;
          const texto = tipoPorRuta(ruta) === 'texto' ? decodificarTexto(bytes) : undefined;
          archivos.push({ ruta, contenido: texto ? texto.texto : bytes });
          if (texto?.convertido)
            alAviso(plano(textoDeAviso({ clave: 'codificacion_convertida', variables: { ruta } })));
        }
        proyecto = await servicios.almacen.crearProyecto(
          {
            nombre:
              (rutas.get(primero) || primero.webkitRelativePath).split('/')[0] ||
              primero.name.replace(/\.tex$/i, ''),
            principal: detectarPrincipal(archivos),
          },
          archivos,
        );
      }
      location.hash = hashDeProyecto(proyecto.id);
    } catch (e) {
      alError(e);
    } finally {
      ocupado = false;
    }
  }
</script>

<div
  class="importar"
  role="group"
  aria-label={t('plantillas.soltar')}
  ondragover={(e) => e.preventDefault()}
  ondrop={(e) => void soltar(e)}
>
  <p>{t('plantillas.soltar')}</p>
  <label
    >{t('plantillas.importar')}<input
      type="file"
      accept=".tex,.zip"
      disabled={ocupado}
      onchange={(e) => void importar(e.currentTarget.files)}
    /></label
  >
  <label
    >{t('plantillas.carpeta')}<input
      type="file"
      webkitdirectory
      disabled={ocupado}
      onchange={(e) => void importar(e.currentTarget.files)}
    /></label
  >
</div>

<style>
  .importar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ipn-esp-3);
    margin-block: var(--ipn-esp-4);
  }
  label {
    display: grid;
    gap: var(--ipn-esp-2);
    max-width: 100%;
  }
  input {
    max-width: 100%;
    min-height: var(--ipn-objetivo-tactil);
  }
</style>
