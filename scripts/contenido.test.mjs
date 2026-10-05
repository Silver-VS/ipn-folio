// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { revisar } from './contenido.mjs';

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
