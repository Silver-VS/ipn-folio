// SPDX-License-Identifier: AGPL-3.0-or-later
// `t()` devuelve HTML seguro (los valores de las variables salen escapados). Para mostrar ese texto como TEXTO (nodo de
// texto de Svelte, aria-label, atributos del DOM) hay que deshacer el escape; si no, un archivo llamado «a&b.tex»
// se vería «a&amp;b.tex». Uso en una plantilla de Svelte: plano de t con la clave y sus variables.

const ENTIDADES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&amp;': '&' };

export function plano(html: string): string {
  // Primero se quitan las etiquetas permitidas por la plantilla (<b>, <i>, <code>, <a>); las que vienen de variables
  // ya están escapadas (&lt;) y sobreviven como texto.
  return html.replace(/<\/?[a-zA-Z][^<>]*>/g, '').replace(/&(?:lt|gt|quot|#39|amp);/g, (e) => ENTIDADES[e] ?? e);
}
