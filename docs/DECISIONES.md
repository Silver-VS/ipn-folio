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
| D9 | 2026-10-05 | **Usar solo los paquetes de TeXlyre** (BusyTeX, lenguaje de CodeMirror), no un fork del editor; orquestador de compilación propio. | Mantiene el código de Folio separable y deja opciones al IPN; la prueba mostró que hay que controlar la carga de paquetes y los pasos (nomenclatura, índices). | TeXlyre ofrece algo que costaría mucho rehacer. |
| D10 | 2026-10-05 | **Paneles acomodables** al estilo de los IDE de JetBrains: editor, PDF, archivos, errores y salida se pueden mover, apilar, ocultar o sacar a otra ventana; la distribución se recuerda. | Cada quien trabaja distinto y en pantallas distintas; un diseño fijo no sirve igual en laptop y en monitor externo. | — |
| D11 | 2026-10-05 | **Instalación por herramientas:** al empezar, el usuario elige qué usará (LaTeX, cuadernos, Octave, …) y solo se descarga lo necesario, indicando el tamaño de cada componente; se pueden agregar después. | Nadie debería descargar todo (p. ej., 90 MB de TeX Live) para usar solo cuadernos. | — |
| D12 | 2026-10-05 | **La app de escritorio complementa a la web, no la duplica:** lo que la web hace bien se queda en la web; el escritorio aporta solo lo que la web no puede o hace mal (Java/JShell, Octave nativo, compiladores, MCP). | Que tener dos apps tenga sentido. | — |
| D13 | 2026-10-05 | **Plantillas por unidad académica:** se filtran por unidad (la del usuario por omisión); cada unidad puede tener las suyas. | La mayoría de las unidades tiene plantillas propias. | — |
| D14 | 2026-10-05 | **La ayuda de IA depende del origen del documento:** en documentos propios (de alumno o docente) la decide el usuario; en actividades que un docente crea para su grupo, la configura el docente (modo tutor). | Respeta la autonomía del usuario y la integridad académica en actividades evaluadas. | — |
| D15 | 2026-10-05 | **Descargas solo con Wi‑Fi como ajuste** (activado por omisión), como las tiendas de apps; si está apagado, se pregunta antes de usar datos móviles. | Cuida los datos móviles del alumnado sin bloquear a quien sí quiere descargar. | — |
| D16 | 2026-10-05 | **Rol al primer uso:** estudiante o docente, con opción de iniciar sesión con la cuenta institucional de Microsoft para vincular OneDrive. | El rol define la interfaz (actividades, revisión) y la cuenta, el almacenamiento. | — |
| D17 | 2026-10-05 | **Plantillas propuestas por la comunidad:** cada unidad puede proponer plantillas a un repositorio común (hospedado en un OneDrive institucional de IPN-tools); si una unidad no tiene, se muestra «Proponer una plantilla» y las generales del IPN. | Las plantillas las conocen mejor las propias unidades. | TI no otorga la cuenta institucional. |
| D18 | 2026-10-05 | **Conversación con IA en modo tutor:** guardarla con la entrega viene apagado y lo decide el alumno; el docente puede exigirlo en una actividad, con aviso previo. | Privacidad del alumno; transparencia cuando se exige. | — |
| D19 | 2026-10-05 | **Figuras de Octave:** dentro de Folio como meta y en ventana aparte como respaldo; se decide con una prueba técnica en la capa C. | No está verificado que Octave pueda dibujar dentro de otra app. | — |

## Pendientes de decidir

- **Java:** propuesta — solo en escritorio (javac nativo) salvo acuerdo educativo con CheerpJ.
- **Prueba en el tenant del IPN con TI** (consentimiento, socketIo en carpetas compartidas, tope real). No bloquea hasta la capa D.
- Materias prioritarias de la capa B; plantillas oficiales para pruebas.
- Permiso de los autores de UpiiTeXis (LPPL + CC-BY-SA) para ofrecerla dentro de Folio.
