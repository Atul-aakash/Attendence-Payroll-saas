module.exports = {
  env: { es2020: true, node: true },
  extends: ['eslint:recommended'],
  parserOptions: { ecmaVersion: 2020 },
  rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] },
};
