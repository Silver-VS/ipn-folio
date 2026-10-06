// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { ErrorMotor, Motor } from './motor';
import type { Canal, CrearCanal } from './motor';
import type { Peticion, Respuesta } from './tipos';
import { t } from '../textos/t';

/** Worker falso: guarda lo que recibe y deja a la prueba decidir cuándo y qué responder. */
function canalFalso() {
  const canales: Array<{
    recibidas: Peticion[];
    terminado: boolean;
    responder: (r: Respuesta) => void;
    fallar: (m: string) => void;
  }> = [];
  const crear: CrearCanal = (alRecibir, alFallar) => {
    const estado = { recibidas: [] as Peticion[], terminado: false, responder: alRecibir, fallar: alFallar };
    canales.push(estado);
    const canal: Canal = {
      enviar: (p) => estado.recibidas.push(p),
      terminar: () => (estado.terminado = true),
    };
    return canal;
  };
  return { crear, canales };
}

const esperar = () => new Promise((r) => setTimeout(r, 0));

/** Responde «listo» al `iniciar` y deja pasar el resto. */
async function iniciarCon(motor: Motor, canales: ReturnType<typeof canalFalso>['canales'], indice = 0) {
  await esperar();
  const canal = canales[indice]!;
  const inicio = canal.recibidas[0]!;
  expect(inicio.tipo).toBe('iniciar');
  canal.responder({ tipo: 'listo', id: inicio.id, versiones: { pdflatex: 'TeX 2026' } });
  void motor;
}

describe('Motor: protocolo', () => {
  it('inicia el worker con rutas absolutas y solo el paquete basic', async () => {
    const { crear, canales } = canalFalso();
    const motor = new Motor({ base: './busytex', espejo: null, crearCanal: crear });
    const promesa = motor.iniciar();
    await iniciarCon(motor, canales);
    expect(await promesa).toEqual({ pdflatex: 'TeX 2026' });
    const inicio = canales[0]!.recibidas[0]!;
    if (inicio.tipo !== 'iniciar') throw new Error('se esperaba iniciar');
    expect(inicio.catalogo).toEqual(['texlive-basic.js']);
    expect(inicio.base).toMatch(/^https?:\/\/.+\/busytex$/);
    expect(inicio.espejo).toBeUndefined();
  });

  it('manda el espejo como URL absoluta', async () => {
    const { crear, canales } = canalFalso();
    const motor = new Motor({
      base: 'http://x/b',
      espejo: 'http://localhost:8765/texlive/',
      crearCanal: crear,
    });
    void motor.iniciar();
    await esperar();
    const inicio = canales[0]!.recibidas[0]!;
    if (inicio.tipo !== 'iniciar') throw new Error('se esperaba iniciar');
    expect(inicio.espejo).toBe('http://localhost:8765/texlive');
  });

  it('es perezoso: no crea el worker hasta la primera llamada, y lo reutiliza', async () => {
    const { crear, canales } = canalFalso();
    const motor = new Motor({ base: 'http://x/b', espejo: null, crearCanal: crear });
    expect(canales).toHaveLength(0);
    const a = motor.existe('a.tex');
    await iniciarCon(motor, canales);
    await esperar();
    const canal = canales[0]!;
    canal.responder({ tipo: 'resultado', id: canal.recibidas[1]!.id, datos: { de: 'existe', existe: true } });
    expect(await a).toBe(true);
    const b = motor.existe('b.tex');
    await esperar();
    expect(canales).toHaveLength(1);
    canal.responder({
      tipo: 'resultado',
      id: canal.recibidas[2]!.id,
      datos: { de: 'existe', existe: false },
    });
    expect(await b).toBe(false);
  });

  it('ejecuta una petición a la vez, en orden', async () => {
    const { crear, canales } = canalFalso();
    const motor = new Motor({ base: 'http://x/b', espejo: null, crearCanal: crear });
    void motor.iniciar();
    await iniciarCon(motor, canales);
    const canal = canales[0]!;
    const primera = motor.ejecutar(['pdflatex', 'a.tex']);
    const segunda = motor.ejecutar(['bibtex8', 'a.aux']);
    await esperar();
    // Solo la primera ha salido hacia el worker.
    expect(canal.recibidas.map((p) => p.tipo)).toEqual(['iniciar', 'ejecutar']);
    const resultado = { codigo: 0, stdout: 'ok', stderr: '', log: 'log', ms: 5 };
    canal.responder({ tipo: 'resultado', id: canal.recibidas[1]!.id, datos: { de: 'ejecutar', resultado } });
    expect(await primera).toEqual(resultado);
    await esperar();
    expect(canal.recibidas.map((p) => p.tipo)).toEqual(['iniciar', 'ejecutar', 'ejecutar']);
    canal.responder({
      tipo: 'resultado',
      id: canal.recibidas[2]!.id,
      datos: { de: 'ejecutar', resultado: { ...resultado, stdout: 'bib' } },
    });
    expect((await segunda).stdout).toBe('bib');
  });

  it('reenvía progreso y salida en vivo a las escuchas', async () => {
    const { crear, canales } = canalFalso();
    const progreso: Array<[number, number]> = [];
    const salida: string[] = [];
    const motor = new Motor({
      base: 'http://x/b',
      espejo: null,
      crearCanal: crear,
      eventos: { progreso: (c, t) => progreso.push([c, t]), salida: (t) => salida.push(t) },
    });
    void motor.iniciar();
    await esperar();
    const canal = canales[0]!;
    canal.responder({ tipo: 'progreso', cargado: 10, total: 100 });
    canal.responder({ tipo: 'salida', texto: 'This is pdfTeX' });
    expect(progreso).toEqual([[10, 100]]);
    expect(salida).toEqual(['This is pdfTeX']);
  });

  it('un error del worker rechaza solo esa petición', async () => {
    const { crear, canales } = canalFalso();
    const motor = new Motor({ base: 'http://x/b', espejo: null, crearCanal: crear });
    void motor.iniciar();
    await iniciarCon(motor, canales);
    const canal = canales[0]!;
    const leer = motor.leer('no-existe.pdf');
    await esperar();
    canal.responder({ tipo: 'error', id: canal.recibidas[1]!.id, mensaje: 'fallo interno' });
    await expect(leer).rejects.toMatchObject({
      codigo: 'peticion',
      detalle: 'fallo interno',
      message: t('errores.motor.peticion'),
    });
    const otra = motor.leer('a.pdf');
    await esperar();
    canal.responder({
      tipo: 'resultado',
      id: canal.recibidas[2]!.id,
      datos: { de: 'leer', contenido: new Uint8Array([37, 80]) },
    });
    expect(await otra).toEqual(new Uint8Array([37, 80]));
  });

  it('si falla el arranque, descarta el worker y el siguiente intento empieza de cero', async () => {
    const { crear, canales } = canalFalso();
    const motor = new Motor({ base: 'http://x/b', espejo: null, crearCanal: crear });
    const primero = motor.existe('a');
    await esperar();
    canales[0]!.responder({ tipo: 'error', id: canales[0]!.recibidas[0]!.id, mensaje: 'no cargó' });
    await expect(primero).rejects.toBeInstanceOf(ErrorMotor);
    expect(canales[0]!.terminado).toBe(true);
    void motor.existe('a');
    await esperar();
    expect(canales).toHaveLength(2);
  });

  it('si el worker muere, rechaza lo pendiente con código «worker»', async () => {
    const { crear, canales } = canalFalso();
    const motor = new Motor({ base: 'http://x/b', espejo: null, crearCanal: crear });
    const p = motor.iniciar();
    await esperar();
    canales[0]!.fallar('worker caído');
    await expect(p).rejects.toMatchObject({ codigo: 'worker' });
  });
});

describe('Motor: cancelar', () => {
  it('termina el worker, rechaza lo pendiente y lo que esperaba en cola', async () => {
    const { crear, canales } = canalFalso();
    const motor = new Motor({ base: 'http://x/b', espejo: null, crearCanal: crear });
    void motor.iniciar();
    await iniciarCon(motor, canales);
    const enCurso = motor.ejecutar(['pdflatex', 'a.tex']);
    const enCola = motor.ejecutar(['pdflatex', 'b.tex']);
    await esperar();
    motor.cancelar();
    expect(canales[0]!.terminado).toBe(true);
    await expect(enCurso).rejects.toMatchObject({ codigo: 'cancelado' });
    await expect(enCola).rejects.toMatchObject({ codigo: 'cancelado' });
    // Nunca llegó la petición de la cola al worker viejo.
    expect(canales[0]!.recibidas.filter((p) => p.tipo === 'ejecutar')).toHaveLength(1);
  });

  it('la siguiente llamada crea un worker nuevo y funciona', async () => {
    const { crear, canales } = canalFalso();
    const motor = new Motor({ base: 'http://x/b', espejo: null, crearCanal: crear });
    void motor.iniciar();
    await iniciarCon(motor, canales);
    const viejo = motor.ejecutar(['pdflatex', 'a.tex']);
    await esperar();
    motor.cancelar();
    await expect(viejo).rejects.toBeInstanceOf(ErrorMotor);

    const nueva = motor.existe('main.pdf');
    await iniciarCon(motor, canales, 1);
    await esperar();
    const canal = canales[1]!;
    expect(canales).toHaveLength(2);
    canal.responder({ tipo: 'resultado', id: canal.recibidas[1]!.id, datos: { de: 'existe', existe: true } });
    expect(await nueva).toBe(true);
  });
});

describe('Motor: worker abortado', () => {
  it('si el WASM aborta en ejecutar: error claro, worker descartado y recreado en la siguiente llamada', async () => {
    const { crear, canales } = canalFalso();
    const motor = new Motor({ base: 'http://x/b', espejo: null, crearCanal: crear });
    void motor.iniciar();
    await iniciarCon(motor, canales);
    const viejo = canales[0]!;
    const ejecucion = motor.ejecutar(['pdflatex', 'a.tex']);
    await esperar();
    viejo.responder({
      tipo: 'error',
      id: viejo.recibidas[1]!.id,
      codigo: 'abortado',
      mensaje: 'Aborted(stack overflow)',
    });
    await expect(ejecucion).rejects.toMatchObject({
      codigo: 'abortado',
      message: t('errores.motor.abortado'),
      detalle: 'Aborted(stack overflow)',
    });
    expect(viejo.terminado).toBe(true);

    // La siguiente llamada crea un worker nuevo (no reutiliza el roto) y funciona.
    const nueva = motor.existe('main.pdf');
    await iniciarCon(motor, canales, 1);
    await esperar();
    expect(canales).toHaveLength(2);
    const canal = canales[1]!;
    canal.responder({ tipo: 'resultado', id: canal.recibidas[1]!.id, datos: { de: 'existe', existe: true } });
    expect(await nueva).toBe(true);
  });

  it('lo que esperaba en cola tras el aborto falla sin llegar al worker roto', async () => {
    const { crear, canales } = canalFalso();
    const motor = new Motor({ base: 'http://x/b', espejo: null, crearCanal: crear });
    void motor.iniciar();
    await iniciarCon(motor, canales);
    const viejo = canales[0]!;
    const primera = motor.ejecutar(['pdflatex', 'a.tex']);
    const segunda = motor.ejecutar(['pdflatex', 'b.tex']);
    await esperar();
    viejo.responder({ tipo: 'error', id: viejo.recibidas[1]!.id, codigo: 'abortado', mensaje: 'abort' });
    await expect(primera).rejects.toMatchObject({ codigo: 'abortado' });
    await expect(segunda).rejects.toMatchObject({ codigo: 'abortado' });
    expect(viejo.recibidas.filter((p) => p.tipo === 'ejecutar')).toHaveLength(1);
  });

  it('un error no fatal (sin código) no descarta el worker', async () => {
    const { crear, canales } = canalFalso();
    const motor = new Motor({ base: 'http://x/b', espejo: null, crearCanal: crear });
    void motor.iniciar();
    await iniciarCon(motor, canales);
    const canal = canales[0]!;
    const e = motor.ejecutar(['pdflatex', 'a.tex']);
    await esperar();
    canal.responder({ tipo: 'error', id: canal.recibidas[1]!.id, mensaje: 'algo' });
    await expect(e).rejects.toMatchObject({ codigo: 'peticion' });
    expect(canal.terminado).toBe(false);
  });

  it('si el worker muere (onerror) durante ejecutar, se recrea en la siguiente llamada', async () => {
    const { crear, canales } = canalFalso();
    const motor = new Motor({ base: 'http://x/b', espejo: null, crearCanal: crear });
    void motor.iniciar();
    await iniciarCon(motor, canales);
    const ejecucion = motor.ejecutar(['pdflatex', 'a.tex']);
    await esperar();
    canales[0]!.fallar('RuntimeError: unreachable');
    await expect(ejecucion).rejects.toMatchObject({ codigo: 'worker', message: t('errores.motor.worker') });
    void motor.existe('a');
    await esperar();
    expect(canales).toHaveLength(2);
  });

  it('un evento tardío del worker viejo no afecta al nuevo', async () => {
    const { crear, canales } = canalFalso();
    const motor = new Motor({ base: 'http://x/b', espejo: null, crearCanal: crear });
    void motor.iniciar();
    await iniciarCon(motor, canales);
    motor.cancelar();
    const nueva = motor.existe('a');
    await iniciarCon(motor, canales, 1);
    await esperar();
    canales[0]!.fallar('tardío'); // onerror del worker ya terminado
    const canal = canales[1]!;
    expect(canal.terminado).toBe(false);
    canal.responder({ tipo: 'resultado', id: canal.recibidas[1]!.id, datos: { de: 'existe', existe: true } });
    expect(await nueva).toBe(true);
  });
});
