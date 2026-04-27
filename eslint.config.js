import globals from 'globals';

export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // Code style: let-first (no prefer-const)
      'prefer-const': 'off',
      // Single quotes
      'quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
      // Always semicolons
      'semi': ['error', 'always'],
      // 2-space indent
      'indent': ['error', 2, { SwitchCase: 1 }],
      // No unused vars (warning, not error — allows during dev)
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Ignore vendored / minified / submodules
    ignores: [
      'node_modules/**',
      'packages/**',
      'tmp/**',
      '.project-graph-cache.json',
    ],
  },
];
