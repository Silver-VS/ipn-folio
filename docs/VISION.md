# IPN Folio — Visión (borrador, 2026-10-04)

Estado: lluvia de ideas (fase 0). Nada aquí está decidido hasta pasar a `DECISIONES.md`.
Antecedente: un Folio de escritorio previo (plugin de IntelliJ en Kotlin). Se reutilizan
ideas (analizador de LaTeX, modelo de proyecto, «documento rápido», modo de aprendizaje), no código.

## Qué es

La versión institucional del IPN de un entorno académico en web: editor LaTeX (tipo Overleaf) y cuadernos
(tipo Jupyter) sobre una misma base, para todas las materias: programación, matemáticas, química, electrónica, etc.

## Principios

1. **Sin servidores propios.** Todo corre en el navegador del alumno; el IPN tiene pocos servidores.
2. **Los datos son del alumno.** Almacenamiento local y en su OneDrive institucional (cuenta `ipnt`, Microsoft Graph).
3. **Ocultar la complejidad.** El alumno elige «Python · C · C++ · Java · R», no «kernels».
4. **Crece al instalarse.** Web → PWA (sin conexión) → escritorio con Tauri (compiladores nativos, MCP).
5. **La IA es del alumno.** Nosotros no hospedamos modelos: clave propia, MCP o modelo local opcional.
6. **Formatos abiertos y en texto plano.** Importa y exporta `.tex` e `.ipynb`; sincronizable y versionable.

## Arquitectura conceptual

- **Base común:** almacenamiento (IndexedDB/OPFS + OneDrive), cuenta, editor de código (CodeMirror 6 probable),
  motores de ejecución, exportación a PDF (LaTeX; Typst para vista rápida), sistema de componentes.
- **Vistas:** editor LaTeX · cuaderno por celdas · documento mixto (texto + LaTeX + código + componentes).
- **Componentes:** ecuación visual, gráfica, molécula, circuito, Arduino simulado, diagrama… usables desde cualquier vista.
- **Motores:** navegador (Pyodide, clang WASM, webR, …) o nativos en escritorio; la app ofrece lo que esté disponible.

## Colaboración

- Asíncrona: compartir la carpeta del proyecto en OneDrive.
- «Casi tiempo real» sin servidor: documento CRDT (Yjs); cada participante escribe sus actualizaciones como archivos en la
  carpeta compartida y lee las ajenas cada 3–10 s. Mejora opcional: WebRTC directo cuando ambos están en línea.

## IA

- Clave API propia (OpenAI, Anthropic, Gemini), guardada solo en el navegador; consentimiento explícito antes de enviar contenido.
- No usar sesiones de ChatGPT de terceros (contra términos).
- Servidor MCP en la app de escritorio: el asistente del alumno lee el cuaderno, ejecuta celdas y explica errores.
- Base de conocimiento estructurada (temarios, mapas curriculares, plantillas, guías, ejercicios) en Markdown/JSON + `llms.txt`.
- Modelo abierto en el navegador (WebLLM/transformers.js) como opción para equipos con WebGPU; búsqueda semántica para todos.
- «Modo tutor» configurable por el profesor: explica en vez de resolver (integridad académica).

## Capas de construcción

| Capa | Contenido |
|---|---|
| A | Base común: almacenamiento local + OneDrive, PWA, editor LaTeX con compilación en navegador |
| B | Cuaderno: Python + matemáticas; selector de lenguaje sin «kernels» |
| C | C/C++/Java (navegador y escritorio Tauri); componentes por área |
| D | Colaboración: CRDT sobre OneDrive; WebRTC opcional |
| E | IA: base de conocimiento, MCP, clave propia, modelo local, modo tutor |

## Preguntas abiertas

- ¿Materias prioritarias para la capa B?
- Plantillas oficiales (tesis, protocolo, reportes) para los casos de prueba.
