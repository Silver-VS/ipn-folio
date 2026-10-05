<!-- SPDX-License-Identifier: CC0-1.0 -->

# config/

- Qué contiene: valores por entorno (`desarrollo.json`, `produccion.json`): `REPO_URL`, `LICENCIA`, `base` y `version`.
- Quién la edita: quien mantiene el proyecto. Se elige con la variable `FOLIO_ENTORNO` (`desarrollo` en `npm run dev`,
  `produccion` en `npm run build`); `FOLIO_BASE` sustituye a `base`.
- Todo lo de aquí es **público**. Nunca van secretos ni correos personales.
- Cómo se valida: `src/acerca.test.ts`.
