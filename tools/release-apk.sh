#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  Build, verify and ship the release APK — CLAUDE.md's release steps 2–3 as
#  one command, for WSL.
#
#      tools/release-apk.sh            # build, verify, commit, push
#      tools/release-apk.sh --no-push  # build and verify only
#
#  The version comes from app.json, so bump it (and commit the code) first.
#  Every trap CLAUDE.md documents is handled here rather than rediscovered:
#  the Linux SDK path, the Windows merger.xml caches, the compressReleaseAssets
#  race (retried once), and the four checks on the BUILT file.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PUSH=1
[ "${1:-}" = "--no-push" ] && PUSH=0

VERSION="$(node -p "require('./app.json').expo.version")"
APK="momentum-$VERSION.apk"
LOG="$ROOT/android-build.log"
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=/root/android-sdk ANDROID_SDK_ROOT=/root/android-sdk
export PATH="$ANDROID_HOME/build-tools/36.0.0:$PATH"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mFAILED: %s\033[0m\n' "$*" >&2; exit 1; }

say "Momentum $VERSION"

# A Windows-installed tree has no Linux lightningcss and fails six minutes in.
node -e "require('./metro.config.js'); process.exit(0)" \
  || die "metro.config.js does not load — see 'THE OTHER TRAP' in CLAUDE.md"

say "expo prebuild"
npx expo prebuild -p android --no-install >>"$LOG" 2>&1 || die "prebuild (see $LOG)"
grep -q 'android.minSdkVersion=26' android/gradle.properties \
  || die "minSdkVersion is not 26 after prebuild"
echo "sdk.dir=/root/android-sdk" > android/local.properties

# Merge records a Windows build left behind hold C:\ paths with no parent here.
for f in $(grep -l 'C:\\Users' node_modules/*/android/build/intermediates/incremental/release/*/merger.xml 2>/dev/null || true); do
  rm -rf "$(dirname "$f")"
done

say "gradle assembleRelease (about 10 minutes; log: $LOG)"
build() {
  (cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a \
    -PWT_STORE_FILE="$PWD/app/debug.keystore" -PWT_STORE_PASSWORD=android \
    -PWT_KEY_ALIAS=androiddebugkey -PWT_KEY_PASSWORD=android) >>"$LOG" 2>&1
}
if ! build; then
  # compressReleaseAssets races itself on this mount; the second pass is cached.
  echo "first pass failed — retrying once"
  build || die "gradle (see the end of $LOG)"
fi

cp android/app/build/outputs/apk/release/app-release.apk "$APK"

say "verifying $APK"
# Each tool's output is captured whole, then searched. Piped straight into
# `head` or `grep -q`, the tool is killed by SIGPIPE when the reader stops early,
# and under `pipefail` that fails the check on a perfectly good APK.
CERTS="$(apksigner verify --print-certs "$APK")"
BADGING="$(aapt2 dump badging "$APK")"
BUNDLE_HITS="$(unzip -p "$APK" assets/index.android.bundle | grep -ac 'cancel-pending' || true)"
grep -q 'CN=Android Debug' <<<"$CERTS" \
  || die "signed with the wrong key — it would not install over the phone's app"
grep -q "versionName='$VERSION'" <<<"$BADGING" \
  || die "versionName in the APK is not $VERSION"
if grep -q 'RECORD_AUDIO' <<<"$BADGING"; then
  die "the APK asks for the microphone"
fi
[ "${BUNDLE_HITS:-0}" -gt 0 ] || die "the bundle does not contain this release's JS"
head -1 <<<"$BADGING"
echo "signature, version, permissions and bundle: OK"

# Keep the previous APK as the rollback; drop anything older.
PREV="$(git ls-files 'momentum-*.apk' | grep -v "$APK" | sort -V | tail -1 || true)"
for old in $(git ls-files 'momentum-*.apk'); do
  [ "$old" = "$APK" ] || [ "$old" = "$PREV" ] || git rm -q "$old"
done

if [ "$PUSH" = 1 ]; then
  say "commit and push"
  git add -f "$APK"
  git commit -q -m "$VERSION: release APK"
  git push -q origin main
fi

say "done: $ROOT/$APK"
