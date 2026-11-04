#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  Build, verify and ship the release APK — CLAUDE.md's release steps 2–3 as
#  one command, for WSL.
#
#      tools/release-apk.sh                  # build, verify, commit, push
#      tools/release-apk.sh --no-push        # build and verify only
#      PROBE='some new string' tools/release-apk.sh   # bundle check for THIS release
#
#  The APK lands at the repo root as momentum-tasks-<version>.apk. The version
#  comes from app.json, so bump it (and commit the code) first.
#
#  Every trap CLAUDE.md documents is handled here rather than rediscovered:
#  the Linux SDK path, the Windows merger.xml caches, the compressReleaseAssets
#  race (retried once), and the checks on the BUILT file. Two more:
#
#  - `npx expo` is NOT used. The `.bin/expo` shim in a shared Windows/WSL tree
#    runs the Windows node.exe, which does not see WSL's environment — so the
#    build mark below would never reach the bundle.
#    `node node_modules/expo/bin/cli` is the Linux node, with the env intact.
#  - Metro's transform cache is not keyed on env values, so a cached
#    `buildMark.ts` would ship the previous release's mark. The cache is deleted
#    and Metro is told to reset it, and the built bundle is checked for a mark
#    only THIS build can contain (EXPO_PUBLIC_BUILD_MARK, below).
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PUSH=1
for arg in "$@"; do
  case "$arg" in
    --no-push) PUSH=0 ;;
    *) echo "usage: tools/release-apk.sh [--no-push]" >&2; exit 2 ;;
  esac
done

VERSION="$(node -p "require('./app.json').expo.version")"
PKG=com.semyonsw.momentum.tasks
APK="momentum-tasks-$VERSION.apk"
LOG="$ROOT/android-build.log"
EXPO=(node node_modules/expo/bin/cli)
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=/root/android-sdk ANDROID_SDK_ROOT=/root/android-sdk
export PATH="$ANDROID_HOME/build-tools/36.0.0:$PATH"
# `prebuild --clean` stops to ask about uncommitted changes; android/ is
# generated and gitignored, so there is nothing there to protect.
export EXPO_NO_GIT_STATUS=1
# Read back from the bundle below. Unique to this version, so neither a stale
# transform nor last release's bundle can pass for it.
export EXPO_PUBLIC_BUILD_MARK="momentum-tasks-build-$VERSION"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mFAILED: %s\033[0m\n' "$*" >&2; exit 1; }

say "Tasks $VERSION"

# A Windows-installed tree has no Linux lightningcss and fails six minutes in.
node -e "require('./metro.config.js'); process.exit(0)" \
  || die "metro.config.js does not load — see 'THE OTHER TRAP' in CLAUDE.md"

# The two-second check that the config resolves to the phone's package, before
# ten minutes are spent finding out from the APK.
got="$("${EXPO[@]}" config --type public --json 2>/dev/null \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).android.package))")"
[ "$got" = "$PKG" ] || die "the config gives the package $got, not $PKG"

say "expo prebuild --clean ($PKG)"
# --clean so nothing an older android/ held survives. It regenerates
# android/app/debug.keystore — the same stock bytes every time, which the
# certificate check on the APK confirms.
"${EXPO[@]}" prebuild -p android --clean --no-install >>"$LOG" 2>&1 || die "prebuild (see $LOG)"
echo "sdk.dir=/root/android-sdk" > android/local.properties

# Merge records a Windows build left behind hold C:\ paths with no parent here.
for f in $(grep -l 'C:\\Users' node_modules/*/android/build/intermediates/incremental/release/*/merger.xml 2>/dev/null || true); do
  rm -rf "$(dirname "$f")"
done

# Metro's cache would hand this build the previous one's inlined mark.
rm -rf "$(node -p "require('os').tmpdir()")"/metro-* node_modules/.cache/metro
sed -i 's|^\(\s*\)// extraPackagerArgs = \[\]|\1extraPackagerArgs = ["--reset-cache"]|' android/app/build.gradle
grep -q 'extraPackagerArgs = \["--reset-cache"\]' android/app/build.gradle \
  || die "could not set --reset-cache in android/app/build.gradle (template changed?)"

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
# `head` or `grep -q`, the tool is killed by SIGPIPE when the reader stops
# early, and under `pipefail` that fails the check on a perfectly good APK.
certs="$(apksigner verify --print-certs "$APK")"
badging="$(aapt2 dump badging "$APK")"
bundle="$(mktemp)"
unzip -p "$APK" assets/index.android.bundle >"$bundle"
hits() { grep -ac -- "$1" "$bundle" || true; }

grep -q 'CN=Android Debug' <<<"$certs" \
  || die "signed with the wrong key — it would not install over the phone's app"
grep -q "package: name='$PKG'" <<<"$badging" \
  || die "$APK is not $PKG — it would install as a different app"
grep -q "versionName='$VERSION'" <<<"$badging" \
  || die "versionName in the APK is not $VERSION"
if grep -q 'RECORD_AUDIO' <<<"$badging"; then
  die "the APK asks for the microphone"
fi
if grep -q 'android.permission.health' <<<"$badging"; then
  die "the APK asks for a Health Connect permission it never uses"
fi
# The mark proves the JS is THIS build's (see the header).
[ "$(hits "$EXPO_PUBLIC_BUILD_MARK")" -gt 0 ] \
  || die "the bundle does not carry $EXPO_PUBLIC_BUILD_MARK — stale JS"
# PROBE: an ASCII string this release's JS introduced (see CLAUDE.md on Hermes).
if [ -n "${PROBE:-}" ]; then
  [ "$(hits "$PROBE")" -gt 0 ] || die "the bundle does not contain '$PROBE'"
fi
rm -f "$bundle"
head -1 <<<"$badging"
grep "application-label:" <<<"$badging" || true
echo "signature, package, version, permissions and bundle: OK"

# Old APKs stay where they are: each is a rollback (CLAUDE.md), and removing
# one is the owner's call, not a side effect of a release.
if [ "$PUSH" = 1 ]; then
  say "commit and push"
  git add -f "$APK"
  git commit -q -m "$VERSION: release APK"
  git push -q origin main
fi

say "done"
echo "  $ROOT/$APK"
