// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { revisar, sinComentarios, sinExpresiones } from './contenido.mjs';

function base(cambios = {}) {
  return {
    folio: {
      version: '2026.10.1',
      textos: { 'app.nombre': 'IPN Folio', 'archivo.error.titulo': 'No se pudo abrir {archivo}' },
    },
    comun: { textos: { 'pie.codigo_fuente': 'Código fuente' } },
    vetadas: ['kernel', 'token', 'clave API', '¡Ups!'],
    cambios: '## 2026.10.1\n',
    usos: [
      { clave: 'app.nombre', archivo: 'src/App.svelte', variables: [] },
      { clave: 'archivo.error.titulo', archivo: 'src/App.svelte', variables: ['archivo'] },
      { clave: 'pie.codigo_fuente', archivo: 'src/App.svelte', variables: [] },
    ],
    dinamicos: [],
    svelte: [],
    enlaces: [],
    existeId: () => true,
    existeRuta: () => true,
    ...cambios,
  };
}

describe('revisar (contenido)', () => {
  it.each(["<p>{x.replace(/'/g, '')}</p><h1>Hola mundo</h1>", "<p>{x /* it's */}</p><h1>Hola mundo</h1>"])(
    'una comilla sin pareja no oculta el resto del archivo: %s',
    (contenido) => {
      const resultado = revisar(base({ svelte: [{ archivo: 'src/X.svelte', contenido }] }));
      expect(resultado.errores.join('\n')).toMatch(/src\/X.svelte: expresión sin cerrar/);
    },
  );
  it('un objeto de variables no literal es un aviso «sin verificar», no un error', () => {
    const e = base({ usos: [{ clave: 'archivo.error.titulo', archivo: 'src/App.svelte', variables: null }] });
    const r = revisar(e);
    expect(r.errores).toEqual([]);
    expect(r.avisos.join(' ')).toMatch(/sin verificar/);
  });

  it('el color #hex solo se marca como valor, no como selector (#add)', () => {
    const estilo = (contenido) => base({ estilos: [{ archivo: 'src/X.svelte', contenido }] });
    expect(revisar(estilo('#add { margin: 0; }')).errores).toEqual([]);
    expect(revisar(estilo('a { color: #add; }')).errores.join(' ')).toMatch(/color fijo/);
  });

  it('un tamaño fijo en un texto o en el código es un error; {megas} no', () => {
    const conTexto = (texto) =>
      base({
        folio: { version: '2026.10.1', textos: { 'app.nombre': texto, 'archivo.error.titulo': '{archivo}' } },
      });
    for (const texto of ['Descarga unos 90 MB', 'Pesa 1,5 GB', 'Son 128MB']) {
      expect(revisar(conTexto(texto)).errores.join(' '), texto).toMatch(/tamaño fijo/);
    }
    expect(revisar(conTexto('Descarga unos {megas} MB')).errores.join(' ')).not.toMatch(/tamaño fijo/);
    const codigo = (contenido) => base({ fuentes: [{ archivo: 'src/X.ts', contenido }] });
    expect(revisar(codigo("const a = 'unos 90 MB';")).errores.join(' ')).toMatch(/src\/X.ts: tamaño fijo/);
    // Los comentarios pueden citar cifras medidas; el código no.
    const comentado = ['// pesa ~128 MB', '/* 90 MB */', 'const a = 1;'].join(String.fromCharCode(10));
    expect(revisar(codigo(comentado)).errores).toEqual([]);
    expect(sinComentarios(['a // 5 MB', "b = 'http://x'"].join(String.fromCharCode(10)))).toContain(
      "'http://x'",
    );
  });

  it('acepta un contenido correcto', () => {
    expect(revisar(base()).errores).toEqual([]);
  });

  it('falla ante una clave inexistente', () => {
    const e = base({ usos: [{ clave: 'app.no_existe', archivo: 'src/App.svelte', variables: [] }] });
    expect(revisar(e).errores.join('\n')).toMatch(/app\.no_existe/);
  });

  it('falla ante una variable faltante', () => {
    const e = base({ usos: [{ clave: 'archivo.error.titulo', archivo: 'src/App.svelte', variables: [] }] });
    expect(revisar(e).errores.join('\n')).toMatch(/falta la variable \{archivo\}/);
  });

  it('falla ante una palabra de la lista negra', () => {
    const e = base();
    e.folio.textos['app.nombre'] = 'Reinicia el Kernel';
    expect(revisar(e).errores.join('\n')).toMatch(/vetada/);
  });

  it('falla ante texto en MAYÚSCULAS y plural mal formado', () => {
    const e = base();
    e.folio.textos['app.nombre'] = 'NO SE PUDO GUARDAR';
    e.folio.textos['archivo.error.titulo'] = '{n, plural, one {# error} otro {# errores}}';
    const texto = revisar(e).errores.join('\n');
    expect(texto).toMatch(/MAYÚSCULAS/);
    expect(texto).toMatch(/plural/);
  });

  it('no confunde una flecha dentro de una expresión con el cierre de la etiqueta', () => {
    const e = base({
      svelte: [
        {
          archivo: 'src/Y.svelte',
          contenido:
            '<button onclick={() => { if (a > b) hacer(); }}>{t("x")}</button>{#each lista as x (x)}<li>{x}</li>{/each}',
        },
      ],
    });
    expect(revisar(e).errores.join('\n')).not.toMatch(/texto escrito en la plantilla/);
    expect(sinExpresiones("a{ '}' + {b: 1} }c")).toBe('a c');
  });

  it('falla ante texto suelto en un .svelte y enlaces internos rotos', () => {
    const e = base({
      svelte: [{ archivo: 'src/X.svelte', contenido: '<h1>Hola</h1><button aria-label="Cerrar"></button>' }],
      enlaces: [{ origen: 'index.html', href: '#nada' }],
      existeId: () => false,
    });
    const texto = revisar(e).errores.join('\n');
    expect(texto).toMatch(/texto escrito en la plantilla/);
    expect(texto).toMatch(/aria-label/);
    expect(texto).toMatch(/#nada/);
  });

  it('falla ante colores fijos y nombres antiguos de variables en el CSS', () => {
    const e = base({
      estilos: [{ archivo: 'src/x.css', contenido: 'a { color: #123456; background: var(--bg); }' }],
    });
    const texto = revisar(e).errores.join('\n');
    expect(texto).toMatch(/color fijo/);
    expect(texto).toMatch(/nombres antiguos/);
  });

  it('exige anotar la versión en CAMBIOS.md', () => {
    expect(revisar(base({ cambios: '' })).errores.join('\n')).toMatch(/CAMBIOS/);
  });
});
