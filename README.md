# IPN Folio

Editor LaTeX y cuadernos académicos en el navegador, sin servidores, para el alumnado del IPN.

**Estado:** en diseño. La prueba de compilación ya se hizo: una plantilla de Trabajo Terminal UPIITA compila en el
navegador con BusyTeX y el PDF es idéntico al de TeX Live nativo.

## Documentos

- [Visión](docs/VISION.md)
- [Arquitectura](docs/ARQUITECTURA.md)
- [Decisiones](docs/DECISIONES.md)
- [Prueba de compilación](pruebas/compilacion/README.md)

## Desarrollo

Requisitos: Node 24 o superior y npm. Los textos, colores y datos compartidos vienen de
`ipn-comun` (dependencia `@ipn/comun`).

```
npm ci                # instala dependencias
npm run dev           # servidor de desarrollo
npm run verificar     # contenido, lint, tipos, pruebas, licencias y build
npm run contenido     # solo las pruebas de contenido (claves, variables, plurales, voz, enlaces)
npm run e2e           # pruebas de navegador: escritorio, móvil y WebKit (requiere `npx playwright install chromium webkit`)
```

Configuración por entorno en `config/` (`FOLIO_ENTORNO=desarrollo|produccion`, `FOLIO_BASE` para la ruta base).

**Encabezado SPDX.** Todo archivo de código empieza con `SPDX-License-Identifier: AGPL-3.0-or-later`
(`<!-- … -->` en `.svelte` y `.html`). Los archivos de `contenido/` llevan `CC0-1.0`; los JSON de `config/` no
llevan encabezado.

**Cómo cambiar un texto.** Los textos de la interfaz están en `contenido/textos/es.toml`; el código los pide por
clave con `t('pantalla.bloque.elemento')`. Edita el texto, sube `version` y anota el cambio en
`contenido/CAMBIOS.md`; luego corre `npm run contenido`. Los textos que comparte con otros productos están en
`ipn-comun`.

## Licencia

[GNU AGPL v3](LICENSE).
