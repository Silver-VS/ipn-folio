// SPDX-License-Identifier: AGPL-3.0-or-later
// Pruebas de contenido (principios §9): claves usadas contra definidas, variables, plurales, voz editorial,
// textos sueltos en .svelte y enlaces internos rotos. Uso: node scripts/contenido.mjs
// `revisar(entrada)` es pura (la usan las pruebas); `reunir()` lee el repositorio.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { configurar, reiniciar, registrar, t as formatear } from '@ipn/comun/js/texto.js';
import { RAIZ, leerTextosComun, leerTextosFolio, leerVetadas, variablesDe } from './lib/textos.mjs';

const CLAVE_VALIDA = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;
const VERSION_VALIDA = /^\d{4}\.\d{2}\.\d+$/;

const sinMarcado = (s) =>
  String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{[^}]*\}/g, ' ');

function gritaTodo(texto) {
  const palabras = sinMarcado(texto).match(/[A-ZÁÉÍÓÚÜÑa-záéíóúüñ]+/g) ?? [];
  const mayus = (p) => p === p.toUpperCase();
  const letras = palabras.join('');
  if (letras.length >= 4 && mayus(letras)) return true;
  for (let i = 0; i + 1 < palabras.length; i++) {
    const a = palabras[i];
    const b = palabras[i + 1];
    if (a.length >= 4 && b.length >= 4 && mayus(a) && mayus(b)) return true;
  }
  return false;
}

function pluralValido(clave, plantilla, vars) {
  let nivel = 0;
  for (const c of plantilla) {
    if (c === '{') nivel++;
    else if (c === '}' && --nivel < 0) break;
  }
  if (nivel !== 0) return false;
  if (!/plural\s*,/.test(plantilla)) return true;
  reiniciar();
  registrar('es', { [clave]: plantilla });
  configurar({ avisar: () => {} });
  const valores = Object.fromEntries(vars.map((v) => [v, 2]));
  for (const n of [0, 1, 2, 21]) {
    const salida = formatear(clave, { ...valores, n });
    if (/[{}]|plural|other\s/.test(salida)) return false;
  }
  return true;
}

/**
 * entrada: {
 *   folio: { version, textos }, comun: { textos }, vetadas: string[], cambios: string,
 *   usos: [{ clave, archivo, variables: string[] | null }], dinamicos: [{ archivo }],
 *   svelte: [{ archivo, contenido }], enlaces: [{ origen, href }], existeId(id), existeRuta(ruta)
 * }
 * Devuelve { errores: string[], avisos: string[] }.
 */
export function revisar(e) {
  const errores = [];
  const avisos = [];
  const enlaces = [...e.enlaces];
  const definidas = { ...e.comun.textos, ...e.folio.textos };

  if (!VERSION_VALIDA.test(e.folio.version))
    errores.push(`es.toml: version «${e.folio.version}» no tiene el formato AAAA.MM.n`);
  else if (e.cambios !== undefined && !e.cambios.includes(`## ${e.folio.version}`))
    errores.push(
      `contenido/CAMBIOS.md: falta la sección «## ${e.folio.version}» (sube version y anota el cambio)`,
    );

  for (const [clave, texto] of Object.entries(e.folio.textos)) {
    if (!CLAVE_VALIDA.test(clave))
      errores.push(`es.toml: clave «${clave}» mal formada (pantalla.bloque.elemento, solo a-z0-9_)`);
    if (typeof texto !== 'string' || texto.trim() === '') {
      errores.push(`es.toml: «${clave}» está vacía o no es texto`);
      continue;
    }
    const vars = variablesDe(texto);
    if (!pluralValido(clave, texto, vars))
      errores.push(`es.toml: «${clave}» tiene llaves o plural mal formado`);
    for (const palabra of e.vetadas) {
      if (texto.toLowerCase().includes(palabra.toLowerCase()))
        errores.push(
          `es.toml: «${clave}» usa la palabra vetada «${palabra}» (ver ipn-comun/contenido/VOZ.md)`,
        );
    }
    if (gritaTodo(texto)) errores.push(`es.toml: «${clave}» está en MAYÚSCULAS`);
    for (const m of texto.matchAll(/<a\s[^>]*href\s*=\s*"([^"]*)"/gi))
      enlaces.push({ origen: `es.toml «${clave}»`, href: m[1] });
  }

  for (const { archivo } of e.dinamicos)
    errores.push(
      `${archivo}: clave de texto no literal; usa t('clave') con la cadena escrita para poder verificarla`,
    );

  const usadas = new Set();
  for (const uso of e.usos) {
    usadas.add(uso.clave);
    const plantilla = definidas[uso.clave];
    if (plantilla === undefined) {
      errores.push(`${uso.archivo}: la clave «${uso.clave}» no existe en es.toml ni en ipn-comun`);
      continue;
    }
    if (uso.variables === null) continue;
    const esperadas = variablesDe(plantilla);
    for (const v of esperadas)
      if (!uso.variables.includes(v))
        errores.push(`${uso.archivo}: a «${uso.clave}» le falta la variable {${v}}`);
    for (const v of uso.variables)
      if (!esperadas.includes(v))
        errores.push(`${uso.archivo}: «${uso.clave}» no usa la variable {${v}} que se le pasa`);
  }
  for (const clave of Object.keys(e.folio.textos))
    if (!usadas.has(clave)) avisos.push(`es.toml: la clave «${clave}» no se usa todavía`);

  for (const { archivo, contenido } of e.svelte) {
    const marcado = contenido
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    const texto = marcado.replace(/<[^>]*>/g, ' ').replace(/\{[^}]*\}/g, ' ');
    if (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,}/.test(texto))
      errores.push(`${archivo}: hay texto escrito en la plantilla; muévelo a es.toml y pídelo con t()`);
    for (const m of marcado.matchAll(/\s(aria-label|title|alt|placeholder)="([^"{]+)"/g))
      errores.push(`${archivo}: ${m[1]}="${m[2]}" es texto visible en el código; usa t()`);
  }

  for (const { origen, href } of enlaces) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue; // externos: no bloquean
    if (href.startsWith('#')) {
      if (href.length > 1 && !e.existeId(href.slice(1)))
        errores.push(`${origen}: el enlace interno «${href}» no apunta a ningún id`);
    } else if (!e.existeRuta(href.split(/[?#]/)[0]))
      errores.push(`${origen}: el enlace «${href}» no apunta a un archivo existente`);
  }

  for (const { archivo, contenido } of e.estilos ?? []) {
    if (/--(bg|sf|sf2|ac|acs|acx|tx|mu|ln|wa|was|er|ers|in|ins|oks)(?![\w-])/.test(contenido))
      errores.push(archivo + ': usa los tokens --ipn-*, no los nombres antiguos (--bg, --sf, --ac…)');
    if (/#[0-9a-fA-F]{3,8}(?![\w-])/.test(contenido))
      errores.push(archivo + ': color fijo en el CSS; usa un token --ipn-* (principios 3.8)');
  }

  return { errores, avisos };
}

function listar(dir, filtro, acumulado = []) {
  if (!existsSync(dir)) return acumulado;
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) listar(ruta, filtro, acumulado);
    else if (filtro(ruta)) acumulado.push(ruta);
  }
  return acumulado;
}

const LLAMADA = /(?<![\w.$])t\(\s*(?:(['"`])([^'"`]+)\1\s*(?:,\s*\{([^}]*)\})?|(?![\s)]))/g;

export function reunir(raiz = RAIZ) {
  const rel = (r) => relative(raiz, r).replaceAll('\\', '/');
  const codigo = listar(
    join(raiz, 'src'),
    (r) =>
      /\.(ts|svelte)$/.test(r) &&
      !/\.(gen|test)\.ts$/.test(r) &&
      !r.replaceAll('\\', '/').endsWith('textos/t.ts') &&
      !r.endsWith('.d.ts'),
  );
  const usos = [];
  const dinamicos = [];
  const svelte = [];
  const ids = new Set();
  const enlaces = [];
  const estilos = [];
  const recogerIds = (s) => [...s.matchAll(/\sid="([^"{]+)"/g)].forEach((m) => ids.add(m[1]));

  for (const ruta of codigo) {
    const contenido = readFileSync(ruta, 'utf8');
    for (const m of contenido.matchAll(LLAMADA)) {
      if (!m[2]) dinamicos.push({ archivo: rel(ruta) });
      else
        usos.push({
          clave: m[2],
          archivo: rel(ruta),
          variables:
            m[3] === undefined
              ? []
              : m[3]
                  .split(',')
                  .map((p) => (p.split(':')[0] ?? '').trim())
                  .filter(Boolean),
        });
    }
    if (ruta.endsWith('.svelte')) {
      const bloquesEstilo = [...contenido.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
      estilos.push({ archivo: rel(ruta), contenido: bloquesEstilo.join('\n') });
      svelte.push({ archivo: rel(ruta), contenido });
      recogerIds(contenido);
    }
  }
  for (const ruta of listar(join(raiz, 'src'), (r) => r.endsWith('.css')))
    estilos.push({ archivo: rel(ruta), contenido: readFileSync(ruta, 'utf8') });
  const html = existsSync(join(raiz, 'index.html')) ? readFileSync(join(raiz, 'index.html'), 'utf8') : '';
  for (const m of html.matchAll(/\[\[t:([^\]\s]+)\]\]/g))
    usos.push({ clave: m[1], archivo: 'index.html', variables: null });
  recogerIds(html);
  for (const m of html.matchAll(/\shref="([^"]*)"/g)) enlaces.push({ origen: 'index.html', href: m[1] });

  return {
    folio: leerTextosFolio(),
    comun: leerTextosComun(),
    vetadas: leerVetadas(),
    cambios: existsSync(join(raiz, 'contenido', 'CAMBIOS.md'))
      ? readFileSync(join(raiz, 'contenido', 'CAMBIOS.md'), 'utf8')
      : '',
    usos,
    dinamicos,
    svelte,
    estilos,
    enlaces,
    existeId: (id) => ids.has(id),
    existeRuta: (r) => [raiz, join(raiz, 'public')].some((base) => existsSync(join(base, r))),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errores, avisos } = revisar(reunir());
  for (const a of avisos) console.warn(`aviso: ${a}`);
  for (const e of errores) console.error(`error: ${e}`);
  console.log(`contenido: ${errores.length} errores, ${avisos.length} avisos`);
  process.exit(errores.length ? 1 : 0);
}
