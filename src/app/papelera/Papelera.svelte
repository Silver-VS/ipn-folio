<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { acerca } from '../../acerca';
  import { espacio, textoDeError, type ElementoPapelera } from '../../almacen';
  import { caducadosCon, ocupaMucho, tamanoTotal } from '../../almacen/papelera';
  import { plano } from '../../textos/plano';
  import { t } from '../../textos/t';
  import { hashDeProyecto } from '../ruta';
  import { servicios, type Servicios } from '../servicios';
  import Confirmar from './Confirmar.svelte';
  import { cuandoSeBorrara, fechaCorta, fechaIso, megas, tamanoLegible } from './formato';
  import { guardarDias, leerDias } from './purga';
  import { nombreDe, textoRestaurado } from './restauracion';

  const config = acerca.papelera;

  interface Aviso {
    id: number;
    texto: string;
    abrir?: { href: string; etiqueta: string };
  }
  interface Pregunta {
    /** Control que abrió el diálogo: ahí vuelve el foco (Safari no enfoca los botones al hacer clic). */
    abridor?: HTMLElement;
    mensaje: string;
    etiqueta: string;
    ejecutar: () => Promise<void>;
    alCancelar?: () => void;
  }

  let s = $state.raw<Servicios>();
  let elementos = $state.raw<ElementoPapelera[]>([]);
  let dias = $state(config.diasPorOmision);
  let usoNavegador = $state<number | undefined>();
  let cargando = $state(true);
  let error = $state('');
  let avisos = $state.raw<Aviso[]>([]);
  let pregunta = $state.raw<Pregunta | undefined>();
  let titulo = $state<HTMLElement>();
  let contador = 0;
  let recargaPendiente = false;

  const bytes = $derived(tamanoTotal(elementos));
  const grande = $derived(ocupaMucho(bytes, usoNavegador, config.avisoMegas, config.avisoFraccionUso));
  const hora = () => s?.reloj.horaConfiable() ?? Date.now();

  async function recargar() {
    if (!s) return;
    try {
      const [lista, d, uso] = await Promise.all([
        s.almacen.listarPapelera(),
        leerDias(s.almacen, config),
        espacio(),
      ]);
      elementos = lista;
      dias = d;
      usoNavegador = uso?.usado;
      error = '';
    } catch (e) {
      error = plano(textoDeError(e));
    } finally {
      cargando = false;
    }
  }

  /** Varios avisos seguidos (p. ej. un borrado que emite un evento por archivo) piden una sola recarga. */
  function pedirRecarga() {
    if (recargaPendiente) return;
    recargaPendiente = true;
    queueMicrotask(() => {
      recargaPendiente = false;
      void recargar();
    });
  }

  onMount(() => {
    let vivo = true;
    const quitar: Array<() => void> = [];
    void servicios()
      .then(async (x) => {
        if (!vivo) return;
        s = x;
        quitar.push(
          // Otra pestaña manda algo a la papelera, lo restaura o lo borra: esta vista se actualiza.
          x.avisos.escuchar((a) => {
            if (a.tipo !== 'cambio-archivo') pedirRecarga();
          }),
          x.almacen.al('cambio-papelera', pedirRecarga),
        );
        await recargar();
      })
      .catch((e: unknown) => {
        error = plano(textoDeError(e));
        cargando = false;
      });
    return () => {
      vivo = false;
      quitar.forEach((q) => q());
    };
  });

  function avisar(texto: string, abrir?: Aviso['abrir']) {
    avisos = [...avisos, { id: ++contador, texto, abrir }];
  }

  function quitarAviso(id: number) {
    avisos = avisos.filter((a) => a.id !== id);
  }

  async function restaurar(e: ElementoPapelera) {
    if (!s) return;
    try {
      const r = await s.auto.restaurarDePapelera(e.id);
      avisar(textoRestaurado(e, r), {
        href: hashDeProyecto(r.proyectoId),
        etiqueta: t('papelera.abrir_proyecto'),
      });
      await recargar();
    } catch (err) {
      error = plano(textoDeError(err));
      await recargar();
    }
  }

  function preguntarBorrarDefinitivo(e: ElementoPapelera, abridor: HTMLElement) {
    pregunta = {
      abridor,
      mensaje: plano(t('papelera.borrar_definitivo.confirmar', { nombre: nombreDe(e) })),
      etiqueta: t('papelera.borrar_definitivo.boton'),
      ejecutar: async () => {
        await s?.auto.borrarDefinitivo(e.id);
        await recargar();
      },
    };
  }

  function preguntarVaciar(abridor: HTMLElement) {
    pregunta = {
      abridor,
      mensaje: plano(t('papelera.vaciar.confirmar', { n: elementos.length })),
      etiqueta: t('papelera.vaciar.boton'),
      ejecutar: async () => {
        await s?.auto.vaciarPapelera();
        await recargar();
      },
    };
  }

  async function aplicarDias(nuevo: number, purgar: boolean) {
    if (!s) return;
    await guardarDias(s.almacen, nuevo);
    dias = nuevo;
    if (purgar) await s.auto.purgarCaducados(nuevo);
    await recargar();
  }

  function cambiarDias(evento: Event) {
    const select = evento.currentTarget as HTMLSelectElement;
    const nuevo = Number(select.value);
    const ahora = s?.reloj.horaConfiable();
    // Pasar a menos días borra de inmediato lo que ya los superó: antes se dice cuánto y se pide confirmación.
    const caducos =
      ahora === undefined || nuevo >= dias ? [] : caducadosCon(elementos, nuevo, config.margenDias, ahora);
    if (caducos.length === 0) {
      void aplicarDias(nuevo, false).catch((e: unknown) => (error = plano(textoDeError(e))));
      return;
    }
    pregunta = {
      abridor: select,
      mensaje: plano(t('papelera.caducidad.confirmar_menos', { dias: nuevo, n: caducos.length })),
      etiqueta: t('papelera.caducidad.confirmar_boton'),
      ejecutar: () => aplicarDias(nuevo, true),
      alCancelar: () => {
        select.value = String(dias);
      },
    };
  }

  async function confirmarPregunta() {
    const actual = pregunta;
    pregunta = undefined;
    try {
      await actual?.ejecutar();
    } catch (e) {
      error = plano(textoDeError(e));
    }
  }

  function cancelarPregunta() {
    pregunta?.alCancelar?.();
    pregunta = undefined;
  }

  function etiquetaClase(e: ElementoPapelera): string {
    switch (e.clase) {
      case 'proyecto':
        return t('papelera.clase.proyecto');
      case 'carpeta':
        return t('papelera.clase.carpeta');
      case 'archivo':
        return t('papelera.clase.archivo');
    }
  }
</script>

<section class="papelera" aria-labelledby="titulo-papelera">
  <a class="volver" href="#/">{t('proyecto.volver')}</a>
  <h2 id="titulo-papelera" tabindex="-1" bind:this={titulo}>{t('papelera.titulo')}</h2>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if avisos.length > 0}
    <div class="avisos" role="status">
      {#each avisos as aviso (aviso.id)}
        <div class="aviso">
          <p class="texto">{aviso.texto}</p>
          {#if aviso.abrir}
            <a class="boton" href={aviso.abrir.href}>{aviso.abrir.etiqueta}</a>
          {/if}
          <button
            type="button"
            class="cerrar"
            aria-label={t('aviso.cerrar.boton')}
            onclick={() => quitarAviso(aviso.id)}>&times;</button
          >
        </div>
      {/each}
    </div>
  {/if}

  <div class="encabezado">
    <p class="ocupa">{t('papelera.ocupa', { megas: megas(bytes) })}</p>
    <div class="campo">
      <label for="caducidad-papelera">{t('papelera.caducidad.etiqueta')}</label>
      <select
        id="caducidad-papelera"
        class="control"
        value={String(dias)}
        onchange={cambiarDias}
        disabled={!s}
      >
        {#each config.opcionesDias as opcion (opcion)}
          <option value={String(opcion)}>{t('papelera.caducidad.opcion', { dias: opcion })}</option>
        {/each}
      </select>
    </div>
    <button
      type="button"
      class="boton peligro"
      disabled={elementos.length === 0}
      onclick={(ev) => preguntarVaciar(ev.currentTarget)}>{t('papelera.vaciar.boton')}</button
    >
  </div>

  {#if grande}
    <p class="aviso-tamano" role="status">{t('papelera.aviso_tamano', { megas: megas(bytes) })}</p>
  {/if}

  {#if cargando}
    <p class="tenue" role="status">{t('papelera.cargando')}</p>
  {:else if elementos.length === 0}
    <p class="tenue">{t('papelera.vacia', { dias })}</p>
  {:else}
    <ul class="lista" aria-label={t('papelera.lista_aria')}>
      {#each elementos as e (e.id)}
        {@const nombre = nombreDe(e)}
        <li class="elemento">
          <svg class="icono" viewBox="0 0 16 16" aria-hidden="true">
            {#if e.clase === 'proyecto'}
              <path d="M2 3.5h12v9H2z M2 6.5h12" fill="none" stroke="currentColor" />
            {:else if e.clase === 'carpeta'}
              <path
                d="M1.5 3.5h4.2l1.4 1.5h7.4v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"
                fill="none"
                stroke="currentColor"
              />
            {:else}
              <path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3" fill="none" stroke="currentColor" />
            {/if}
          </svg>
          <div class="datos">
            <h3 class="nombre">{nombre}</h3>
            <p class="detalle">
              <span class="clase">{etiquetaClase(e)}</span>
              {#if e.clase !== 'proyecto'}
                <span>{plano(t('papelera.de_proyecto', { proyecto: e.nombreProyecto }))}</span>
              {/if}
              <span>{tamanoLegible(e.tamano)}</span>
              {#if e.incluye}
                <span>{t('papelera.incluye_borrados', { n: e.incluye })}</span>
              {/if}
            </p>
            <p class="detalle">
              <time datetime={fechaIso(e.fecha)}
                >{plano(t('papelera.se_borro', { fecha: fechaCorta(e.fecha) }))}</time
              >
              <span>{plano(t('papelera.se_borrara', { cuando: cuandoSeBorrara(e, dias, hora()) }))}</span>
            </p>
          </div>
          <div class="acciones">
            <button
              type="button"
              class="boton"
              aria-label={plano(t('papelera.restaurar.aria', { nombre }))}
              onclick={() => void restaurar(e)}>{t('papelera.restaurar.boton')}</button
            >
            <button
              type="button"
              class="boton peligro"
              aria-label={plano(t('papelera.borrar_definitivo.aria', { nombre }))}
              onclick={(ev) => preguntarBorrarDefinitivo(e, ev.currentTarget)}
              >{t('papelera.borrar_definitivo.boton')}</button
            >
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if pregunta}
  <Confirmar
    mensaje={pregunta.mensaje}
    etiquetaAccion={pregunta.etiqueta}
    alConfirmar={confirmarPregunta}
    alCancelar={cancelarPregunta}
    abridor={pregunta.abridor}
    respaldoFoco={() => titulo}
  />
{/if}

<style>
  .papelera {
    padding: var(--ipn-esp-4);
    max-width: 56rem;
  }

  .volver {
    display: inline-flex;
    align-items: center;
    min-height: var(--ipn-objetivo-tactil);
    color: var(--ipn-acento);
  }

  h2 {
    margin: var(--ipn-esp-2) 0 var(--ipn-esp-4);
    font-size: var(--ipn-tamano-l);
  }

  h2:focus-visible {
    outline: 0.1875rem solid var(--ipn-acento);
    outline-offset: 0.125rem;
  }

  .tenue {
    color: var(--ipn-tenue);
  }

  .error {
    padding: var(--ipn-esp-2) var(--ipn-esp-3);
    background: var(--ipn-error-suave);
    color: var(--ipn-error);
    border-radius: var(--ipn-radio-s);
  }

  .encabezado {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: var(--ipn-esp-3) var(--ipn-esp-5);
    margin-bottom: var(--ipn-esp-4);
  }

  .ocupa {
    margin: 0;
    color: var(--ipn-tenue);
  }

  .campo {
    display: grid;
    gap: var(--ipn-esp-1);
  }

  .control {
    min-height: var(--ipn-objetivo-tactil);
    padding: 0 var(--ipn-esp-2);
    border: 1px solid var(--ipn-borde-control);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    font: inherit;
  }

  .aviso-tamano {
    padding: var(--ipn-esp-2) var(--ipn-esp-3);
    border: 1px solid var(--ipn-aviso);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-aviso-suave);
  }

  .avisos {
    display: grid;
    gap: var(--ipn-esp-2);
    margin-bottom: var(--ipn-esp-4);
  }

  .aviso {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ipn-esp-2);
    padding: var(--ipn-esp-1) var(--ipn-esp-1) var(--ipn-esp-1) var(--ipn-esp-3);
    border: 1px solid var(--ipn-info);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-info-suave);
  }

  .aviso .texto {
    flex: 1 1 12rem;
    margin: 0;
  }

  .lista {
    display: grid;
    gap: var(--ipn-esp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .elemento {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--ipn-esp-3);
    padding: var(--ipn-esp-3);
    border: 1px solid var(--ipn-linea);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
  }

  .icono {
    flex: none;
    width: 1.25rem;
    height: 1.25rem;
    margin-top: var(--ipn-esp-1);
    color: var(--ipn-tenue);
  }

  .datos {
    flex: 1 1 14rem;
    min-width: 0;
  }

  .nombre {
    margin: 0;
    font-size: var(--ipn-tamano-m);
    overflow-wrap: anywhere;
  }

  .detalle {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ipn-esp-1) var(--ipn-esp-3);
    margin: var(--ipn-esp-1) 0 0;
    color: var(--ipn-tenue);
    font-size: var(--ipn-tamano-s);
  }

  .clase {
    font-weight: 700;
  }

  .acciones {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ipn-esp-2);
  }

  .boton,
  .cerrar {
    display: inline-flex;
    align-items: center;
    min-height: var(--ipn-objetivo-tactil);
    min-width: var(--ipn-objetivo-tactil);
    padding: 0 var(--ipn-esp-3);
    border: 1px solid var(--ipn-borde-control);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    font: inherit;
    text-decoration: none;
    cursor: pointer;
  }

  .boton:hover:not(:disabled) {
    background: var(--ipn-acento-suave);
  }

  .boton.peligro {
    border-color: var(--ipn-error);
    color: var(--ipn-error);
  }

  .boton:disabled {
    color: var(--ipn-tenue);
    border-color: var(--ipn-linea);
    cursor: default;
  }

  .cerrar {
    justify-content: center;
    border-color: transparent;
    background: none;
    font-size: var(--ipn-tamano-l);
    line-height: 1;
  }

  .boton:focus-visible,
  .cerrar:focus-visible,
  .control:focus-visible,
  .volver:focus-visible {
    outline: 0.1875rem solid var(--ipn-acento);
    outline-offset: 0.125rem;
  }
</style>
