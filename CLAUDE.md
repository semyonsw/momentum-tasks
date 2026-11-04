# Working on this repo

## Finish every change with a release

A change that only exists in `src/` has not reached the phone. The app is
sideloaded — there is no store, no OTA — so **shipping is part of the task, not a
follow-up**. After every change, without being asked:

1. **Bump the version.** `app.json` (`version` and `android.versionCode`, both) and
   `package.json`. Patch bump unless the change is bigger than that.
2. **Build the APK** (below) and copy it to the repo root as
   `momentum-tasks-<version>.apk`. `tools/release-apk.sh` does steps 2 and 3,
   verification included.
3. **Commit and push to `main`.** Short, plain commit message — one line, no essay.

The point of step 2 is that the user copies that file to the phone and installs
it over the old one. Leave the previous APK on disk as a rollback; do not delete
it.

## One app

This is **Tasks**, package `com.semyonsw.momentum.tasks` — the phone's existing
install, which updates in place. Until 3.0.0 it was one section of Momentum; at
3.0.0 Momentum was split into three apps from one tree (Workout, Tasks,
Expenses), and at 3.0.1 this tree was cut down to Tasks alone. There is no
variant switch any more: `app.json` IS the app.

What the split leaves behind is on the phone, and it has to keep reading:

- **Every persisted key is the 3.0.0 Tasks build's, byte for byte**: the zustand
  stores `tasks`, `settings` and `ai`; the keystore entry `ai.google.apiKey`; the
  automatic backups' `momentum-tasks-backup-` prefix. Rename one and the update
  opens empty.
- **The AI chat is filed under `Tasks`** on disk and in a backup
  (`{ chats: { Tasks } }`, `FILED_AS` in `src/state/aiStore.ts`), because that is
  the shape 3.0.0 wrote. The store holds one chat; only the file keeps the name.
- **Backups stay `workout-tracker-backup`, version 2.** A combined 2.x backup
  carries every section; importing one takes the tasks, the Tasks chats and the
  settings, and nothing else (`dataTransfer.test.ts`).

Icons: `assets/icon.png` and `assets/adaptive-icon.png`, the Tasks checkmark.

## Building the APK

The SDK lives at `/root/android-sdk` (installed 2026-08-26; `android/local.properties`
points at it). If it is gone, reinstall: cmdline-tools, `platforms;android-35`,
`platforms;android-36`, `build-tools;35.0.0`, `build-tools;36.0.0`,
`ndk;27.1.12297006`, `cmake;3.22.1`.

```bash
export EXPO_PUBLIC_BUILD_MARK=momentum-tasks-build-<version>   # for BOTH steps
node node_modules/expo/bin/cli prebuild -p android --clean
rm -rf /tmp/metro-*                                   # see "the cache trap" below
cd android
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export ANDROID_HOME=/root/android-sdk ANDROID_SDK_ROOT=/root/android-sdk
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a \
  -PWT_STORE_FILE="$PWD/app/debug.keystore" -PWT_STORE_PASSWORD=android \
  -PWT_KEY_ALIAS=androiddebugkey -PWT_KEY_PASSWORD=android
```

Takes ~10 minutes; run it in the background. Output lands at
`android/app/build/outputs/apk/release/app-release.apk`, and the next
`prebuild --clean` deletes it — copy it out first.

### The cache trap

- **`npx expo` does not see WSL's environment** in a tree shared with Windows:
  the `.bin/expo` shim execs the Windows `node.exe`, and a Windows process gets
  none of WSL's variables — so `EXPO_PUBLIC_BUILD_MARK` silently never reaches
  the bundle. Call `node node_modules/expo/bin/cli`.
- **`--clean`, every build.** Prebuild does not take things back out of an
  existing `android/`. It regenerates `android/app/debug.keystore` — the same
  stock bytes — and `local.properties`, so re-point that at the Linux SDK after it.
- **Metro's cache leaks the previous build.** Its transform cache is not keyed
  on env values, so a cached `src/lib/buildMark.ts` ships the last build's
  literal. Delete `/tmp/metro-*` and pass `--reset-cache` (the script sets
  `extraPackagerArgs` in the generated `build.gradle`), then grep the bundle for
  exactly `momentum-tasks-build-<version>` — the mark only this build can carry.

### THE OTHER TRAP: one `node_modules`, two operating systems

The repo lives on the Windows filesystem and both machines build out of the SAME
`node_modules`. `npm install` only unpacks the native binaries for the platform
it ran on, so a tree installed on Windows has `lightningcss-win32-x64-msvc` and
nothing else — and building from WSL then dies six minutes in, at
`:app:createBundleReleaseJsAndAssets`, with

```
Error loading Metro config at: …/metro.config.js
Cannot find module '../lightningcss.linux-x64-gnu.node'
```

`lightningcss` is NativeWind's CSS parser, reached through
`react-native-css-interop`, and there are TWO copies of it at two versions. It is
not a broken install and `npm ci` is the wrong answer — that would rebuild the
tree for Linux and break the Windows box the same way round. Add the Linux
binaries BESIDE the Windows ones instead, matching each copy's version:

```bash
npm pack lightningcss-linux-x64-gnu@1.27.0   # react-native-css-interop's copy
npm pack lightningcss-linux-x64-gnu@1.33.0   # the top-level one
# extract each `package/` into the matching
# …/node_modules/lightningcss-linux-x64-gnu/ — `node/index.js` prefers the
# PACKAGE over the local `.node` file, so no file needs renaming.
```

Check it with `node -e "require('./metro.config.js')"`, which is a two-second
test for a failure that otherwise costs six minutes.

And one flake, from the same mount: `:app:compressReleaseAssets` can fail with a
bare `No such file or directory`, twice over — once per asset, because its two
work actions run in parallel and race to create the `out/assets` directory they
share. Nothing is wrong. Re-run the same command; the task succeeds on the
second pass and everything upstream of it is cached, so it costs seconds rather
than the eleven minutes the failed build did. A third, and this one is NOT a flake — it fails identically every time:
`:expo:mergeReleaseResources` dies with `NullPointerException … File.getParentFile()
is null`. Library build output lives inside `node_modules/<lib>/android/build/`, so
a build on the Windows box leaves an incremental merge record there
(`intermediates/incremental/release/mergeReleaseResources/merger.xml`) full of
`C:\Users\…\.gradle` paths, which have no parent on Linux. Delete that one
directory (`grep -l 'C:\\Users' node_modules/*/android/build/intermediates/incremental/release/*/merger.xml`
finds any others) and re-run; it is a cache and regenerates. `android/local.properties`
needs pointing at the Linux SDK for the same reason (`sdk.dir=/root/android-sdk`);
both files are gitignored, so neither correction can follow the repo to the other
machine and break it.

### On the Windows box

The same build, with the paths it actually has (installed 2026-08-30): JDK 17 at
`C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot`, SDK at `E:\android-sdk`
(C: is short on space), and `android/local.properties` holding
`sdk.dir=E\:\\android-sdk` — Java-properties escaping, so that is a real
double backslash in the file. Set `JAVA_HOME`/`ANDROID_HOME` per command, since
neither is on the machine's PATH, and call `gradlew.bat` with the same flags. There
`npx expo` is native and does see `$env:EXPO_PUBLIC_BUILD_MARK`; set it the
same way.

**THE ONE TRAP: `ninja: error: Filename longer than 260 characters`.** The C++
codegen step writes object paths that embed the project's absolute path twice, and
they run past `MAX_PATH`. `LongPathsEnabled` is already 1 in the registry, but the
ninja shipped inside `cmake;3.22.1` is 1.10.2, which predates the check that reads
that flag. The fix is a drop-in binary swap: ninja 1.12.1 over
`E:\android-sdk\cmake\3.22.1\bin\ninja.exe`, with the 1.10.2 original kept beside
it as `ninja-1.10.2.exe.bak`. Reinstalling the SDK's cmake package undoes it.

## Native dependencies

No hand-written native code. `expo-notifications` (reminders), `expo-secure-store`
(the AI key), and `expo-build-properties` (only `useLegacyPackaging`) are all
config-plugin-driven, so `prebuild -p android` is what applies them. The
Momentum-era extras are gone with the sections that needed them:
`react-native-health-connect` (Workout's), and `expo-audio` with the
`withoutMicrophone` plugin that stripped its `RECORD_AUDIO`.

`android/app/debug.keystore` is the key the phone's install is signed with
(SHA-256 `FA:C6:17:45…`, `CN=Android Debug`) — and it is NOT a unique file. This
used to say it was the only copy and that losing it cost an uninstall; that is
wrong, and it is worth knowing exactly how wrong, because believing it means
believing a release cannot be cut from a fresh clone.

It is the stock React Native template debug keystore, the same bytes shipped to
every RN project on earth (SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`).
`npx expo prebuild -p android` writes it out again, identical, every time. So a
clone with no `android/` at all can prebuild, build, and produce an APK that
updates the phone normally. Proof, on any machine, in two commands:

```bash
keytool -list -v -keystore android/app/debug.keystore -storepass android \
  -alias androiddebugkey | grep SHA256                    # FA:C6:17:45…
apksigner verify --print-certs momentum-tasks-3.0.0.apk  # the same digest
```

What this does NOT mean is that the signing key stops mattering. Android
identifies an app by package name + key, so an APK signed with anything else
still cannot update the install, and the uninstall that would let it through
still deletes the task log. It means the failure mode is a build configured
to sign with the WRONG key — `plugins/withReleaseSigning.js` reaching for
`WT_STORE_FILE`, or a real release keystore appearing later — not a lost file.
So check the fingerprint on the built APK, every release, with the `apksigner`
line below. That check is the one that can actually fail.

## Verify the artifact, never the source

```bash
export PATH="/root/android-sdk/build-tools/36.0.0:$PATH"
apksigner verify --print-certs <apk> | grep "certificate DN"   # CN=Android Debug
aapt2 dump badging <apk> | head -1                             # package name, versionCode/Name
aapt2 dump badging <apk> | grep -E "permission|microphone"     # no RECORD_AUDIO, no health.*
```

The package must be `com.semyonsw.momentum.tasks` — an APK with any other
installs beside the real app instead of over it. And no permission should be
there that the app does not use: the merger takes the union of every library's
manifest, so only the built file is an honest answer.

Worth also grepping `assets/index.android.bundle` inside the APK for a string your
change introduced — it is the one proof the JS that shipped is the JS you wrote.
Use `grep -a`; the bundle is binary and plain `grep` silently reports nothing.

**Pick an ASCII string.** The release bundle is Hermes bytecode, and its string
table holds anything containing a non-ASCII character as UTF-16 — so a `grep -a`
for a sentence with a curly apostrophe or an em dash in it reports 0 matches on a
bundle that contains the string. Either grep an ASCII-only fragment, or match
`s.encode('utf-16-le')` in Python.

**And a STRING, not a number.** Numeric literals go into Hermes's constant pool
rather than into the bytecode as text, so grepping for `fontSize:104` or `64:52`
returns 0 on a bundle that sets exactly those — and so does grepping for the value
you replaced, which makes the result look like a failed build twice over. A purely
numeric change therefore has no direct probe: grep something textual that moved
with it. A `className` is usually the closest thing, since a layout change almost
always rewrites one (`justify-center px-xl py-lg` is what proved the timer pill's
restructure shipped), and checking that the string you REMOVED is now absent is the
other half of the proof.

## `.gitignore` has `*.apk`

The committed APKs are force-added. `git add -f momentum-tasks-<version>.apk`,
or the release quietly contains no release.

## Before committing

`npx tsc --noEmit`, `npx vitest run`, `npx eslint src`, `npx prettier --write src`.
All four, every time. The suite is the project's memory of bugs that already
happened once.

Plus the render suite, `node node_modules/jest/bin/jest.js` (`jest.config.js`,
`*.render.test.tsx`): the few bugs that only exist between React and the screen
— the kind no pure function can see. From WSL,
call vitest and jest through `node node_modules/...` as written: the `.bin`
shims in this shared tree fall through to the Windows `node.exe`, which then
dies on rollup's missing win32 binary.

## House style

Read a neighbouring file before writing one. This codebase comments the *decision*
and the *why*, not the mechanics — file headers explain what the thing is for and
which alternatives were rejected. Match that. Decisions live in `src/lib/` as pure
functions so they can be tested without a renderer; screens are composition.
