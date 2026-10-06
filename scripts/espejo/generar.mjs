// SPDX-License-Identifier: AGPL-3.0-or-later
// Genera el espejo estático de TeX Live (D8) a partir de un TeX Live nativo, en solo lectura.
// Uso: node scripts/espejo/generar.mjs [--salida espejo-local] [--texlive C:/texlive/2026] [--max-mb 600]
// Sin dependencias de npm. El espejo generado no se sube al repositorio (está en .gitignore).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NOMBRES_KPSE, formatoDeRuta, variantesDeNombre } from './formatos.mjs';
import { analizarTlpdb, archivosDeLicencia, esLibre, licenciaEfectiva, resolver } from './tlpdb.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');

/** @param {string[]} argv */
function leerArgs(argv) {
  /** @type {Record<string, string>} */
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a.startsWith('--')) o[a.slice(2)] = argv[++i] ?? '';
  }
  return o;
}

const norm = (/** @type {string} */ p) => p.replace(/\\/g, '/').toLowerCase();

/** Ruta que kpathsea resolvería para un archivo (o null). Solo se usa para desempatar nombres repetidos. */
function kpsewhich(texlive, formato, nombre) {
  const bin = join(texlive, 'bin', 'windows');
  const exe = existsSync(join(bin, 'kpsewhich.exe')) ? join(bin, 'kpsewhich.exe') : 'kpsewhich';
  // pdfLaTeX es el único motor de la capa A (D23): sin -progname la ruta TEXINPUTS recorre también ConTeXt y LuaTeX.
  const r = spawnSync(
    exe,
    ['-progname=pdflatex', '-engine=pdftex', `-format=${NOMBRES_KPSE[formato]}`, nombre],
    { encoding: 'utf8' },
  );
  const salida = (r.stdout ?? '').trim().split(/\r?\n/)[0];
  return salida ? norm(salida) : null;
}

/** Bytes a MB con un decimal. */
const mb = (/** @type {number} */ b) => (b / 1048576).toFixed(1);

export function generar(opciones) {
  const { texlive, salida, config, maxMB } = opciones;
  const tlpdb = join(texlive, 'tlpkg', 'texlive.tlpdb');
  const db = analizarTlpdb(readFileSync(tlpdb, 'utf8'));
  const { paquetes, ausentes } = resolver(
    db,
    [...config.colecciones, ...config.paquetes],
    config.excluirPaquetes,
  );
  if (ausentes.length) console.warn(`Aviso: no están en el catálogo: ${ausentes.join(', ')}`);
  const libres = new Set(config.licenciasLibres);

  /** @type {{ paquete: string, licencia: string, motivo: string }[]} */
  const excluidos = [];
  /** clave «formato/nombre» → candidatos @type {Map<string, { formato: number, nombre: string, ruta: string, paquete: string }[]>} */
  const candidatos = new Map();
  /** @type {Map<string, string[]>} */
  const etiquetas = new Map();
  /** @type {Map<string, string[]>} archivos de licencia (ruta en TeX Live) de cada paquete */
  const licenciasPaquete = new Map();
  for (const nombre of paquetes) {
    const p = /** @type {import('./tlpdb.mjs').Paquete} */ (db.get(nombre));
    const licencia = licenciaEfectiva(p, config.licenciasVerificadas);
    if (!esLibre(licencia, libres)) {
      excluidos.push({ paquete: nombre, licencia: licencia.join(' ') || '(sin dato)', motivo: 'licencia' });
      continue;
    }
    etiquetas.set(nombre, licencia);
    licenciasPaquete.set(nombre, archivosDeLicencia(p));
    for (const ruta of p.runfiles) {
      if (config.excluirCarpetas.some((c) => ruta.startsWith(c))) continue;
      if ((config.excluirExtensiones ?? []).some((e) => ruta.toLowerCase().endsWith(e))) continue;
      const f = formatoDeRuta(ruta);
      if (!f) continue;
      const clave = `${f.formato}/${f.nombre}`;
      const lista = candidatos.get(clave) ?? [];
      lista.push({ ...f, ruta, paquete: nombre });
      candidatos.set(clave, lista);
    }
  }

  // Nombres repetidos: gana el archivo que kpathsea resolvería.
  /** @type {{ formato: number, nombre: string, ruta: string, paquete: string, bytes: number }[]} */
  const elegidos = [];
  let repetidos = 0;
  let alfabetico = 0;
  for (const lista of candidatos.values()) {
    let c = lista[0];
    if (lista.length > 1) {
      repetidos++;
      const ganador = kpsewhich(texlive, c.formato, c.nombre);
      const porKpse = lista.find((x) => norm(join(texlive, x.ruta)) === ganador);
      if (!porKpse) alfabetico++;
      c = porKpse ?? [...lista].sort((a, b) => a.ruta.localeCompare(b.ruta))[0];
    }
    const bytes = statSync(join(texlive, c.ruta)).size;
    elegidos.push({ ...c, bytes });
  }
  elegidos.sort((a, b) => a.formato - b.formato || a.nombre.localeCompare(b.nombre));

  // Nombres bajo los que se guarda cada archivo (cada variante ocupa su propio archivo).
  const sinVariantes = new Set(config.sinVariantes ?? []);
  const nombresDe = (/** @type {{ formato: number, nombre: string }} */ e) =>
    sinVariantes.has(e.formato) ? [e.nombre] : variantesDeNombre(e.formato, e.nombre);

  // Presupuesto.
  const peso = (/** @type {typeof elegidos[number]} */ e) => e.bytes * nombresDe(e).length;
  const totalBytes = elegidos.reduce((s, e) => s + peso(e), 0);
  if (totalBytes > maxMB * 1048576) {
    const top = [...elegidos].sort((a, b) => peso(b) - peso(a)).slice(0, 20);
    const lineas = top.map(
      (e) => `  ${mb(peso(e)).padStart(8)} MB  ${e.formato}/${e.nombre}  (${e.paquete})`,
    );
    throw new Error(
      `El espejo pesaría ${mb(totalBytes)} MB y el presupuesto es ${maxMB} MB. Las 20 entradas más pesadas:\n${lineas.join('\n')}\n` +
        'Reduce scripts/espejo/paquetes.json o sube maxMB.',
    );
  }

  // Salida: solo se borra una carpeta vacía o que ya sea un espejo.
  if (existsSync(salida)) {
    if (readdirSync(salida).length && !existsSync(join(salida, 'manifiesto.json'))) {
      throw new Error(`${salida} existe y no parece un espejo (falta manifiesto.json); no se borra.`);
    }
    rmSync(salida, { recursive: true, force: true });
  }
  mkdirSync(salida, { recursive: true });

  /** @type {{ formato: number, nombre: string, bytes: number, sha256: string, paquete: string }[]} */
  const manifiesto = [];
  const escritos = new Set();
  // Claves en minúsculas: en un disco que no distingue mayúsculas dos nombres que solo difieren así chocan.
  /** @type {Map<string, string>} */
  const enMinusculas = new Map();
  /** @type {string[]} */
  const colisiones = [];
  for (const e of elegidos) {
    const origen = join(texlive, e.ruta);
    const sha256 = createHash('sha256').update(readFileSync(origen)).digest('hex');
    for (const nombre of nombresDe(e)) {
      const clave = `${e.formato}/${nombre}`;
      // Un nombre exacto de otro archivo prevalece sobre una variante sin extensión.
      if (escritos.has(clave)) continue;
      if (nombre !== e.nombre && candidatos.has(clave)) continue;
      const min = clave.toLowerCase();
      const previo = enMinusculas.get(min);
      if (previo !== undefined) {
        colisiones.push(`${previo} ~ ${clave}`);
        continue;
      }
      enMinusculas.set(min, clave);
      escritos.add(clave);
      mkdirSync(join(salida, String(e.formato)), { recursive: true });
      copyFileSync(origen, join(salida, String(e.formato), nombre));
      manifiesto.push({ formato: e.formato, nombre, bytes: e.bytes, sha256, paquete: e.paquete });
    }
  }

  // Textos de licencia: los generales de `textosLicencia` (etiqueta → archivos de TeX Live) y los que
  // cada paquete trae en su doc/. Se copian a LICENCIAS/ (el espejo no distribuye doc/ ni source/).
  const usados = [...new Set(manifiesto.map((m) => m.paquete))].sort();
  const dirLic = join(salida, 'LICENCIAS');
  /** @type {Map<string, string>} «origen|destino» → ruta relativa a la raíz del espejo */
  const copiados = new Map();
  let bytesLicencias = 0;
  /** Copia un texto de licencia una sola vez. @returns {string | null} ruta relativa a la raíz del espejo */
  const copiarLicencia = (/** @type {string} */ rutaTL, /** @type {string} */ destinoRel) => {
    const origen = join(texlive, rutaTL);
    if (!existsSync(origen)) return null;
    const clave = `${origen}|${destinoRel}`;
    const ya = copiados.get(clave);
    if (ya) return ya;
    mkdirSync(dirname(join(dirLic, destinoRel)), { recursive: true });
    copyFileSync(origen, join(dirLic, destinoRel));
    bytesLicencias += statSync(origen).size;
    const rel = `LICENCIAS/${destinoRel}`;
    copiados.set(clave, rel);
    return rel;
  };
  /** @type {string[]} */
  const lineasTsv = [];
  /** @type {string[]} */
  const sinTexto = [];
  const copyleft = /** @type {Record<string, string[]>} */ ({ gpl: [], lgpl: [], agpl: [] });
  for (const p of usados) {
    const tags = etiquetas.get(p) ?? [];
    /** @type {string[]} */
    const archivos = [];
    for (const tag of tags) {
      for (const rutaTL of config.textosLicencia?.[tag] ?? []) {
        const rel = copiarLicencia(rutaTL, `textos/${rutaTL.slice(rutaTL.lastIndexOf('/') + 1)}`);
        if (rel && !archivos.includes(rel)) archivos.push(rel);
      }
    }
    for (const rutaTL of licenciasPaquete.get(p) ?? []) {
      const rel = copiarLicencia(rutaTL, `paquetes/${p}/${rutaTL.slice(rutaTL.lastIndexOf('/') + 1)}`);
      if (rel) archivos.push(rel);
    }
    if (!archivos.length) sinTexto.push(p);
    for (const familia of Object.keys(copyleft)) {
      if (tags.some((t) => t.startsWith(familia))) copyleft[familia]?.push(p);
    }
    lineasTsv.push(`${p}\t${tags.join(' ')}\t${archivos.join(';')}`);
  }
  writeFileSync(join(salida, 'manifiesto.json'), JSON.stringify(manifiesto));
  writeFileSync(
    join(salida, 'LICENCIAS.tsv'),
    'paquete\tlicencia (catálogo de TeX Live o verificada a mano)\ttextos de licencia (ruta desde la raíz del espejo)\n' +
      lineasTsv.join('\n') +
      '\n',
  );
  writeFileSync(
    join(salida, 'EXCLUIDOS.tsv'),
    'paquete\tlicencia\tmotivo\n' +
      excluidos.map((x) => `${x.paquete}\t${x.licencia}\t${x.motivo}`).join('\n') +
      '\n',
  );
  writeFileSync(join(salida, '.nojekyll'), '');
  writeFileSync(
    join(salida, 'README.md'),
    [
      '# Espejo de archivos de TeX Live para IPN Folio',
      '',
      'Archivos de TeX Live sin modificar, organizados como `<formato>/<archivo>` (número de formato de kpathsea).',
      'IPN Folio los pide con `GET <endpoint>/<formato>/<archivo>` cuando BusyTeX necesita un paquete que no',
      'trae de serie (español de babel, fuentes, etc.). Algunos formatos se piden sin extensión, por eso hay',
      'dos copias del mismo archivo (con y sin extensión).',
      '',
      'Nombres: cada archivo se sirve con el nombre exacto que pide LaTeX (mayúsculas incluidas, porque',
      'GitHub Pages las distingue). LaTeX pide en minúsculas los archivos `.fd` de fuentes, así que',
      '`T1Montserrat-TLF.fd` está como `26/t1montserrat-tlf.fd`.',
      '',
      '- `manifiesto.json`: formato, nombre, tamaño, SHA-256 y paquete de cada archivo.',
      '- `LICENCIAS.tsv`: licencia de cada paquete y dónde está su texto en `LICENCIAS/`.',
      '- `LICENCIAS/`: textos de licencia (`textos/` los generales; `paquetes/<paquete>/` los que trae cada paquete).',
      '- `EXCLUIDOS.tsv`: paquetes omitidos por licencia no libre, dudosa o desconocida.',
      '',
      'Cada archivo conserva la licencia de su paquete (LPPL, GPL, OFL, etc.); se distribuyen como datos aparte',
      'de la aplicación. Código fuente de los paquetes GPL/LGPL/AGPL: pendiente de decidir cómo ofrecerlo',
      '(ver el HANDOFF de la sesión 04 de IPN Folio). Generado por `scripts/espejo/generar.mjs`.',
      '',
    ].join('\n'),
  );

  const grandes = [...manifiesto].sort((a, b) => b.bytes - a.bytes).slice(0, 10);
  return {
    archivos: manifiesto.length,
    unicos: elegidos.length,
    bytes: totalBytes,
    paquetes: usados.length,
    repetidos,
    alfabetico,
    excluidos,
    colisiones,
    sinTexto,
    copyleft,
    licenciasCopiadas: copiados.size,
    bytesLicencias,
    grandes,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = leerArgs(process.argv.slice(2));
  const config = JSON.parse(readFileSync(resolve(args.config ?? join(AQUI, 'paquetes.json')), 'utf8'));
  try {
    const r = generar({
      texlive: resolve(args.texlive ?? config.texlive),
      salida: resolve(RAIZ, args.salida ?? 'espejo-local'),
      config,
      maxMB: Number(args['max-mb'] ?? config.maxMB ?? 600),
    });
    console.log(
      `Espejo: ${r.archivos} archivos (${r.unicos} únicos), ${mb(r.bytes)} MB, ${r.paquetes} paquetes.`,
    );
    console.log(
      `Nombres repetidos resueltos con kpsewhich: ${r.repetidos} (${r.alfabetico} por orden alfabético, porque kpsewhich no eligió ninguno de los candidatos).`,
    );
    console.log(
      `Textos de licencia: ${r.licenciasCopiadas} archivos (${mb(r.bytesLicencias)} MB). Paquetes sin texto de licencia: ${r.sinTexto.length}.`,
    );
    console.log(
      `Copyleft (código fuente por ofrecer): GPL ${r.copyleft.gpl?.length}, LGPL ${r.copyleft.lgpl?.length}, AGPL ${r.copyleft.agpl?.length} paquetes.`,
    );
    if (r.colisiones.length) {
      console.warn(
        `AVISO: ${r.colisiones.length} nombres chocan al ignorar mayúsculas (se omitió el segundo):`,
      );
      for (const c of r.colisiones.slice(0, 10)) console.warn(`  ${c}`);
    }
    if (r.excluidos.length) {
      console.log(
        `Excluidos por licencia (${r.excluidos.length}): ${r.excluidos.map((x) => `${x.paquete} [${x.licencia}]`).join(', ')}`,
      );
    }
    console.log('Más pesados:');
    for (const g of r.grandes)
      console.log(`  ${mb(g.bytes).padStart(7)} MB  ${g.formato}/${g.nombre}  (${g.paquete})`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
