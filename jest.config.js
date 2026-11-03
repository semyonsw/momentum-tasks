/**
 * Jest, for RENDER tests only — `*.render.test.tsx`.
 *
 * Everything else stays on vitest (`vitest.config.ts`): decisions live in
 * `src/lib` as pure functions and are tested there. What a pure test cannot
 * reach is a bug that only exists between React and the screen — a roll whose
 * late callback pinned a stale offset, a DONE that logged twice on a double-tap.
 * Those need a renderer and a thumb, which is what `jest-expo` and Testing
 * Library give. Rejected: rendering under vitest, which would mean mocking
 * `react-native` by hand — the one thing `vitest.config.ts` refuses to do.
 *
 * Run with `node node_modules/jest/bin/jest.js` from WSL: the `.bin` shims in
 * this shared tree fall through to the Windows `node.exe`.
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.render.test.tsx'],
  setupFiles: ['<rootDir>/test/jestSetup.js'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '<rootDir>/test/asyncStorageStub.ts',
    '^expo-audio$': '<rootDir>/test/expoAudioStub.ts',
  },
};
