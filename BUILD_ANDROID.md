# Building the Android APK

A sideloadable, self-contained release APK for a Galaxy S24 (or any arm64 Android
phone). No Expo account, no cloud build, no Metro server — the JS bundle is
compiled into the APK, so it runs with the laptop switched off.

## One app, one APK

| App | APK | Package |
| --- | --- | --- |
| Tasks | `momentum-tasks-<version>.apk` | `com.semyonsw.momentum.tasks` |

Until 3.0.0 this was the Tasks section of Momentum; 3.0.0 split Momentum into
three apps from one tree (Workout, Tasks, Expenses), and 3.0.1 cut this tree down
to Tasks alone. The package, the signing key and every persisted key are the
3.0.0 Tasks app's, so 3.0.1 installs over it and keeps everything. Its own
automatic backups are `momentum-tasks-backup-*`; a combined `momentum-backup-*`
from 2.x can still be imported, and only the tasks and the settings are taken
from it.

From WSL, `tools/release-apk.sh` builds it and checks the APK's key, package,
version, permissions and bundle. By hand, call the Expo CLI through the Linux
node — `npx expo` in a tree shared with Windows runs the Windows `node.exe`, which
never sees a WSL environment variable — and delete Metro's cache first
(`/tmp/metro-*`), because its transform cache is not keyed on env values:

```bash
export EXPO_PUBLIC_BUILD_MARK=momentum-tasks-build-<version>
node node_modules/expo/bin/cli prebuild -p android --clean
cd android && ./gradlew assembleRelease …                     # flags as in CLAUDE.md
```

## Install it on the phone

The current release's APK is committed at the repo root —
`momentum-tasks-<version>.apk` — next to the previous ones as rollbacks.

1. Copy the APK to the phone (USB, Drive, Telegram — anything), or plug the
   phone in and let `./install.sh` / `Install.bat` push it over adb.
2. Open it in **Files** and tap install. The first time, Android asks to allow
   installs from that app; allow it and tap install again.
3. Play Protect will warn that the developer is unknown, because the APK is
   signed with a personal key rather than one Google has seen. **More details →
   Install anyway.**
4. On first launch, **allow notifications**. It is the ONLY way a task reminder
   reaches you once the app leaves the screen. On Samsung, also set **Battery →
   Unrestricted** for the app and make sure it is not in **Sleeping apps** — a
   restricted app's alarms are dropped.

## Rebuild after a code change

On the Windows machine (PowerShell), with the JDK and SDK paths CLAUDE.md lists:

```powershell
$env:JAVA_HOME  = "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"
$env:ANDROID_HOME = "E:\android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

npm ci                                   # NOT `npm install --legacy-peer-deps`, see below
npx expo prebuild -p android --clean
cd android
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a `
  -PWT_STORE_FILE="$PWD\app\debug.keystore" -PWT_STORE_PASSWORD=android `
  -PWT_KEY_ALIAS=androiddebugkey -PWT_KEY_PASSWORD=android
```

On Linux the same lines are `export JAVA_HOME=…`, `export ANDROID_HOME=…`,
`./gradlew assembleRelease …` — or just `tools/release-apk.sh`.

The APK lands at `android/app/build/outputs/apk/release/app-release.apk`. Copy it
to `momentum-tasks-<version>.apk` before installing it — a Downloads folder with
four files called `app-release.apk` in it is four files nobody can tell apart.

`arm64-v8a` is the only ABI built — every phone from roughly 2017 on is arm64,
and a single-ABI APK is ~40 MB smaller than a universal one. Drop the
`-PreactNativeArchitectures` flag to build all four ABIs.

### Install dependencies with `npm ci`

`npm install --legacy-peer-deps` **silently breaks this project**:
`react-native-reanimated@4` declares `react-native-worklets` as a peer dependency
rather than a dependency, and `--legacy-peer-deps` means "do not install peers".
The result installs and typechecks fine, then produces an APK whose animation
runtime has no native part. `npm ci` installs exactly the tree in
`package-lock.json`, worklets included, which is what a reproducible APK needs.

If npm ever refuses the tree outright, the command that actually fixes it is
`npx expo install --fix` (it aligns native versions with the Expo SDK), not
`--legacy-peer-deps`.

### Windows: the 260-character path limit, and the one fix that works

A build can fail after half an hour with:

```
ninja: error: Stat(safeareacontext_autolinked_build/CMakeFiles/…/
  safeareacontextJSI-generated.cpp.o): Filename longer than 260 characters
```

That object path is ~300 characters, and no amount of moving the project up the
tree fixes it: most of the length is the New Architecture codegen path *inside*
`node_modules/react-native-safe-area-context/android/build/generated/…`. Two
settings matter:

1. **`LongPathsEnabled = 1`** in
   `HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem`. Without it nothing below
   helps.
2. **A long-path-aware `ninja`.** The Android SDK's `cmake;3.22.1` bundles ninja
   **1.10.2**, which refuses any path over `MAX_PATH` in its own `Stat()`
   regardless of what the OS allows. Ninja gained the `longPathAware` manifest in
   1.11, so swap the binary:

```powershell
$cmakeBin = "$env:ANDROID_HOME\cmake\3.22.1\bin"
Copy-Item "$cmakeBin\ninja.exe" "$cmakeBin\ninja-1.10.2-bundled.exe"   # keep the original
# from https://github.com/ninja-build/ninja/releases (v1.12.1, ninja-win.zip)
Copy-Item "C:\Users\user\dev-tools\ninja\ninja.exe" "$cmakeBin\ninja.exe" -Force
```

Nothing in the repo changes: CMake invokes whatever `ninja.exe` sits beside it,
so this is a property of the machine's toolchain rather than of the project. It
also survives `expo prebuild`, which a patched `android/app/build.gradle` would
not.

### Verify permissions on the APK, never on the source manifest

Android's manifest merger takes the **union** of every library's permissions, so
a permission a dependency's AAR declares reaches the APK no matter what
`android/app/src/main/AndroidManifest.xml` says. The only honest check reads the
built artifact:

```bash
aapt2 dump badging android/app/build/outputs/apk/release/app-release.apk \
  | grep -E "permission|microphone"
```

Expect `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` and `USE_EXACT_ALARM` — what
makes a reminder land on time with the app off screen — and **no**
`RECORD_AUDIO` and no `health.*`. Momentum needed `plugins/withoutMicrophone.js`
to strip the microphone `expo-audio` brought in; Tasks has no `expo-audio`, and
`tools/release-apk.sh` still fails a build that asks for either.

## Shipping an update to a phone that already has it

Bump `android.versionCode` in `app.json` (an integer that must increase), rebuild,
and install over the top. The install keeps existing data.

`versionName` (`"version"` in `app.json`) is the human string and can be
anything; `versionCode` is what Android compares.

## Signing

Android identifies an app by **package name + signing key**; an APK signed with
any other key is refused as an update (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`,
worded "app not installed" on Samsung), and the uninstall that would let it
through deletes the task log.

The install on the phone is signed with the stock React Native debug keystore
(`CN=Android Debug`, SHA-256 `FA:C6:17:45…`), which `expo prebuild` regenerates
identically on any machine — so a fresh clone CAN build an APK that updates the
phone. The `-PWT_*` flags above point `plugins/withReleaseSigning.js` at it for
that one build. What can go wrong is a build signed with the WRONG key, so check
the artifact every release:

```bash
$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs momentum-tasks-<version>.apk
```

`CLAUDE.md` is the authority on signing.

## Why `android/` is not in git

`npx expo prebuild` **generates** `android/`. Anything edited by hand inside it is
destroyed by the next prebuild. `app.json` and `plugins/*` are the source of
truth; the signing config is a config plugin precisely so it is reapplied on every
regeneration rather than being a manual step someone forgets.

## Toolchain this was built with

| | |
| --- | --- |
| JDK | 17 or 21 (Temurin/OpenJDK) — RN 0.81 requires 17+ |
| Android SDK | platform 36, build-tools 36.0.0 |
| NDK | 27.1.12297006 |
| CMake | 3.22.1, with its bundled ninja replaced by **1.12.1** on Windows (see the path-limit section) |
| Expo | SDK 54 · React Native 0.81.5 |
