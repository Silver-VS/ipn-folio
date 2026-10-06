// SPDX-License-Identifier: AGPL-3.0-or-later
import js from '@eslint/js';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      'pruebas/',
      'docs/',
      'plantillas-locales/',
      'playwright-report/',
      'test-results/',
      'coverage/',
      'public/busytex/',
      '.cache-activos/',
      '.cache-banco/',
      'espejo-local/',
      'src/textos/es.gen.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    // Ningún color fijo ni nombres de variables antiguos en el código: solo tokens --ipn-*.
    files: ['src/**/*.{svelte,ts}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/--(bg|sf|ac|tx|mu|ln)\\b/]',
          message: 'Usa los tokens semánticos --ipn-* (ver @ipn/comun).',
        },
      ],
    },
  },
);
