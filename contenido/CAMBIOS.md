<!-- SPDX-License-Identifier: CC0-1.0 -->
# Cambios de contenido

Una línea por cambio: fecha · clave · antes → después · quién.

## 2026.10.1

- 2026-10-05 · `app.*`, `inicio.espacio.aria` · (nuevas) primeras claves de la pantalla inicial · Claude Sonnet (andamiaje).

## 2026.10.2

- 2026-10-05 · `errores.latex.*` · (nuevas) títulos y acciones del lector de bitácoras de TeX, BibTeX e índices · Codex.

## 2026.10.3

- 2026-10-05 · `errores.latex.bibliografia_campo_vacio.*` · `campo_autor`, `campo_otro` y `ayuda` → `ayuda_autor` y `ayuda_otro` (frases completas; el nombre del campo de BibTeX va en `{campo}`) · Claude Sonnet.

## 2026.10.4

- 2026-10-05 · `errores.latex.paquete_error.*`, `bibliografia_vacia.*`, `desconocido_sin_linea.*` · (nuevas) error de paquete, bibliografía vacía y problema sin línea (sin «?») · Claude Sonnet.

## 2026.10.5

- 2026-10-05 · `almacen.*`, `almacen.error.*` · (nuevas) mensajes de error de la capa de almacenamiento local y nombre de proyecto importado · Claude Sonnet (almacén).

## 2026.10.6

- 2026-10-05 · `almacen.aviso.*` · (nuevas) avisos al importar un .zip: codificación convertida y entrada duplicada · Claude Sonnet (almacén).

## 2026.10.7

- 2026-10-05 · `errores.motor.*` · (nuevas) mensajes de error del motor de compilación: cancelado, detenido, abortado, operación fallida, no listo, sin proyecto y ruta no permitida · Claude Sonnet (sesión 03).

## 2026.10.8

- 2026-10-05 · `pie.codigo_fuente_licencia` · (nueva) frase completa del pie, con la licencia como variable; sustituye armar `pie.codigo_fuente` + `(licencia)` en el código · Claude Sonnet (limpieza-01).

## 2026.10.9

- 2026-10-05 · `errores.latex.campos_por_llenar.*`, `campos_por_llenar_sin_entrada.*`, `biber_no_soportado.*`, `motor_detenido.*`, `compilacion.paso.*` · (nuevas) avisos de la revisión previa, de Biber y del motor, y nombres de los pasos del orquestador · Claude Sonnet.

## 2026.10.10

- 2026-10-05 · `compilacion.paso.pasada` · «pasada intermedia» → «nueva pasada», válida también para el último paso · Codex.
- 2026-10-05 · `errores.latex.motor_detenido.ayuda` · frase recibida en `{mensaje}` → frase completa de respaldo; el orquestador usa `errores.motor.<codigo>` para la acción específica · Codex.

## 2026.10.11

- 2026-10-05 · `proyecto.*`, `guardado.*`, `paneles.*`, `distribucion.*`, `compacto.*`, `archivos.*`, `editor.*`, `editor.cm.*`, `pdf.*`, `problemas.*`, `salida.*`, `paleta.*`, `mensajes.*`, `inicio.*` · (nuevas) textos de la pantalla de proyecto: paneles, árbol de archivos, editor, visor de PDF, indicador de guardado, paleta (esqueleto), inicio mínimo y traducción de CodeMirror · Claude Sonnet (sesión 08).

## 2026.10.12

- 2026-10-06 · `archivos.confirmar_borrado` · (nueva) confirmación antes de borrar una carpeta con sus archivos · Codex.
- 2026-10-06 · `editor.cm.coincidencia_actual`, `lineas_plegadas`, `lineas_desplegadas` · frases completas para los avisos de búsqueda y plegado; se retiran `en_linea` y `hasta` · Codex.
- 2026-10-06 · `problemas.donde` · retirada la clave que solo contenía una ruta; se presenta el dato directamente · Codex.
- 2026-10-06 · `pdf.de_total` · se conserva como etiqueta del formulario «Página [campo] de {total}», junto al nombre accesible completo `pdf.pagina_aria` · Codex.

## 2026.10.13

- 2026-10-16 · `papelera.*` · (nuevas) vista única de la papelera: encabezado, caducidad, avisos de tamaño, restaurar, borrar definitivamente, vaciar y avisos de restauración (D29) · Claude Sonnet (sesión 11).
- 2026-10-16 · `archivos.borrado` · «Se borró {ruta}.» → «Se movió {ruta} a la papelera. Tienes {dias} días para recuperarlo.» (único aviso de caducidad, al mandar a la papelera) · Claude Sonnet (sesión 11).
- 2026-10-16 · `editor.borrado_en_otra` · «Otra pestaña borró {ruta}…» → «Se movió {ruta} a la papelera desde otra pestaña…» · Claude Sonnet (sesión 11).
- 2026-10-16 · `proyecto.movido_a_papelera` · (nueva) aviso con «Deshacer» al mandar un proyecto a la papelera · Claude Sonnet (sesión 11).
- 2026-10-16 · `almacen.error.guardado_pendiente`, `elemento_inexistente`, `version_nueva`; `almacen.aviso.version_nueva`, `bloqueada`, `cerrada`, `recargar` · (nuevas) errores y avisos de la papelera y del ciclo de vida de la base entre pestañas (M4) · Claude Sonnet (sesión 11).
- 2026-10-16 · `almacen.error.almacenamiento_lleno` · agrega «vacía la papelera» a la acción sugerida · Claude Sonnet (sesión 11).
- 2026-10-16 · `archivos.confirmar_borrado`, `inicio.papelera`, `inicio.restaurar` · retiradas: mandar a la papelera no pide confirmación y la papelera tiene su propia vista · Claude Sonnet (sesión 11).

## 2026.10.14

- 2026-10-16 · `almacen.error.apertura_fallida`, `almacen.aviso.version_nueva_sin_guardar` · (nuevas) fallo al abrir o migrar la base y aviso de actualización cuando no alcanzó a guardar lo pendiente · Claude Sonnet (sesión 11, arreglos).
