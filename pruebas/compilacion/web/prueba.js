// Prueba técnica de IPN Folio: compilar un proyecto LaTeX completo con BusyTeX en el navegador
// y medir tiempos, descargas y errores. Deja el resultado en window.resultadoPrueba.

import { BusyTexRunner, PdfLatex } from '/lib/index.js';

const $ = (id) => document.getElementById(id);
const BASE = '/core/busytex';
const TEXTO = /\.(tex|sty|cls|bib|bst|cfg|clo|def|fd|ist|txt)$/i;
const IGNORAR = /(^|\/)(adicionales\/|texput\.log$)|\.(aux|log|toc|lof|lot|out|bbl|blg|idx|ind|ilg|nlo|nls|synctex\.gz)$/i;

let runner = null;
const resultado = { filas: [], errores: [] };
window.resultadoPrueba = resultado;

function bitacora(texto) {
  $('bitacora').textContent += texto + '\n';
}

function fila(nombre, valor, clase = '') {
  const tr = document.createElement('tr');
  tr.innerHTML = `<th>${nombre}</th><td class="${clase}"></td>`;
  tr.lastChild.textContent = valor;
  $('tabla').tBodies[0].append(tr);
  $('tabla').hidden = false;
  resultado.filas.push([nombre, valor]);
}

const segundos = (ms) => (ms / 1000).toFixed(1) + ' s';
const megas = (b) => (b / 1048576).toFixed(1) + ' MB';

async function leerDelServidor() {
  const lista = await (await fetch('/proyecto/lista.json')).json();
  if (!lista.length) throw new Error('No hay plantilla en /proyecto/. Copia la plantilla a plantillas-locales/TT_UPIITA_2023.');
  return Promise.all(
    lista.filter((ruta) => !IGNORAR.test(ruta) && ruta !== 'Principal.pdf').map(async (ruta) => {
      const datos = new Uint8Array(await (await fetch('/proyecto/' + encodeURI(ruta))).arrayBuffer());
      return { path: ruta, content: datos };
    }),
  );
}

async function leerDeCarpeta() {
  const archivos = [...$('carpeta').files];
  if (!archivos.length) throw new Error('Elige una carpeta con el proyecto.');
  return Promise.all(
    archivos
      .map((f) => ({ f, ruta: f.webkitRelativePath.split('/').slice(1).join('/') }))
      .filter(({ ruta }) => !IGNORAR.test(ruta))
      .map(async ({ f, ruta }) => ({ path: ruta, content: new Uint8Array(await f.arrayBuffer()) })),
  );
}

function prepararArchivos(archivos, principal) {
  const decodificador = new TextDecoder('utf-8');
  // El resolvedor de BusyTeX solo analiza el archivo principal si llega como texto.
  const preparados = archivos.map(({ path, content }) =>
    TEXTO.test(path) ? { path, content: decodificador.decode(content) } : { path, content },
  );
  if ($('minusculas').checked) {
    for (const a of archivos.filter((a) => /\.bib$/i.test(a.path) && a.path !== a.path.toLowerCase())) {
      preparados.push({ path: a.path.toLowerCase(), content: decodificador.decode(a.content) });
    }
  }
  const entrada = preparados.find((a) => a.path === principal);
  if (!entrada) throw new Error(`No encontré el archivo principal «${principal}» en el proyecto.`);
  return { input: entrada.content, additionalFiles: preparados.filter((a) => a !== entrada) };
}

function analizarBitacora(log) {
  const errores = [...log.matchAll(/^! (.+)$/gm)].map((m) => m[1]);
  const faltantes = [...log.matchAll(/(?:File|Font) [`'"]?([^'`"\s]+)'? not found/g)].map((m) => m[1]);
  return { errores, faltantes };
}

async function compilarUnaVez(etiqueta, archivos, principal) {
  const pdflatex = new PdfLatex(runner);
  const t0 = performance.now();
  const r = await pdflatex.compile({
    ...archivos,
    mainTexPath: principal,
    bibtex: true,
    makeindex: true,
    rerun: true,
    verbose: 'info',
    remoteEndpoint: $('remoto').checked ? location.origin + '/texlive' : undefined,
  });
  const ms = performance.now() - t0;
  const pasos = (r.logs ?? []).map((l) => `${l.cmd.split(' ')[0]}→${l.exit_code}`).join(', ');
  bitacora(`== ${etiqueta}: ${pasos}`);
  for (const l of r.logs ?? []) {
    bitacora(`$ ${l.cmd}\n${(l.stdout || '').slice(-2500)}`);
  }
  const textoLog = (r.logs ?? []).map((l) => l.log + '\n' + l.stdout).join('\n');
  const { errores, faltantes } = analizarBitacora(textoLog);
  fila(`${etiqueta}: tiempo`, segundos(ms));
  fila(`${etiqueta}: resultado`, r.success ? 'PDF generado' : `Falló (código ${r.exitCode})`, r.success ? 'ok' : 'mal');
  fila(`${etiqueta}: pasos`, pasos);
  if (errores.length) fila(`${etiqueta}: errores TeX`, [...new Set(errores)].slice(0, 8).join(' | '), 'mal');
  if (faltantes.length) fila(`${etiqueta}: no encontrados`, [...new Set(faltantes)].join(', '), 'mal');
  resultado[etiqueta] = { ms, success: r.success, pasos, errores, faltantes, log: r.log };
  if (r.pdf) {
    fila(`${etiqueta}: PDF`, megas(r.pdf.byteLength));
    resultado[etiqueta].bytesPdf = r.pdf.byteLength;
    await fetch('/guardar-pdf', { method: 'POST', body: r.pdf });
    $('visor').src = URL.createObjectURL(new Blob([r.pdf], { type: 'application/pdf' }));
    $('visor').hidden = false;
  }
  return r;
}

async function principal() {
  $('compilar').disabled = true;
  $('tabla').tBodies[0].replaceChildren();
  $('bitacora').textContent = '';
  try {
    fila('Aislamiento (SharedArrayBuffer)', crossOriginIsolated ? 'sí' : 'no');
    const principalTex = $('principal').value.trim();
    $('estado').textContent = 'Leyendo el proyecto…';
    const origen = document.querySelector('input[name=origen]:checked').value;
    const crudos = origen === 'servidor' ? await leerDelServidor() : await leerDeCarpeta();
    fila('Archivos del proyecto', `${crudos.length} (${megas(crudos.reduce((s, a) => s + a.content.byteLength, 0))})`);
    const archivos = prepararArchivos(crudos, principalTex);

    if (!runner) {
      $('estado').textContent = 'Preparando el compilador (primera vez: descarga grande)…';
      const t0 = performance.now();
      runner = new BusyTexRunner({
        busytexBasePath: BASE,
        engineMode: 'combined',
        verbose: true,
        // ?datos=basic limita los paquetes de datos; lo demás llega por el endpoint remoto.
        catalogDataPackages: (new URLSearchParams(location.search).get('datos') ?? 'basic,recommended,extra')
          .split(',').map((p) => `${BASE}/texlive-${p}.js`),
        onDownloadProgress: (p) => ($('estado').textContent = `Descargando paquetes de TeX… ${p.percent} %`),
      });
      await runner.initialize(true);
      fila('Preparar compilador', segundos(performance.now() - t0));
      resultado.msInicio = performance.now() - t0;
    }

    $('estado').textContent = 'Compilando…';
    await compilarUnaVez('Compilación 1', archivos, principalTex);
    if ($('repetir').checked) {
      $('estado').textContent = 'Compilando otra vez…';
      await compilarUnaVez('Compilación 2', archivos, principalTex);
    }

    if ($('remoto').checked) {
      const registro = await (await fetch('/texlive/registro.json')).json();
      const hallados = registro.filter((r) => r.ruta);
      resultado.remoto = registro;
      fila('Endpoint TeX Live', `${registro.length} peticiones, ${hallados.length} archivos, ${megas(hallados.reduce((s, r) => s + r.bytes, 0))}`);
    }
    $('estado').textContent = 'Listo.';
  } catch (e) {
    $('estado').textContent = '';
    fila('Error', e.message ?? String(e), 'mal');
    resultado.errores.push(String(e));
  } finally {
    $('compilar').disabled = false;
    resultado.terminado = true;
  }
}

$('compilar').addEventListener('click', principal);
