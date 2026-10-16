<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { t } from '../../textos/t';
  import PanelProblemas from '../paneles/PanelProblemas.svelte';
  import type { EstadoProyecto } from './estado.svelte';
  let { estado }: { estado: EstadoProyecto } = $props();
  const texto = $derived(estado.compilacion === 'compilando' ? estado.progresoCompilacion
    : estado.compilacion === 'error' ? t('flujo.error')
    : estado.compilacion === 'sin-compilar' ? t('flujo.sin_compilar')
    : estado.compilacion === 'avisos' ? t('flujo.avisos', { n: estado.problemas.length })
    : t('flujo.listo', { segundos: estado.duracionCompilacion }));
</script>
<details class="pildora" data-compilacion={estado.compilacion}>
  <summary>{texto}</summary>
  <div class="popover">
    <h2>{t('flujo.que_revisar')}</h2>
    <PanelProblemas {estado} />
  </div>
</details>
<style>
  .pildora { position: relative; max-width: 100%; color: var(--ipn-info); }
  summary { cursor: pointer; min-height: var(--ipn-objetivo-tactil); padding: var(--ipn-esp-2); overflow-wrap: anywhere; }
  [data-compilacion='error'] { color: var(--ipn-error); }
  [data-compilacion='avisos'] { color: var(--ipn-aviso); }
  [data-compilacion='listo'] { color: var(--ipn-exito); }
  .popover { position: fixed; z-index: 20; inset: var(--ipn-esp-6) var(--ipn-esp-3) auto; max-height: 70dvh; overflow: auto; padding: var(--ipn-esp-3); border: 1px solid var(--ipn-linea); background: var(--ipn-superficie); color: var(--ipn-texto); box-shadow: var(--ipn-sombra); }
  h2 { font-size: var(--ipn-tamano-m); }
</style>
