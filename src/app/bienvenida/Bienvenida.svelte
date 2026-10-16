<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  // Primer uso: unidad académica, rol (D16: solo se guarda el rol) y herramientas con su tamaño (D11).
  // «Descargar después» no descarga nada; «Descargar ahora» respeta la regla de red (D15).
  import type { Almacen } from '../../almacen';
  import { CATALOGO, megasDeHerramienta, textosDe } from '../../herramientas/catalogo';
  import type { TiendaHerramientas } from '../../herramientas/tienda.svelte';
  import { t } from '../../textos/t';
  import { UNIDADES, UNIDAD_OTRA, guardarBienvenida } from './preferencias';

  let {
    almacen,
    tienda,
    alTerminar,
  }: { almacen: Almacen; tienda: TiendaHerramientas; alTerminar: () => void } = $props();

  let unidad = $state('');
  let docente = $state(false);
  let guardando = $state(false);
  const instalables = CATALOGO.filter((h) => h.disponibilidad === 'instalable');
  const proximas = CATALOGO.filter((h) => h.disponibilidad === 'proximamente');
  const escritorio = CATALOGO.filter((h) => h.disponibilidad === 'escritorio');
  // En la capa A solo LaTeX es instalable, y viene elegido; las demás no descargan nada.
  let elegidas = $state<Record<string, boolean>>({ latex: true });
  const megasElegidos = $derived(
    instalables.filter((h) => elegidas[h.id]).reduce((s, h) => s + megasDeHerramienta(h.id), 0),
  );

  async function terminar(descargarAhora: boolean) {
    guardando = true;
    await guardarBienvenida(almacen, {
      unidad: unidad || UNIDAD_OTRA,
      rol: docente ? 'docente' : 'estudiante',
    });
    alTerminar();
    if (descargarAhora && elegidas['latex']) void tienda.solicitar();
  }
</script>

<section class="bienvenida" aria-labelledby="titulo-bienvenida">
  <h2 id="titulo-bienvenida">{t('bienvenida.titulo')}</h2>
  <p class="intro">{t('bienvenida.intro')}</p>

  <div class="campo">
    <h3>{t('bienvenida.unidad.titulo')}</h3>
    <p class="ayuda">{t('bienvenida.unidad.ayuda')}</p>
    <label class="etiqueta" for="unidad">{t('bienvenida.unidad.etiqueta')}</label>
    <select id="unidad" bind:value={unidad}>
      <option value="">{t('bienvenida.unidad.sin_elegir')}</option>
      {#each UNIDADES as u (u.id)}
        <option value={u.id}>{u.siglas}</option>
      {/each}
      <option value={UNIDAD_OTRA}>{t('bienvenida.unidad.otra')}</option>
    </select>
  </div>

  <div class="campo">
    <h3>{t('herramientas.en_navegador')}</h3>
    <p class="ayuda">{t('herramientas.en_navegador_ayuda')}</p>
    <ul class="lista">
      {#each instalables as h (h.id)}
        {@const textos = textosDe(h.id)}
        <li>
          <label class="herramienta">
            <input type="checkbox" bind:checked={elegidas[h.id]} />
            <span class="sigla" aria-hidden="true">{textos.sigla}</span>
            <span class="datos">
              <strong>{textos.nombre}</strong>
              <span class="ayuda">{textos.descripcion}</span>
            </span>
            <span class="tamano">{t('herramientas.tamano', { megas: megasDeHerramienta(h.id) })}</span>
          </label>
        </li>
      {/each}
      {#each proximas as h (h.id)}
        {@const textos = textosDe(h.id)}
        <li>
          <div class="herramienta apagada">
            <input
              type="checkbox"
              disabled
              aria-label={t('herramientas.seleccionar', { nombre: textos.nombre })}
            />
            <span class="sigla" aria-hidden="true">{textos.sigla}</span>
            <span class="datos">
              <strong>{textos.nombre}</strong>
              <span class="ayuda">{textos.descripcion}</span>
            </span>
            <span class="tamano">{t('herramientas.proximamente')}</span>
          </div>
        </li>
      {/each}
    </ul>
  </div>

  <div class="campo">
    <h3>{t('herramientas.solo_escritorio')}</h3>
    <p class="ayuda">{t('bienvenida.escritorio.ayuda')}</p>
    <ul class="lista">
      {#each escritorio as h (h.id)}
        {@const textos = textosDe(h.id)}
        <li>
          <div class="herramienta apagada">
            <span class="sigla" aria-hidden="true">{textos.sigla}</span>
            <span class="datos">
              <strong>{textos.nombre}</strong>
              <span class="ayuda">{textos.descripcion}</span>
            </span>
            <span class="tamano">{t('herramientas.app_escritorio')}</span>
          </div>
        </li>
      {/each}
    </ul>
  </div>

  <label class="docente">
    <input type="checkbox" bind:checked={docente} />
    <span class="datos">
      <strong>{t('bienvenida.docente.etiqueta')}</strong>
      <span class="ayuda">{t('bienvenida.docente.ayuda')}</span>
    </span>
  </label>

  <!-- Lugar para «Conectar con Microsoft» (sesión 10). -->
  <div data-montaje="cuenta-microsoft"></div>

  <div class="total">
    <h3>{t('bienvenida.total.titulo')}</h3>
    <p class="cantidad" data-total>
      {megasElegidos > 0
        ? t('bienvenida.total.cantidad', { megas: megasElegidos })
        : t('bienvenida.total.ninguno')}
    </p>
    <p class="ayuda">{t('bienvenida.nota_datos')}</p>
    <p class="ayuda">{t('bienvenida.despues_ajustes')}</p>
  </div>

  <div class="acciones">
    <button
      type="button"
      class="boton boton-primario"
      disabled={guardando}
      onclick={() => void terminar(true)}
      >{megasElegidos > 0 ? t('bienvenida.descargar_ahora') : t('bienvenida.empezar')}</button
    >
    {#if megasElegidos > 0}
      <button type="button" class="boton" disabled={guardando} onclick={() => void terminar(false)}
        >{t('bienvenida.descargar_despues')}</button
      >
    {/if}
  </div>
</section>

<style>
  .bienvenida {
    display: grid;
    gap: var(--ipn-esp-5);
    max-width: 44rem;
    padding: var(--ipn-esp-4);
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: var(--ipn-tamano-xl);
  }

  h3 {
    font-size: var(--ipn-tamano-m);
  }

  .ayuda {
    color: var(--ipn-tenue);
    font-size: var(--ipn-tamano-s);
  }

  .campo {
    display: grid;
    gap: var(--ipn-esp-2);
  }

  .etiqueta {
    font-weight: 600;
  }

  select {
    min-height: var(--ipn-objetivo-tactil);
    max-width: 100%;
    padding: 0 var(--ipn-esp-3);
    border: 1px solid var(--ipn-borde-control);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-superficie);
    color: var(--ipn-texto);
    font: inherit;
  }

  .lista {
    display: grid;
    gap: var(--ipn-esp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .herramienta,
  .docente {
    display: flex;
    align-items: center;
    gap: var(--ipn-esp-3);
    min-height: var(--ipn-objetivo-tactil);
    padding: var(--ipn-esp-3);
    border: 1px solid var(--ipn-linea);
    border-radius: var(--ipn-radio);
    background: var(--ipn-superficie);
  }

  .apagada {
    border-style: dashed;
    background: var(--ipn-hundido);
  }

  input[type='checkbox'] {
    flex: none;
    width: var(--ipn-esp-5);
    height: var(--ipn-esp-5);
    accent-color: var(--ipn-acento);
  }

  .sigla {
    display: grid;
    place-items: center;
    flex: none;
    width: var(--ipn-objetivo-tactil);
    height: var(--ipn-objetivo-tactil);
    border-radius: var(--ipn-radio-s);
    background: var(--ipn-acento-suave);
    color: var(--ipn-acento);
    font-weight: 700;
    font-size: var(--ipn-tamano-s);
  }

  .datos {
    display: grid;
    flex: 1;
    gap: var(--ipn-esp-1);
    min-width: 0;
  }

  .tamano {
    flex: none;
    color: var(--ipn-tenue);
    font-size: var(--ipn-tamano-s);
  }

  .total {
    display: grid;
    gap: var(--ipn-esp-2);
    padding: var(--ipn-esp-4);
    border-radius: var(--ipn-radio);
    background: var(--ipn-acento-suave);
  }

  .cantidad {
    font-size: var(--ipn-tamano-l);
    font-weight: 700;
  }

  .acciones {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ipn-esp-3);
  }

  @media (max-width: 30rem) {
    .herramienta {
      flex-wrap: wrap;
    }
  }
</style>
