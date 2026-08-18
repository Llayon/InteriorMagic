import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';
export default tseslint.config({ignores:['dist']},js.configs.recommended,...tseslint.configs.recommended,{files:['**/*.{ts,tsx}'],languageOptions:{ecmaVersion:2022,globals:globals.browser},plugins:{'react-hooks':hooks,'react-refresh':refresh},rules:{...hooks.configs.recommended.rules,...refresh.configs.vite.rules}},{files:['scripts/**/*.mjs'],languageOptions:{globals:globals.node}});
