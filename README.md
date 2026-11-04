# Momentum Tasks

[![Platform](https://img.shields.io/badge/platform-Android-3ddc84)](INSTALL.md)
[![Stack](https://img.shields.io/badge/stack-Expo%2054%20%C2%B7%20RN%200.81%20%C2%B7%20TS-000020)](#what-it-does)
[![Tests](https://img.shields.io/badge/tests-1000%2B-1f9d55)](#tests)
[![Storage](https://img.shields.io/badge/storage-local--first-0b7285)](#what-it-does)

**Tasks** — a local-first Android daily-tasks app: one circle per task per day.
Split out of Momentum at 3.0.0, where it was one of three sections beside Workout
and Expenses.

> ### Install it
>
> | I want… | What to do |
> |---|---|
> | **the app on my phone** | grab `momentum-tasks-<version>.apk` from the repo root or the [Releases page](../../releases), open it in Files, tap install — or plug the phone in and let the installer push it over USB |
> | **the project on my computer** | **Windows:** double-click `Install.bat` · **Linux/macOS/WSL:** `./install.sh` |
>
> The installer finds Node (and offers to fetch it), installs the locked
> dependency tree, **runs TypeScript and the whole test suite to prove it works
> here**, and — if a phone is plugged in with USB debugging on — offers to
> install the APK on it. Details and troubleshooting: **[INSTALL.md](INSTALL.md)**.

- **Stack** — Expo (React Native) + TypeScript + NativeWind + Zustand, every
  store in AsyncStorage. No account, no server, no cloud build.
- **Design** — near-black glass, tabular numerals, and a three-colour theme
  (eight presets plus your own three; Fintech Lime by default). Dark only.

```bash
npm ci                   # exactly the locked tree — see BUILD_ANDROID.md
npx expo start           # dev server
npm test                 # vitest: the decisions, the stores, backups, the assistant
npm run test:render      # jest: the few bugs that live between React and the screen
npm run typecheck
npm run lint             # also what CI runs, on every push
```

## What it does

The app is the task list plus Settings: no landing screen and no tab bar. The
**⟲ in the top-right corner** opens its history.

| | |
| --- | --- |
| Daily tasks | one circle per task per day, and it cycles **unanswered → done → missed on purpose**. The third state is what makes the other two mean anything: without a way to say *I chose not to*, the only honest thing a habit list can report is failure. An excused day keeps the streak and leaves the denominator |
| A task for one day | `Just once` in the editor, and a date. Wash the dishes tomorrow: it asks on that day, on no day before it and on no day after it, and it cannot be missed retroactively |
| …and a day to start on | every repeating task has one, it defaults to **today**, and that default is the feature. A habit written down on Sunday evening does not appear on Saturday's list and turn a day you finished 9 of 9 into 9 of 10. Move it back on purpose — the 1st of the month, whenever the habit really began — and the grid fills in from there |
| Tasks can speak | a switch and a 24-hour wheel in the task's own editor. The phone asks on the days the task asks and at the minute you set, with the task's name as the headline. Off by default, one task at a time: a habit list that notifies by default is a habit list that gets silenced at the OS level inside a week |
| Reorder them | long press a row and slide. The day list shows only the tasks that asked for something, so a Mon/Wed/Fri row is genuinely absent on a Tuesday — dragging the third row to the top means the third row you can SEE, and every hidden task keeps its own slot |
| The month, and the trend | behind the **⟲** in the corner. `Month` is a square per day, filled by how much of that day got done — tap one to open it and answer it. `Trend` is percent-done over a range you pick: week, month, 3 months, year, all time. A day that asked for nothing is left out rather than plotted as a zero |
| Counted, or N times a week | a task can carry a target — `20 pages` — and is done when the count reaches it; or ask `3× a week` rather than on named days |
| Settings | the daily-tasks settings, the theme, the language, and the general block that holds the one export, the one import and the one reset |
| Export / Import | the tasks, their log, the assistant's chats and your settings, as one readable JSON file, and back again through the phone's file browser. A combined backup from Momentum 2.x opens too: the tasks and the settings are taken from it, and the training and the money in it are left alone |
| Backups happen on their own | pick a folder once and the log is written into it every week, as `momentum-tasks-backup-<day>.json`, without being asked. Settings states the age of the last one — `Today`, `12 days ago`, `Never` |
| Русский, and English | the app ships in Russian. `РУ` / `EN` in the top-right corner of Settings, two letters in their own script so the switch is legible to somebody who cannot read the screen it is on |
| An assistant, if you want one | off until you paste your own Google AI key into `Settings → AI assistant`, where it is tested in three named steps before it is kept — in the phone's keystore, never in a backup. Then a ✦ opens a chat about your tasks: how the month went, and changes to the list — a new task, a rename, a schedule, a day answered — on a card that writes nothing until `Apply`, with one Undo after it. It reads a summary built on the phone and goes straight to Google — there is no server |

## Android APK

Android-only, sideloaded: one APK per release, `momentum-tasks-<version>.apk`,
committed at the repo root next to the previous ones as rollbacks.
**[BUILD_ANDROID.md](BUILD_ANDROID.md)** covers installing it, rebuilding
locally, and the signing key — which is what decides whether an APK updates the
install on the phone or is refused by it.

```bash
tools/release-apk.sh --no-push    # built and verified (WSL)
```

## Tests

`npx vitest run` is the project's memory of bugs that already happened once: the
task log staying sparse, schedules and start days, streaks and excused days,
backups in both directions (Momentum 2.x and 3.0.0 files included), the
assistant's validator and its cards end to end. `npx jest` runs the render suite.

## Layout

```
App.tsx                     providers, the error boundary, notifications
src/navigation/             the shell: the task list, Settings, and a stack
src/screens/                one file per screen, all plain props-and-callbacks
src/components/             rows, sheets, primitives, ErrorBoundary, ConfirmSheet…
src/hooks/                  reminders, the auto-backup, the clock
src/lib/                    the decisions — tasks, days, streaks, backups,
                            reminders, the assistant's prompts and validator —
                            all pure, all tested
src/state/                  the tasks, the settings and the assistant — zustand,
                            every one validated on the way in
plugins/                    Expo config plugin (release signing)
.github/workflows/          ci.yml on every push (test, typecheck, lint)
```

Each file opens with a header explaining what it owns and why it is built the way
it is; those headers are the design document.
