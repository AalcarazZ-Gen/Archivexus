// @ts-check
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

/**
 * Foundry VTT's own global namespace (Hooks, game, ui, CONFIG, ...) — the
 * reserved words a Foundry module runs inside, declared as ambient globals
 * in src/adapters/foundry/foundry-globals.d.ts so `tsc` can check code that
 * touches them without a real @league-of-foundry-developers/foundry-vtt-types
 * dependency (see ADR-0006). ESLint's `no-undef` doesn't read `.d.ts`
 * ambient declarations, so it needs the same names told to it directly here.
 * Keep this list in sync with foundry-globals.d.ts: add a name to both
 * files together, never just one.
 */
const FOUNDRY_ADAPTER_GLOBALS = {
  Hooks: 'readonly',
};

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Foundry's reserved globals, plus `console` — this is the only part
    // of the package that logs, and the project's tsconfig deliberately
    // omits the DOM/Node lib globals (Core stays platform-agnostic), so
    // `console` needs the same ambient/eslint-globals treatment as Hooks.
    files: ['src/adapters/foundry/**/*.ts'],
    languageOptions: {
      globals: {
        ...FOUNDRY_ADAPTER_GLOBALS,
        console: 'readonly',
      },
    },
  },
  prettier,
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
];
