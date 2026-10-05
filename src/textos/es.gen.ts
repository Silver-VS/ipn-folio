// GENERADO desde contenido/textos/es.toml y @ipn/comun (dist/textos/comun.es.json); no editar
// SPDX-License-Identifier: CC0-1.0

export const VERSION_TEXTOS = "2026.10.1";
export const VERSION_TEXTOS_COMUN = "2026.10.1";

export const TEXTOS_FOLIO = {
  "app.descripcion": "Editor LaTeX y cuadernos académicos en tu navegador, sin servidores.",
  "app.lema": "Tus apuntes. Tus reglas.",
  "app.nombre": "IPN Folio",
  "app.sin_js": "IPN Folio necesita JavaScript para funcionar. Actívalo en tu navegador y vuelve a cargar la página.",
  "inicio.espacio.aria": "Espacio de trabajo"
} as const;

export const TEXTOS_COMUN: Readonly<Record<string, string>> = {
  "aviso.cerrar.boton": "Cerrar aviso",
  "aviso.errores.titulo": "{n, plural, one {# error} other {# errores}}",
  "pie.codigo_fuente": "Código fuente",
  "pie.licencia": "Licencia {licencia}",
  "tema.auto": "Según el sistema",
  "tema.claro": "Tema claro",
  "tema.oscuro": "Tema oscuro",
  "unidad.otra": "Otra unidad académica",
  "unidad.selector.etiqueta": "Unidad académica"
};

export type ClaveComun = "aviso.cerrar.boton" | "aviso.errores.titulo" | "pie.codigo_fuente" | "pie.licencia" | "tema.auto" | "tema.claro" | "tema.oscuro" | "unidad.otra" | "unidad.selector.etiqueta";
export type ClaveFolio = keyof typeof TEXTOS_FOLIO;
export type ClaveTexto = ClaveFolio | ClaveComun;

/** Variables que exige cada clave con {variables}; las claves sin variables no aparecen. */
export interface VariablesPorClave {
  "aviso.errores.titulo": { n: string | number };
  "pie.licencia": { licencia: string | number };
}
