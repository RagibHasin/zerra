import js from '@eslint/js';
import query from '@tanstack/eslint-plugin-query';
import router from '@tanstack/eslint-plugin-router';
import prettier from 'eslint-config-prettier/flat';
import i18next from 'eslint-plugin-i18next';
import _import from 'eslint-plugin-import';
import jsxA11Y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import ts from 'typescript-eslint';

export default defineConfig([
  js.configs.recommended,
  ts.configs.recommendedTypeChecked,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs['recommended-latest'],
  _import.flatConfigs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ..._import.flatConfigs.typescript,
    files: ['**/*.{ts,tsx}'],
  },
  i18next.configs['flat/recommended'],
  jsxA11Y.flatConfigs.strict,
  router.configs['flat/recommended'],
  query.configs['flat/recommended'],
  prettier,
  { rules: { curly: ['error', 'multi-line'] } },
  globalIgnores(['dist/*']),
]);
