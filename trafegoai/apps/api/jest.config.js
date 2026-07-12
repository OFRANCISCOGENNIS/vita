/** Jest + ts-jest — testes de unidade das funções puras (métricas, cripto). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
};
