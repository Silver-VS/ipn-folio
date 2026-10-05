// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference types="vitest/config" />
import { readFileSync, realpathSync } from 'node:fs';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { leerTextosComun, leerTextosFolio } from './scripts/lib/textos.mjs';

// Entorno de configuración: FOLIO_ENTORNO, o «desarrollo» en `vite` y «produccion» en `vite build`.
const entornoPor = (mando: string) =>
  process.env.FOLIO_ENTORNO ?? (mando === 'serve' ? 'desarrollo' : 'produccion');

/** Sustituye [[t:clave]] en index.html por el texto de es.toml (o de @ipn/comun): ningún texto vive en el HTML. */
function textosEnHtml(): Plugin {
  return {
    name: 'folio-textos-html',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const textos: Record<string, string> = { ...leerTextosComun().textos, ...leerTextosFolio().textos };
        const escapar = (s: string) =>
          s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        return html.replace(/\[\[t:([^\]\s]+)\]\]/g, (_, clave: string) => {
          const texto = textos[clave];
          if (texto === undefined) throw new Error(`index.html: la clave de texto «${clave}» no existe`);
          return escapar(texto);
        });
      },
    },
  };
}

export default defineConfig(({ command }) => {
  const entorno = entornoPor(command);
  const config = JSON.parse(readFileSync(new URL(`./config/${entorno}.json`, import.meta.url), 'utf8')) as {
    base: string;
  };
  // @ipn/comun puede ser un enlace a una carpeta fuera del repositorio (file:): el servidor debe poder leerla.
  const comun = realpathSync(new URL('./node_modules/@ipn/comun', import.meta.url));
  return {
    base: process.env.FOLIO_BASE ?? config.base ?? './',
    plugins: [svelte(), textosEnHtml()],
    define: { __FOLIO_ENTORNO__: JSON.stringify(entorno) },
    // El worker de BusyTeX (sesión 03) usa importScripts, que no existe en workers de módulo.
    worker: { format: 'iife' },
    build: { target: 'es2022' },
    server: { fs: { allow: ['.', comun] } },
    test: {
      include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
      environment: 'node',
    },
  };
});
