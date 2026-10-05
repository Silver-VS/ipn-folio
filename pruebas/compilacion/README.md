# Prueba de compilación en el navegador

Arnés de la prueba técnica de D4: compila un proyecto LaTeX con BusyTeX (texlyre-busytex 1.4.0) en el navegador y
mide tiempos y descargas. Los resultados se resumen en `docs/DECISIONES.md` (D4 y D8).

No es código de producto: es una página y un servidor de pruebas para uso local.

## Preparar (una vez)

```bash
npm install
npm run activos
```

`npm run activos` descarga los activos de BusyTeX (~520 MB comprimidos, ~690 MB extraídos) a `public/core/busytex`,
que está ignorado por git. La plantilla de prueba se copia a mano en `../../plantillas-locales/TT_UPIITA_2023`
(también ignorada; las plantillas institucionales no se suben).

## Correr

```bash
npm run servir
```

Abre `http://localhost:8765` y pulsa **Compilar**. Opciones:

- `?datos=basic` en la URL: solo precarga `texlive-basic`; lo demás llega por el endpoint remoto.
- `node servidor.mjs 8766 --sin-aislamiento`: sin cabeceras COOP/COEP (como GitHub Pages).
- `node servidor.mjs 8765 <carpeta>`: usar otra plantilla.

El servidor emula el endpoint remoto de TeX Live (`/texlive/<formato>/<archivo>`) con el `kpsewhich` del TeX Live
instalado y anota cada petición en `/texlive/registro.json`. El PDF generado se guarda en
`plantillas-locales/salida-navegador.pdf` para compararlo con el nativo.

## Archivos

- `servidor.mjs`: servidor estático sin dependencias + endpoint remoto emulado.
- `web/index.html`, `web/prueba.js`: página de prueba.
- `web/folio_worker.js`: envoltorio del worker de BusyTeX que agrega el `makeindex` de la nomenclatura.
