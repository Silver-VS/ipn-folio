<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { detectarPrincipal, importarZip, decodificarTexto, tipoPorRuta, textoDeAviso } from '../../almacen';
  import type { ArchivoInicial } from '../../almacen/tipos';
  import { t } from '../../textos/t';
  import { plano } from '../../textos/plano';
  import type { Servicios } from '../servicios';
  import { hashDeProyecto } from '../ruta';
  let { servicios, alError, alAviso }: { servicios: Servicios; alError: (e: unknown) => void; alAviso: (texto: string) => void } = $props();
  let ocupado = $state(false);

  async function importar(lista: FileList | null) {
    if (!lista?.length || ocupado) return;
    ocupado = true;
    try {
      const primero = lista[0]!;
      let proyecto;
      if (lista.length === 1 && /\.zip$/i.test(primero.name)) {
        const resultado = await importarZip(servicios.almacen, new Uint8Array(await primero.arrayBuffer()), primero.name);
        proyecto = resultado.proyecto;
        for (const aviso of resultado.avisos) alAviso(plano(textoDeAviso(aviso)));
        if (resultado.ignorados.length) alAviso(t('plantillas.importados_ignorados', { n: resultado.ignorados.length }));
      } else {
        const archivos: ArchivoInicial[] = [];
        for (const archivo of lista) {
          const bytes = new Uint8Array(await archivo.arrayBuffer());
          const ruta = archivo.webkitRelativePath || archivo.name;
          const texto = tipoPorRuta(ruta) === 'texto' ? decodificarTexto(bytes) : undefined;
          archivos.push({ ruta, contenido: texto ? texto.texto : bytes });
          if (texto?.convertido) alAviso(plano(textoDeAviso({ clave: 'codificacion_convertida', variables: { ruta } })));
        }
        proyecto = await servicios.almacen.crearProyecto({ nombre: primero.webkitRelativePath.split('/')[0] || primero.name.replace(/\.tex$/i, ''), principal: detectarPrincipal(archivos) }, archivos);
      }
      location.hash = hashDeProyecto(proyecto.id);
    } catch (e) { alError(e); }
    finally { ocupado = false; }
  }
</script>
<div class="importar">
  <label>{t('plantillas.importar')}<input type="file" accept=".tex,.zip" disabled={ocupado} onchange={(e) => void importar(e.currentTarget.files)} /></label>
  <label>{t('plantillas.carpeta')}<input type="file" webkitdirectory disabled={ocupado} onchange={(e) => void importar(e.currentTarget.files)} /></label>
</div>
<style>
  .importar { display: flex; flex-wrap: wrap; gap: var(--ipn-esp-3); margin-block: var(--ipn-esp-4); }
  label { display: grid; gap: var(--ipn-esp-2); max-width: 100%; }
  input { max-width: 100%; min-height: var(--ipn-objetivo-tactil); }
</style>
