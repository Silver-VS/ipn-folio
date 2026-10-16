<!-- SPDX-License-Identifier: CC0-1.0 -->

# config/

- Qué contiene: valores por entorno (`desarrollo.json`, `produccion.json`): `REPO_URL`, `LICENCIA`, `base` y `version`.
- Quién la edita: quien mantiene el proyecto. Se elige con la variable `FOLIO_ENTORNO` (`desarrollo` en `npm run dev`,
  `produccion` en `npm run build`); `FOLIO_BASE` sustituye a `base`.
- Todo lo de aquí es **público**. Nunca van secretos ni correos personales.
- Cómo se valida: `src/acerca.test.ts`. `vite.config.ts` inyecta solo el JSON del entorno elegido (`__FOLIO_CONFIG__`).
- Bloque `papelera` (D29): `diasPorOmision` (30) y `opcionesDias` (7, 30, 90) son los días que lo borrado espera en la
  papelera; `margenDias` (1) se suma antes de purgar; `intervaloPurgaHoras` (6) separa dos purgas al volver a la pestaña;
  `avisoMegas` (100) y `avisoFraccionUso` (0.25) fijan cuándo la vista avisa que la papelera ocupa mucho; `urlHora`
  es un archivo del propio sitio al que se le pide la hora (cabecera `Date`) y debe existir en `public/`.
