/**
 * Vitest config.
 *
 * `lib/` is pure and needs nothing. The STORES are worth testing too — a bad
 * rehydration and an unstable selector were both crashes on a screen —
 * and they reach `@react-native-async-storage/async-storage`, which cannot load
 * outside a native runtime. One alias to an in-memory stub buys the whole state
 * layer without pulling in a React Native test harness.
 *
 * Nothing here mocks `react-native` itself, deliberately: a test that needs it is
 * a test of a component, and components are verified by running the app.
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@react-native-async-storage/async-storage',
        replacement: resolve(__dirname, 'test/asyncStorageStub.ts'),
      },
    ],
  },
  test: {
    include: ['src/**/*.test.ts'],
    /*
     * The guard tests (`theme`, `appGuide`) read every file in
     * `src/`, and from WSL the repo is on the Windows mount: under a full parallel
     * run that read alone can pass the default 5 s. The assertions are cheap; it
     * is the disk that is slow, so the budget is raised rather than the checks cut.
     */
    testTimeout: 20000,
  },
});
