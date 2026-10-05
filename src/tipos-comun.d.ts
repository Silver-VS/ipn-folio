// SPDX-License-Identifier: AGPL-3.0-or-later
// Tipos de los módulos JS de @ipn/comun (el paquete no trae .d.ts; instalado desde git, TypeScript no infiere
// tipos de JavaScript dentro de node_modules). Cuando ipn-comun publique sus tipos, se borra este archivo.
declare module '@ipn/comun/js/texto.js' {
  export function registrar(idioma: string, mapa: Record<string, string>): void;
  export function usarIdioma(idioma: string): void;
  export function configurar(opciones?: { desarrollo?: boolean; avisar?: (mensaje: string) => void }): void;
  export function reiniciar(): void;
  export function escapar(s: string): string;
  export function sanear(html: string): string;
  export function t(clave: string, variables?: Record<string, unknown>): string;
}
declare module '@ipn/comun/js/tema.js' {
  export const MODOS: string[];
  export const CLAVE_ALMACEN: string;
  export function aplicarTema(modo: string, opciones?: { raiz?: HTMLElement; almacen?: Storage }): void;
  export function leerTema(opciones?: { almacen?: Storage }): string;
  export function iniciarTema(opciones?: Record<string, unknown>): unknown;
  export function esOscuro(opciones?: Record<string, unknown>): boolean;
}
