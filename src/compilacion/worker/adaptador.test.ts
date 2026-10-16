// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { Adaptador, ErrorAdaptador, rutaDeBitacora } from './adaptador';

it('2: una incompatibilidad asíncrona del cargador rechaza el arranque pendiente', async () => {
  const eventos = new EventTarget();
  const creado = vi.fn();
  const quitar = vi.fn(eventos.removeEventListener.bind(eventos));
  vi.stubGlobal('importScripts', vi.fn());
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 404 })),
  );
  vi.stubGlobal('addEventListener', eventos.addEventListener.bind(eventos));
  vi.stubGlobal('removeEventListener', quitar);
  vi.stubGlobal(
    'BusytexPipeline',
    class {
      Module = new Promise(() => undefined);
      constructor() {
        creado();
      }
    },
  );
  try {
    const adaptador = new Adaptador({ progreso: vi.fn(), salida: vi.fn() });
    let capturado: unknown;
    const arranque = adaptador
      .iniciar({ base: 'http://localhost/busytex', catalogo: ['texlive-basic.js'] })
      .catch((error: unknown) => {
        capturado = error;
      });
    await vi.waitFor(() => expect(creado).toHaveBeenCalledOnce());
    const error = new Error('folio-version: paquete incompatible');
    const evento = Object.assign(new Event('unhandledrejection', { cancelable: true }), { reason: error });
    eventos.dispatchEvent(evento);
    await new Promise((resolver) => setTimeout(resolver, 0));
    expect(capturado).toBe(error);
    await arranque;
    expect(evento.defaultPrevented).toBe(true);
    expect(quitar).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
  } finally {
    vi.unstubAllGlobals();
  }
});

describe('rutaDeBitacora', () => {
  it('TeX: el .log del archivo principal', () => {
    expect(rutaDeBitacora(['pdflatex', '-synctex=1', '--fmt', '/x/pdflatex.fmt', 'tesis.tex'])).toBe(
      'tesis.log',
    );
  });

  it('TeX con -jobname usa ese nombre', () => {
    expect(rutaDeBitacora(['pdflatex', '--jobname=salida', 'a.tex'])).toBe('salida.log');
  });

  it('bibtex8: el .blg del .aux', () => {
    expect(rutaDeBitacora(['bibtex8', '--8bit', 'tesis.aux'])).toBe('tesis.blg');
  });

  it('makeindex: el .ilg de la entrada, ignorando valores de opciones', () => {
    expect(rutaDeBitacora(['makeindex', 'tesis.idx'])).toBe('tesis.ilg');
    expect(rutaDeBitacora(['makeindex', 'tesis.nlo', '-s', 'nomencl.ist', '-o', 'tesis.nls'])).toBe(
      'tesis.ilg',
    );
  });

  it('makeindex con -t usa la bitácora indicada', () => {
    expect(rutaDeBitacora(['makeindex', 'a.idx', '-t', 'otra.ilg'])).toBe('otra.ilg');
  });
});

describe('Adaptador: aborto del WASM', () => {
  function adaptadorConPipeline(runCmd: () => never) {
    const adaptador = new Adaptador({ progreso: () => undefined, salida: () => undefined });
    const interno = adaptador as unknown as Record<string, unknown>;
    interno['pipeline'] = { _run_cmd: runCmd, project_dir: '/home/web_user/project_dir' };
    interno['modulo'] = { FS: {}, PATH: { join: (...p: string[]) => p.join('/') } };
    interno['cabecera'] = new Uint8Array(1);
    return adaptador;
  }
  const aborta = () => {
    throw new Error('Aborted(OOM)');
  };

  it('si _run_cmd lanza, marca el adaptador inutilizable y avisa con el código «abortado»', () => {
    const adaptador = adaptadorConPipeline(aborta);
    let capturado: unknown;
    try {
      adaptador.ejecutar(['pdflatex', 'a.tex']);
    } catch (error) {
      capturado = error;
    }
    expect(capturado).toBeInstanceOf(ErrorAdaptador);
    expect((capturado as ErrorAdaptador).codigo).toBe('abortado');
    expect(adaptador.inutilizable).toBe(true);
  });

  it('después de abortar, ejecutar y leer fallan con «abortado» sin tocar el WASM', () => {
    const adaptador = adaptadorConPipeline(aborta);
    expect(() => adaptador.ejecutar(['pdflatex', 'a.tex'])).toThrow();
    expect(() => adaptador.ejecutar(['pdflatex', 'a.tex'])).toThrowError(
      expect.objectContaining({ codigo: 'abortado' }),
    );
    expect(() => adaptador.leer('a.pdf')).toThrowError(expect.objectContaining({ codigo: 'abortado' }));
  });
});
