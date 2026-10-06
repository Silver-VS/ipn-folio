// GENERADO desde contenido/textos/es.toml y @ipn/comun (dist/textos/comun.es.json); no editar
// SPDX-License-Identifier: CC0-1.0

export const VERSION_TEXTOS = "2026.10.3";
export const VERSION_TEXTOS_COMUN = "2026.10.1";

export const TEXTOS_FOLIO = {
  "app.descripcion": "Editor LaTeX y cuadernos académicos en tu navegador, sin servidores.",
  "app.lema": "Tus apuntes. Tus reglas.",
  "app.nombre": "IPN Folio",
  "app.sin_js": "IPN Folio necesita JavaScript para funcionar. Actívalo en tu navegador y vuelve a cargar la página.",
  "errores.latex.archivo_faltante.ayuda": "Agrega {archivo} al proyecto o corrige su nombre en el código. Si es un paquete, revisa que esté disponible para compilar.",
  "errores.latex.archivo_faltante.titulo": "Falta el archivo {archivo}",
  "errores.latex.argumento_incompleto.ayuda": "Revisa las llaves del comando anterior y cierra su argumento.",
  "errores.latex.argumento_incompleto.titulo": "Un comando tiene un argumento sin cerrar",
  "errores.latex.bibliografia_campo_vacio.ayuda_autor": "Completa el campo del autor de la entrada {cita} en tu archivo de bibliografía.",
  "errores.latex.bibliografia_campo_vacio.ayuda_otro": "Completa el campo {campo} de la entrada {cita} en tu archivo de bibliografía.",
  "errores.latex.bibliografia_campo_vacio.titulo": "La entrada {cita} tiene un campo vacío",
  "errores.latex.bibliografia_entrada_faltante.ayuda": "Agrega la entrada {cita} al archivo de bibliografía o corrige el nombre de la cita.",
  "errores.latex.bibliografia_entrada_faltante.titulo": "Falta la entrada bibliográfica {cita}",
  "errores.latex.bibliografia_faltante.ayuda": "Agrega {archivo} al proyecto o corrige el nombre del archivo de bibliografía en el código.",
  "errores.latex.bibliografia_faltante.titulo": "Falta la bibliografía {archivo}",
  "errores.latex.bibliografia_sin_citas.ayuda": "Agrega una cita en el documento si quieres incluir la bibliografía.",
  "errores.latex.bibliografia_sin_citas.titulo": "La bibliografía no tiene citas que procesar",
  "errores.latex.bibliografia_sintaxis.ayuda": "Revisa las comas, las llaves y los nombres de campo en la línea indicada.",
  "errores.latex.bibliografia_sintaxis.titulo": "Revisa la bibliografía en la línea {linea}",
  "errores.latex.cita_indefinida.ayuda": "Revisa que {cita} exista en tu archivo de bibliografía y que su nombre coincida con el de la cita.",
  "errores.latex.cita_indefinida.titulo": "La cita {cita} no está definida",
  "errores.latex.comando_indefinido.ayuda": "Revisa cómo se escribe {comando} y que hayas cargado el paquete que lo define.",
  "errores.latex.comando_indefinido.titulo": "No se reconoce el comando {comando}",
  "errores.latex.compilacion_detenida.ayuda": "Revisa los problemas anteriores y corrígelos antes de volver a compilar.",
  "errores.latex.compilacion_detenida.titulo": "La compilación se detuvo",
  "errores.latex.compilacion_fatal.ayuda": "Corrige los problemas anteriores y vuelve a compilar.",
  "errores.latex.compilacion_fatal.titulo": "No se pudo generar el PDF",
  "errores.latex.desconocido.ayuda": "Revisa el detalle original y el código de la línea indicada. Si no aparece una línea, revisa el último comando del documento.",
  "errores.latex.desconocido.titulo": "LaTeX encontró un problema en la línea {linea}",
  "errores.latex.entorno_cierre.ayuda": "Haz que el nombre del entorno de cierre coincida con {entorno}.",
  "errores.latex.entorno_cierre.titulo": "El entorno {entorno} termina con {cierre}",
  "errores.latex.entorno_indefinido.ayuda": "Revisa el nombre de {entorno} y que hayas cargado el paquete que lo define.",
  "errores.latex.entorno_indefinido.titulo": "No se reconoce el entorno {entorno}",
  "errores.latex.formato_desbordado.ayuda": "Revisa la línea indicada y ajusta el texto, la fórmula o la imagen para que quepa en el margen.",
  "errores.latex.formato_desbordado.titulo": "Una línea sobresale {puntos} puntos del margen",
  "errores.latex.fuente_indefinida.ayuda": "LaTeX usó otra variante de fuente. Revisa la apariencia del texto y los ajustes de tipografía del documento.",
  "errores.latex.fuente_indefinida.titulo": "Una variante de fuente no está disponible",
  "errores.latex.idioma_espanol_faltante.ayuda": "Folio descarga el idioma español cuando tienes conexión. Conecta el equipo y vuelve a compilar.",
  "errores.latex.idioma_espanol_faltante.titulo": "Falta el idioma español para compilar",
  "errores.latex.imagen_faltante.ayuda": "Agrega la imagen {archivo} a la carpeta indicada o corrige su nombre en el código.",
  "errores.latex.imagen_faltante.titulo": "Falta la imagen {archivo}",
  "errores.latex.indice_aviso.ayuda": "Revisa el detalle del aviso y corrige la entrada indicada antes de volver a compilar.",
  "errores.latex.indice_aviso.titulo": "El índice necesita revisión",
  "errores.latex.indice_rechazadas.ayuda": "Revisa las entradas señaladas en el detalle de la bitácora del índice y vuelve a compilar.",
  "errores.latex.indice_rechazadas.titulo": "{n, plural, one {# entrada del índice rechazada} other {# entradas del índice rechazadas}}",
  "errores.latex.llave_extra.ayuda": "Revisa las llaves y los delimitadores de fórmulas cerca de la línea indicada.",
  "errores.latex.llave_extra.titulo": "Hay una llave de cierre sin pareja",
  "errores.latex.llave_faltante.ayuda": "Agrega la llave de cierre correspondiente y revisa el comando anterior.",
  "errores.latex.llave_faltante.titulo": "Falta cerrar una llave",
  "errores.latex.matematicas_delimitador.ayuda": "Revisa que la fórmula esté entre signos de dólar o dentro de un entorno de matemáticas. Si escribes un guion bajo en texto, antepón una barra invertida.",
  "errores.latex.matematicas_delimitador.titulo": "Falta un delimitador de fórmula",
  "errores.latex.paquete_aviso.ayuda": "Revisa el detalle del aviso y la configuración de {paquete} antes de volver a compilar.",
  "errores.latex.paquete_aviso.titulo": "El paquete {paquete} necesita revisión",
  "errores.latex.referencia_indefinida.ayuda": "Revisa que exista una etiqueta con el nombre {referencia}. Si acabas de agregarla, vuelve a compilar.",
  "errores.latex.referencia_indefinida.titulo": "La referencia {referencia} no está definida",
  "errores.latex.referencias_indefinidas.ayuda": "Revisa las referencias y citas indicadas en los avisos. Si acabas de agregarlas, vuelve a compilar.",
  "errores.latex.referencias_indefinidas.titulo": "Hay referencias sin definir",
  "errores.latex.repetir_pasada.ayuda": "Vuelve a compilar para actualizar las referencias y los enlaces del documento.",
  "errores.latex.repetir_pasada.titulo": "Hace falta volver a compilar",
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
  "errores.latex.archivo_faltante.ayuda": { archivo: string | number };
  "errores.latex.archivo_faltante.titulo": { archivo: string | number };
  "errores.latex.bibliografia_campo_vacio.ayuda_autor": { cita: string | number };
  "errores.latex.bibliografia_campo_vacio.ayuda_otro": { campo: string | number; cita: string | number };
  "errores.latex.bibliografia_campo_vacio.titulo": { cita: string | number };
  "errores.latex.bibliografia_entrada_faltante.ayuda": { cita: string | number };
  "errores.latex.bibliografia_entrada_faltante.titulo": { cita: string | number };
  "errores.latex.bibliografia_faltante.ayuda": { archivo: string | number };
  "errores.latex.bibliografia_faltante.titulo": { archivo: string | number };
  "errores.latex.bibliografia_sintaxis.titulo": { linea: string | number };
  "errores.latex.cita_indefinida.ayuda": { cita: string | number };
  "errores.latex.cita_indefinida.titulo": { cita: string | number };
  "errores.latex.comando_indefinido.ayuda": { comando: string | number };
  "errores.latex.comando_indefinido.titulo": { comando: string | number };
  "errores.latex.desconocido.titulo": { linea: string | number };
  "errores.latex.entorno_cierre.ayuda": { entorno: string | number };
  "errores.latex.entorno_cierre.titulo": { cierre: string | number; entorno: string | number };
  "errores.latex.entorno_indefinido.ayuda": { entorno: string | number };
  "errores.latex.entorno_indefinido.titulo": { entorno: string | number };
  "errores.latex.formato_desbordado.titulo": { puntos: string | number };
  "errores.latex.imagen_faltante.ayuda": { archivo: string | number };
  "errores.latex.imagen_faltante.titulo": { archivo: string | number };
  "errores.latex.indice_rechazadas.titulo": { n: string | number };
  "errores.latex.paquete_aviso.ayuda": { paquete: string | number };
  "errores.latex.paquete_aviso.titulo": { paquete: string | number };
  "errores.latex.referencia_indefinida.ayuda": { referencia: string | number };
  "errores.latex.referencia_indefinida.titulo": { referencia: string | number };
}
