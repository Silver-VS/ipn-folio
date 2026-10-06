// SPDX-License-Identifier: AGPL-3.0-or-later
// Worker CLÁSICO (BusyTeX se carga con importScripts; ver `worker.format: 'iife'` en vite.config.ts).
// Recibe peticiones del Motor, las atiende de una en una y responde con el mismo `id`.
import type { Datos, Peticion, Respuesta } from '../tipos';
import { Adaptador, ErrorAdaptador } from './adaptador';

function enviar(respuesta: Respuesta, transferir: Transferable[] = []): void {
  self.postMessage(respuesta, { transfer: transferir });
}

const adaptador = new Adaptador({
  progreso: (cargado, total) => enviar({ tipo: 'progreso', cargado, total }),
  salida: (texto) => enviar({ tipo: 'salida', texto }),
});

async function atender(peticion: Peticion): Promise<{ datos: Datos; transferir?: Transferable[] }> {
  switch (peticion.tipo) {
    case 'iniciar': {
      const versiones = await adaptador.iniciar({
        base: peticion.base,
        catalogo: peticion.catalogo,
        espejo: peticion.espejo,
      });
      return { datos: { de: 'iniciar', versiones } };
    }
    case 'montar':
      adaptador.montar(peticion.archivos, peticion.directorio);
      return { datos: { de: 'montar' } };
    case 'ejecutar':
      return { datos: { de: 'ejecutar', resultado: adaptador.ejecutar(peticion.cmd, peticion.enVivo) } };
    case 'leer': {
      const contenido = adaptador.leer(peticion.ruta);
      return { datos: { de: 'leer', contenido }, transferir: contenido ? [contenido.buffer] : [] };
    }
    case 'existe':
      return { datos: { de: 'existe', existe: adaptador.existe(peticion.ruta) } };
    case 'registrarRemotos':
      await adaptador.registrarRemotos(peticion.archivos);
      return { datos: { de: 'registrarRemotos' } };
    case 'registrarFallos':
      await adaptador.registrarFallos(peticion.claves);
      return { datos: { de: 'registrarFallos' } };
  }
}

// Cadena de promesas: una petición a la vez, en el orden de llegada.
let cola: Promise<void> = Promise.resolve();

self.onmessage = (evento: MessageEvent<Peticion>) => {
  const peticion = evento.data;
  cola = cola.then(async () => {
    try {
      const { datos, transferir } = await atender(peticion);
      if (datos.de === 'iniciar') enviar({ tipo: 'listo', id: peticion.id, versiones: datos.versiones });
      else enviar({ tipo: 'resultado', id: peticion.id, datos }, transferir);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      const codigo = error instanceof ErrorAdaptador ? error.codigo : undefined;
      enviar({ tipo: 'error', id: peticion.id, mensaje, codigo });
    }
  });
};
