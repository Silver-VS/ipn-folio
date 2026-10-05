# IPN Folio — Decisiones

Registro de decisiones tomadas. Cada una dice qué, por qué y qué la reabriría. Contexto en `VISION.md`; componentes y
despliegue en `ARQUITECTURA.md`.

| # | Fecha | Decisión | Por qué | Se reabre si… |
|---|---|---|---|---|
| D1 | 2026-10-04 | **Código abierto, AGPL-3.0.** | Permite partir de TeXlyre / TeXlyre-BusyTeX y `codemirror-lang-latex` (AGPL). El proyecto ya es de libre acceso. | El IPN exige otra licencia. |
| D2 | 2026-10-04 | **Repositorio aparte `ipn-folio`** (cuenta del dueño); producto «IPN Folio». Se incorpora a IPN-tools al terminar la v1, como app enlazada (no se mezcla código con IPN-tools, que no es AGPL). | El motor WASM, el empaquetado y su tamaño no caben en el esquema de plantilla única de Horarios. | — |
| D3 | 2026-10-04 | **Sin servidores propios.** Web estática → PWA → escritorio Tauri 2. | El IPN tiene pocos servidores. | El IPN ofrece hospedaje. |
| D4 | 2026-10-04 | **LaTeX en el navegador con BusyTeX** (TeX Live 2026, pdfTeX/XeTeX/LuaTeX, Biber, SyncTeX), evaluando partir de TeXlyre. Paquetes bajo demanda y en caché de la PWA. **Confirmada el 2026-10-05:** la plantilla de Trabajo Terminal UPIITA compiló en el navegador con BusyTeX y el PDF fue idéntico al de TeX Live nativo. | Única opción mantenida y completa; SwiftLaTeX (TL 2020) y texlive.js abandonados. | La compilación falla en tesis reales más largas. |
| D5 | 2026-10-04 | **Aislamiento entre orígenes con `coi-serviceworker`** en GitHub Pages. | Pyodide (`input()`), compiladores WASM y wllama necesitan SharedArrayBuffer; Pages no permite cabeceras COOP/COEP. BusyTeX (LaTeX) **no** lo necesita (prueba 2026-10-05). | Cambia el hospedaje. |
| D6 | 2026-10-04 | **IA sin servidor:** «Copiar para IA» (todos), MCP por stdio en la app de escritorio, OpenRouter OAuth o clave propia, modelo local opcional (Qwen3 / SmolLM3 / Phi-4-mini; nunca Qwen2.5-3B), búsqueda semántica con multilingual-e5-small. Nunca usar sesiones de ChatGPT de terceros. | Mantiene la IA bajo control del alumno y sin costo de hospedaje; usar sesiones de terceros va contra los términos del proveedor. | Se estabiliza «Sign in with ChatGPT» o WebMCP. |
| D7 | 2026-10-04 | **Colaboración local-first:** Yjs + y-indexeddb como base; OneDrive como canal (socketIo + delta, sondeo adaptativo); WebRTC como acelerador opcional. | Viable con latencia de segundos; tope de Graph por tenant (~50–260 editores simultáneos estimados). | Falla la prueba en el tenant del IPN. |
| D8 | 2026-10-05 | **Paquetes TeX faltantes (español de babel, fuentes) desde un espejo de archivos estáticos:** hoy en GitHub Pages; después, réplica en un alojamiento del IPN junto con IPN-tools. | BusyTeX pide archivos con `GET <endpoint>/<formato>/<archivo>`, que se sirve con archivos estáticos, sin servidor de aplicación. | El IPN ofrece otro hospedaje. |

## Pendientes de decidir

- **Java:** propuesta — solo en escritorio (javac nativo) salvo acuerdo educativo con CheerpJ.
- **Prueba en el tenant del IPN con TI** (consentimiento, socketIo en carpetas compartidas, tope real). No bloquea hasta la capa D.
- Materias prioritarias de la capa B; plantillas oficiales para pruebas.
- ¿Partir de un fork de TeXlyre o usar solo sus paquetes (BusyTeX, lenguaje de CodeMirror)? La prueba técnica sugiere
  usar solo los paquetes y escribir un orquestador de compilación propio.
- Permiso de los autores de UpiiTeXis (LPPL + CC-BY-SA) para ofrecerla dentro de Folio.
