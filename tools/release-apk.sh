#!/usr/bin/env bash
# ---------------------------------------------------------------------------
#  Build, verify and ship the release APKs — CLAUDE.md's release steps 2–3 as
#  one command, for WSL.
#
#      tools/release-apk.sh                  # all three apps, verify, commit, push
#      tools/release-apk.sh tasks            # just one: workout | tasks | expenses
#      tools/release-apk.sh --no-push        # build and verify only
#      PROBE='some new string' tools/release-apk.sh   # bundle check for THIS release
#
#  Since 3.0.0 Momentum is three apps from one tree (`src/lib/appVariant.ts`),
#  switched by EXPO_PUBLIC_APP_VARIANT. Each one is built in turn and lands at
#  the repo root as momentum-<variant>-<version>.apk.
#
#  The version comes from app.json, so bump it (and commit the code) first.
#  Every trap CLAUDE.md documents is handled here rather than rediscovered:
#  the Linux SDK path, the Windows merger.xml caches, the compressReleaseAssets
#  race (retried once), and the checks on the BUILT file. Two more are new with
#  the variants:
#
#  - `npx expo` is NOT used. The `.bin/expo` shim in this shared tree runs the
#    Windows node.exe, which does not see WSL's environment — so the variant
#    never reached app.config.js and every "Tasks" prebuild came out as Workout.
#    `node node_modules/expo/bin/cli` is the Linux node, with the env intact.
#  - The variant is inlined into the bundle by Babel, and Metro's transform cache
#    is not keyed on env values: a cached `appVariant.ts` from the previous
#    variant would ship in this one. So the cache is deleted and Metro is told to
#    reset it, every variant, and the built bundle is checked for a mark only
#    this variant's build can contain (EXPO_PUBLIC_BUILD_MARK, below).
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PUSH=1
WANT=()
for arg in "$@"; do
  case "$arg" in
    --no-push) PUSH=0 ;;
    workout | tasks | expenses) WANT+=("$arg") ;;
    all) WANT=(workout tasks expenses) ;;
    *) echo "usage: tools/release-apk.sh [workout|tasks|expenses|all] [--no-push]" >&2; exit 2 ;;
  esac
done
[ "${#WANT[@]}" -gt 0 ] || WANT=(workout tasks expenses)

VERSION="$(node -p "require('./app.json').expo.version")"
LOG="$ROOT/android-build.log"
EXPO=(node node_modules/expo/bin/cli)
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=/root/android-sdk ANDROID_SDK_ROOT=/root/android-sdk
export PATH="$ANDROID_HOME/build-tools/36.0.0:$PATH"
# `prebuild --clean` stops to ask about uncommitted changes; android/ is
# generated and gitignored, so there is nothing there to protect.
export EXPO_NO_GIT_STATUS=1

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mFAILED: %s\033[0m\n' "$*" >&2; exit 1; }

package_of() {
  case "$1" in
    workout) echo com.semyonsw.workouttracker ;;
    tasks) echo com.semyonsw.momentum.tasks ;;
    expenses) echo com.semyonsw.momentum.expenses ;;
  esac
}

say "Momentum $VERSION: ${WANT[*]}"

# A Windows-installed tree has no Linux lightningcss and fails six minutes in.
node -e "require('./metro.config.js'); process.exit(0)" \
  || die "metro.config.js does not load — see 'THE OTHER TRAP' in CLAUDE.md"

# The two-second check that app.config.js resolves this variant to its own
# package, before ten minutes are spent finding out from the APK.
for v in "${WANT[@]}"; do
  got="$(EXPO_PUBLIC_APP_VARIANT=$v node -e \
    "console.log(require('./app.config.js')({config: require('./app.json').expo}).android.package)")"
  [ "$got" = "$(package_of "$v")" ] || die "app.config.js gives $v the package $got"
done

build_variant() {
  local v="$1" apk="momentum-$1-$VERSION.apk" pkg
  pkg="$(package_of "$v")"
  export EXPO_PUBLIC_APP_VARIANT="$v"
  # Read back from the bundle below. Unique to this variant AND this version,
  # so neither a stale transform nor last release's bundle can pass for it.
  export EXPO_PUBLIC_BUILD_MARK="momentum-build-$v-$VERSION"

  say "$v: expo prebuild --clean ($pkg)"
  # --clean because the package, label, icon and plugins all change between
  # variants, and prebuild does not take things back out of an existing android/.
  # It regenerates android/app/debug.keystore — the same stock bytes every time,
  # which the certificate check on the APK confirms.
  "${EXPO[@]}" prebuild -p android --clean --no-install >>"$LOG" 2>&1 || die "prebuild (see $LOG)"
  grep -q 'android.minSdkVersion=26' android/gradle.properties \
    || die "minSdkVersion is not 26 after prebuild"
  echo "sdk.dir=/root/android-sdk" > android/local.properties

  # Merge records a Windows build left behind hold C:\ paths with no parent here.
  for f in $(grep -l 'C:\\Users' node_modules/*/android/build/intermediates/incremental/release/*/merger.xml 2>/dev/null || true); do
    rm -rf "$(dirname "$f")"
  done

  # Metro's cache would hand this variant the previous one's inlined literal.
  rm -rf "$(node -p "require('os').tmpdir()")"/metro-* node_modules/.cache/metro
  sed -i 's|^\(\s*\)// extraPackagerArgs = \[\]|\1extraPackagerArgs = ["--reset-cache"]|' android/app/build.gradle
  grep -q 'extraPackagerArgs = \["--reset-cache"\]' android/app/build.gradle \
    || die "could not set --reset-cache in android/app/build.gradle (template changed?)"

  say "$v: gradle assembleRelease (about 10 minutes; log: $LOG)"
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

  cp android/app/build/outputs/apk/release/app-release.apk "$apk"
  verify "$v" "$apk" "$pkg"
}

verify() {
  local v="$1" apk="$2" pkg="$3" certs badging bundle
  say "verifying $apk"
  # Each tool's output is captured whole, then searched. Piped straight into
  # `head` or `grep -q`, the tool is killed by SIGPIPE when the reader stops
  # early, and under `pipefail` that fails the check on a perfectly good APK.
  certs="$(apksigner verify --print-certs "$apk")"
  badging="$(aapt2 dump badging "$apk")"
  bundle="$(mktemp)"
  unzip -p "$apk" assets/index.android.bundle >"$bundle"
  hits() { grep -ac -- "$1" "$bundle" || true; }

  grep -q 'CN=Android Debug' <<<"$certs" \
    || die "signed with the wrong key — it would not install over the phone's app"
  grep -q "package: name='$pkg'" <<<"$badging" \
    || die "$apk is not $pkg — it would install as a different app"
  grep -q "versionName='$VERSION'" <<<"$badging" \
    || die "versionName in the APK is not $VERSION"
  if grep -q 'RECORD_AUDIO' <<<"$badging"; then
    die "the APK asks for the microphone"
  fi
  if [ "$v" = workout ]; then
    grep -q 'android.permission.health.WRITE_EXERCISE' <<<"$badging" \
      || die "Workout lost the Health Connect permission"
  elif grep -q 'android.permission.health' <<<"$badging"; then
    die "$v asks for a Health Connect permission it never uses"
  fi
  # The variant mark proves the JS is THIS variant's (see the header).
  [ "$(hits "$EXPO_PUBLIC_BUILD_MARK")" -gt 0 ] \
    || die "the bundle does not carry $EXPO_PUBLIC_BUILD_MARK — stale or wrong-variant JS"
  # PROBE: an ASCII string this release's JS introduced (see CLAUDE.md on Hermes).
  if [ -n "${PROBE:-}" ]; then
    [ "$(hits "$PROBE")" -gt 0 ] || die "the bundle does not contain '$PROBE'"
  fi
  rm -f "$bundle"
  head -1 <<<"$badging"
  grep "application-label:" <<<"$badging" || true
  echo "signature, package, version, permissions and bundle: OK"
}

for v in "${WANT[@]}"; do
  build_variant "$v"
done

# Old APKs stay where they are: each is a rollback (CLAUDE.md), and removing
# one is the owner's call, not a side effect of a release.
SHIPPED=()
for v in "${WANT[@]}"; do
  SHIPPED+=("momentum-$v-$VERSION.apk")
done

if [ "$PUSH" = 1 ]; then
  say "commit and push"
  git add -f "${SHIPPED[@]}"
  git commit -q -m "$VERSION: release APKs (${WANT[*]})"
  git push -q origin main
fi

say "done"
printf '  %s\n' "${SHIPPED[@]/#/$ROOT/}"
