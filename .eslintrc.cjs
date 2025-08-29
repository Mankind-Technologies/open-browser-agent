/* Basic ESLint config for a TypeScript Chrome extension */
module.exports = {
  root: true,
  env: { browser: true, es2021: true, webextensions: true, node: false },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: false,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/stylistic',
    'eslint-config-prettier',
  ],
  ignorePatterns: [
    'build/',
    'node_modules/',
    '**/*.d.ts',
    'background.js',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
};

