<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '../../textos/t';

  // Diálogo de confirmación propio y accesible (no `window.confirm`): <dialog> modal, foco inicial en «Cancelar»,
  // Esc cierra y el foco vuelve al botón que lo abrió (o a `respaldoFoco` si ese botón ya no existe).
  let {
    mensaje,
    etiquetaAccion,
    alConfirmar,
    alCancelar,
    abridor: abridorExplicito,
    respaldoFoco,
  }: {
    /** Control que abrió el diálogo (si no se da, el que tenía el foco al montarse). */
    abridor?: HTMLElement;
    /** Texto de la pregunta (ya formateado y en texto plano). */
    mensaje: string;
    /** Texto del botón que confirma. */
    etiquetaAccion: string;
    alConfirmar: () => void | Promise<void>;
    alCancelar: () => void;
    /** A dónde va el foco si el botón que abrió el diálogo desapareció (p. ej. el elemento ya se borró). */
    respaldoFoco?: () => HTMLElement | null | undefined;
  } = $props();

  let dialogo = $state<HTMLDialogElement>();
  let cancelar = $state<HTMLButtonElement>();
  let ocupado = $state(false);
  // Algunos navegadores cierran el <dialog> con Esc sin avisar antes (sin evento `cancel`): `close` también cancela.
  let resuelto = false;
  const abridorEnfocado =
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null);

  $effect(() => {
    if (!dialogo || dialogo.open) return;
    dialogo.showModal();
    cancelar?.focus();
  });

  /**
   * El foco vuelve a quien abrió el diálogo, o a `respaldoFoco` si ese control ya no existe. Se leen las propiedades
   * ANTES de que el padre desmonte el diálogo (después ya no se pueden leer).
   */
  function foco(): () => Promise<void> {
    const abridor = abridorExplicito ?? abridorEnfocado;
    const respaldo = respaldoFoco;
    return async () => {
      await tick();
      const destino = abridor && abridor.isConnected && abridor !== document.body ? abridor : respaldo?.();
      destino?.focus();
    };
  }

  function cancelarDialogo() {
    if (resuelto) return;
    resuelto = true;
    const devolver = foco();
    dialogo?.close();
    alCancelar();
    void devolver();
  }

  async function confirmar() {
    if (resuelto) return;
    resuelto = true;
    const devolver = foco();
    ocupado = true;
    try {
      await alConfirmar();
    } finally {
      ocupado = false;
      dialogo?.close();
      void devolver();
    }
  }
</script>

<dialog
  bind:this={dialogo}
  class="dialogo"
  aria-labelledby="confirmar-mensaje"
  oncancel={(e) => {
    e.preventDefault();
    cancelarDialogo();
  }}
  onclose={cancelarDialogo}
>
  <p id="confirmar-mensaje" class="mensaje">{mensaje}</p>
  <div class="botones">
    <button type="button" class="boton" bind:this={cancelar} onclick={cancelarDialogo}
      >{t('papelera.cancelar.boton')}</button
    >
    <button type="button" class="boton peligro" disabled={ocupado} onclick={() => void confirmar()}
      >{etiquetaAccion}</button
    >
  </div>
</dialog>

<style>
  .dialogo {
    max-width: min(28rem, calc(100vw - 2 * var(--ipn-esp-4)));
    padding: var(--ipn-esp-4);
    border: 1px solid var(--ipn-linea);
    border-radius: var(--ipn-radio);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
  }

  .dialogo::backdrop {
    background: color-mix(in srgb, var(--ipn-texto) 50%, transparent);
  }

  .mensaje {
    margin: 0 0 var(--ipn-esp-4);
  }

  .botones {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--ipn-esp-2);
  }

  .boton {
    min-height: var(--ipn-objetivo-tactil);
    padding: 0 var(--ipn-esp-4);
    border: 1px solid var(--ipn-borde-control);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    font: inherit;
    cursor: pointer;
  }

  .boton.peligro {
    border-color: var(--ipn-error);
    background: var(--ipn-error-suave);
    color: var(--ipn-error);
    font-weight: 700;
  }

  .boton:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .boton:focus-visible {
    outline: 0.1875rem solid var(--ipn-acento);
    outline-offset: 0.125rem;
  }
</style>
