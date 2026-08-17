import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: {
        paths: {
          '@ecommerce/shared': ['<rootDir>/../../libs/shared/src'],
          '@ecommerce/shared/*': ['<rootDir>/../../libs/shared/src/*'],
        },
      },
    }],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@ecommerce/shared(.*)$': '<rootDir>/../../libs/shared/src$1',
  },
};

export default config;
