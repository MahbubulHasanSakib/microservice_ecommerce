module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2021,
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: ['plugin:@typescript-eslint/recommended'],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: [
    '.eslintrc.js',
    'dist/',
    'node_modules/',
    'coverage/',
    '**/prisma/client/**',
    '*.js',
    '!jest.config.ts',
  ],
  rules: {
    // Enforce no-any with exceptions for genuinely dynamic scenarios
    '@typescript-eslint/no-explicit-any': 'warn',
    // Unused vars are errors — force clean code
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // No console.log in production code — use Pino logger
    'no-console': 'error',
    // Allow void return types to be inferred
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // Allow empty constructors for NestJS patterns
    '@typescript-eslint/no-empty-function': 'off',
  },
};
