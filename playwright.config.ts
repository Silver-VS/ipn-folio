// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PUERTO = 4173;
// Banco de compilación (e2e/banco): lo empaqueta y sirve Vite (build propio) y solo se levanta si hay activos de BusyTeX.
const PUERTO_BANCO = 4174;
const hayActivos = existsSync('public/busytex/busytex.wasm');

// Tres perfiles: escritorio (Chromium), móvil (Chromium emulando un teléfono) y WebKit (motor de Safari).
// Los navegadores se buscan en PLAYWRIGHT_BROWSERS_PATH (en este equipo: D:\Tools\playwright-browsers).
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${PUERTO}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'movil',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: `npm run build && npm run preview -- --port ${PUERTO} --strictPort`,
      url: `http://localhost:${PUERTO}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    ...(hayActivos
      ? [
          {
            command: `npx vite build --config e2e/banco/vite.config.ts && npx vite preview --config e2e/banco/vite.config.ts --port ${PUERTO_BANCO} --strictPort`,
            url: `http://localhost:${PUERTO_BANCO}/e2e/banco/index.html`,
            reuseExistingServer: !process.env.CI,
            timeout: 180_000,
          },
        ]
      : []),
  ],
});
