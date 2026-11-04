/**
 * The release's fingerprint in the bundle: `momentum-tasks-build-<version>`, set
 * by `tools/release-apk.sh` for the prebuild and the gradle run, and empty
 * anywhere else.
 *
 * The script greps the finished `index.android.bundle` for it. A version string
 * alone proves little — it is in `app.json`, not in the JS — while this one
 * exists only in JS bundled by THIS run, so stale cached JS fails the check.
 * Plain ASCII, so Hermes keeps it greppable (CLAUDE.md). The launch screen wears
 * it as its `testID`, so it is never an unused export a bundler could be tempted
 * to drop.
 */
export const BUILD_MARK: string = process.env.EXPO_PUBLIC_BUILD_MARK ?? '';
