# IPN Folio — Arquitectura

Qué componentes tiene Folio y cómo se despliega y migra. Las decisiones que la sustentan están en `DECISIONES.md`
(D3, D4, D8); el contexto, en `VISION.md`. Lo marcado **Planeado** aún no existe; lo demás se comprobó con la prueba de
compilación (`pruebas/compilacion/`).

## Principio

Folio es una aplicación **estática**: todo se ejecuta en el navegador del alumno y no hay base de datos ni servidor de
aplicación (D3). Lo único que hospeda es archivos.

## Componentes

| Componente | Función | Estado |
|---|---|---|
| Sitio estático (la app) | Interfaz, editor y almacenamiento local | Planeado |
| Compilación LaTeX | BusyTeX (TeX Live 2026, WebAssembly) dentro de un Web Worker, para no bloquear la interfaz | Probado en `pruebas/compilacion/` |
| Paquetes de datos de TeX Live | `basic` se precarga una vez (la primera descarga, con el WASM, son ~128 MB sin comprimir; menos con compresión del servidor, por medir en el hospedaje real); el resto se pide bajo demanda | Probado |
| Espejo estático de TeX Live | Archivos que BusyTeX no trae (español de `babel`, Montserrat, `bbding`, `fourier`…), servidos con `GET <endpoint>/<formato>/<archivo>` (D8) | Planeado (la prueba lo emuló con un servidor local) |
| Caché local | Paquetes de datos en IndexedDB; archivos del espejo en Cache API u OPFS para trabajar sin conexión | Paquetes de datos: probado. Caché de archivos del espejo: Planeado |
| Orquestador de compilación | Decide qué paquetes cargar y encadena pasadas de TeX, BibTeX, `makeindex` y nomenclatura, con errores en español | Prototipo en la prueba; versión de producto: Planeado |
| PWA y escritorio | Uso sin conexión (PWA) y compiladores nativos (Tauri 2) | Planeado |

## Compilación LaTeX

1. El worker carga BusyTeX y el paquete de datos `basic` (~128 MB sin comprimir la primera vez, WASM incluido; después queda en IndexedDB).
2. El orquestador revisa el proyecto y ejecuta las pasadas necesarias (pdfLaTeX, BibTeX, `makeindex`, nomenclatura).
3. Cuando TeX pide un archivo que no está en `basic`, el worker lo solicita al espejo estático. En la prueba con la
   plantilla de Trabajo Terminal UPIITA fueron 82 archivos y 4,0 MB.
4. Las compilaciones siguientes reutilizan la caché local. En la prueba, la segunda compilación tardó entre 4 y 9 s,
   según la configuración; la primera, de 39 a 60 s.

El aislamiento entre orígenes (COOP/COEP) no hace falta para LaTeX; sí lo necesitan otros motores futuros (D5).

## Despliegue y migración al IPN

Hoy el sitio se publica en GitHub Pages. Para mudarlo a un alojamiento del IPN (por ejemplo, junto con IPN-tools) basta
copiar archivos estáticos:

1. La aplicación (HTML, JS, CSS).
2. Los activos de BusyTeX (WebAssembly, workers y paquetes de datos).
3. El espejo de TeX Live, conservando la estructura `<formato>/<archivo>` (algunos formatos se piden sin extensión, así
   que los archivos se guardan con el nombre exacto que se solicita).

No se requiere base de datos, servidor de aplicación ni cambios de código más allá de la URL del espejo.
