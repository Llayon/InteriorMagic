import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'playwright-report',
      'test-results',
      '**/.wrangler',
      'workers/**/worker-configuration.d.ts',
      // K1 local-only evidence workspace (gitignored).
      // The 4 dirs under .agent-data hold throw-away scripts, debug probes,
      // and binary evidence — they are NEVER committed. Ignoring them from
      // lint keeps the lint signal focused on files that actually ship.
      '.agent-data/**',
      '.agent-worktrees/**',
      '.worktrees/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': hooks, 'react-refresh': refresh },
    rules: { ...hooks.configs.recommended.rules, ...refresh.configs.vite.rules },
  },
  {
    files: [
      'scripts/**/*.mjs',
      'playwright.config.ts',
      'tests/**/*.ts',
      'tests/**/*.mjs',
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
