/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(mp3|wav|ogg)$': '<rootDir>/src/test/__mocks__/fileMock.js',
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setupTests.ts'],
};

