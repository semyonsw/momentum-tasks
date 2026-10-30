# Redesign changelog: findability (2.9.0)

Brief: `momentum-redesign-prompt.md`. Plan and file ownership: `REDESIGN_PLAN.md`.

## Shared groundwork
- **Primitives** (`components/primitives.tsx`):
  - `ValueWell`, `CaptionedIconButton`, `MoreButton`, `DangerButton`, `RemoveRowButton`, `DangerZone`.
  - `DangerZone` takes per-screen hint overrides. Deleting an exercise keeps its logged sets, so its hint says that instead of "Gone, with all its history".
- **Icons** (`components/Icon.tsx`): `focus` (viewfinder), `timer`, `calendar`, `grip`, `accounts`.
- **Settings:** the persisted one-time flags `seenSetTypeTip` and `seenLeaveRunningTip`.
- **Danger hue:** red stays importable only by `primitives.tsx`, `ConfirmSheet.tsx` and `tokens.ts`. Screens get red only through `DangerButton` / `RemoveRowButton` / `DangerZone`, so the `destructive.test.ts` guard is unchanged.

## Items

### #1 Set row
**Files:** `SetRow.tsx` (rewritten), `SetTypeTip.tsx` (new), `lib/setRowLayout.ts` (new), `lib/setType.ts`, `lib/inlineEditor.ts`, `ExerciseCard.tsx`.

**Done:**
- The grid is 80 | 1fr | 1fr | 48.
- **W toggle:** 30 dp, dashed when off and solid `acc` when on. It sits on a 30 dp spacer, so the weight well never moves.
- **Set well:** 44×40, showing the number or type letter plus ▾. Tapping it opens the set-type sheet.
- **Weight and reps:** value wells, with an "RIR 2" chip inside the reps well.
- **Log circle:** 44 dp, following the states table.
- **Removed:** the tap and the hold that opened Focus from the up-next row.
- **First-use tip:** shown once, with "Got it".

**Deviations:**
- Barbell lifts keep the "20 + 2×10" plate line under the row, so those rows are taller than 56 dp. The feature was kept.
- The tip sits on the open card. At session start that is the first exercise.
- The sheet title for a warm-up reads "Set W · …".

### #2 QuickAdjust and the set-type sheet
**Files:** `QuickAdjust.tsx`, `SetMarksSheet.tsx` (both rewritten).

**Done:**
- Two steppers. The step is the exercise's increment, otherwise the app default.
- Set type chips and "Reps left (RIR)" chips show before the set is logged.
- Close and "Log set".
- The sheet has the brief's title and help line, five 50 dp radio rows with descriptions, "– 0 1 2 3 4+" chips and Done.

**Deviations:**
- "Remove set" moved to edit mode (the per-row −).
- The "Type" button is gone; tapping the value field types an exact number.
- On a logged set, "Log set" reads "Done".
- An old half-step grade (e.g. 1.5) stays stored until another chip is tapped.

### #3 Exercise card header and edit mode
**Files:** `ExerciseCard.tsx`, `lib/exerciseCardLine.ts` (new).

**Done:**
- **Header:** the name, a sub-line ("4 sets · target 80 kg × 8"), a Focus chip and an Edit pill.
- **Removed:** the trash, pencil and chevron circles.
- **Normal footer:** "+ Warm-up" (only while nothing is logged) and "Rest 1:30" with a timer icon and pencil.
- **Edit mode:**
  - the Done pill and an edit sub-line;
  - grip and danger − on each row;
  - "+ Add set", "+ Warm-up 40 · 60 · 80" and "Rest, targets and cue ›";
  - a divider, then the red "Remove exercise".

**Deviations:**
- The Rest chip body still starts a rest, because that is the only way to start one by hand when auto-rest is off. The pencil (its own 44 dp target) opens the rest editor, which is the exercise editor.
- Moving a set is **tap ⋮⋮ to lift, tap ⋮⋮ where it goes**, not a finger drag, and the sub-line says so ("Editing · tap ⋮⋮ to move a set"). A third nested drag gesture inside a card that already has a hold-to-reorder header was judged too easy to fire by accident.
  - Only sets not yet logged move, and only below the last logged set (`lib/setOrder.ts`, `moveSet` in the store).
  - Screen readers get Move up / Move down.
- The normal-mode "+ Add set / − Remove set" footer is gone, as in the brief. Adding a set mid-workout now goes through Edit.
- **Fixed after review:**
  - Drop sets no longer count toward the "make N sets the plan" offer, and no longer set its weight.
  - Assisted and bodyweight + extra exercises name no weight in the caption.
  - Volume shows in lb for imperial users.
  - The dock no longer clips 2 dp.
  - The Options button no longer double-buzzes.
  - The "workout still running" tip is only used up when it can actually be shown.

### #4 Add an exercise and Session options
**Files:** `ActiveWorkoutScreen.tsx`, `SessionHeader.tsx`.
- A full-width "+ Add an exercise" button.
- The ⋮ is captioned "Options". The Session options sheet has "+ Add an exercise", an "Auto-start rest" switch (wired to the same setting as Workout settings), then the existing options.

### #5 Focus icon and the bottom dock
**Files:** `Icon.tsx`, `SessionDock.tsx` (new).
- One viewfinder Focus icon on both the dock and the card chip; ▶ is used only for start/play.
- The dock is a glass bar with two equal buttons, [Focus icon] Focus and Finish. Before the start it holds "Stop and exit / ▶ Start workout", and when every set is logged it holds "✓ Finish workout".

### #6 Finish sheet
**Files:** `FinishSheet.tsx`, `lib/finishSheet.ts`, `lib/routinePlan.ts`.

**Done:**
- Stats: Time · Sets · Volume.
- A "Changed from the plan" card.
- A two-line primary button generated from the plan diff, covering both the one-change and the 2+ changes forms.
- "Save workout"; "Keep training".

**Deviation:** Finish now always opens the sheet when the plan changed. Before, a fully logged session saved in one tap and the offer never appeared.

### #7 Leaving a running session
**Files:** `SessionHeader.tsx`, `AppShell.tsx`, `LandingScreen.tsx`, `lib/landing.ts`.
- Back is labelled "Back, workout keeps running".
- A toast shows once (6 s): "Workout still running — resume it from Home", with Resume.
- Home has a running card ("{name} · running", the elapsed time and current set, ▶ Resume). It replaces the old resume chip.

### #8 Hero card and FAB
**Files:** `HomeScreen.tsx`, `lib/workoutHome.ts` (new).
- The whole hero card is tappable and holds a "▶ Open {name}" button.
- The FAB is an extended pill that folds to ▶ on scroll, with hysteresis so it doesn't flicker.

### #9 Top-bar captions
**Files:** `SectionTopBar.tsx`, `HomeScreen.tsx`, `TasksScreen.tsx`, `MoneyScreen.tsx`.
- Workout: AI coach · Routines · History.
- Tasks: AI coach · History.
- Finance: AI coach · Accounts · History.
- "Accounts" opens a list of accounts. Each row opens that account's edit sheet, and the last row is "Add account".

### #10 Bottom nav
**Files:** `NavBar.tsx`.
- Labels under the icons, with the active one in `acc`.

### #11 Workout section cards
**Files:** `HomeScreen.tsx`, `WeeklyGoal.tsx`, `lib/weeklyGoal.ts`, `AppShell.tsx`.

**Done:**
- **Progress card:** "Progress / Graphs ›" opens Graphs directly, with a volume sparkline over the last 10 workouts. Below it are the Muscle map and Body chips.
- **Last-session card:** each exercise name links to that exercise's history.
- **Weekly goal card:** always shown, with pips.

**Deviation:** the brief doesn't say what the sparkline plots; it plots session volume.

### #12 Training history
**Files:** `CalendarScreen.tsx`, `AppShell.tsx`.
- Segments read Log | Graphs | Calendar.
- Trained days carry an `acc` dot. Tapping one shows a preview row with "Open ›", which opens that workout in the Log.
- The hint line from the brief is shown.

**Deviation:** the segment has no calendar icon. The brief marks it optional, and `Segmented` takes text only.

### #13 Weekly workout goal setting
**Files:** `WorkoutSettingsScreen.tsx`.
- Its own "Weekly workout goal" row, independent of the "Achievements and levels" switch.

### #14 Bodyweight
**Files:** `BodyScreen.tsx`, `lib/weighIn.ts` (new).
- A large well with a pencil opens the `NumberSheet` keypad.
- ± nudges a draft value, and "Log weight" records it.

**Deviation:** a value typed on the keypad is logged straight away, without a second tap.

### #15 Past-workout editing
**Files:** `HistoryScreen.tsx`, `lib/pastWorkout.ts` (new).
- The date is a well. It opens `DayPicker` in a "Move to another day" sheet with Cancel / Move here; the move keeps the same clock time and is safe across daylight saving.
- The hint "Tap a set to correct it" and a 44 dp pencil on each exercise header.
- Set values render as wells.

**Deviation:** "Edit name, date and length" became "Edit name, start and length", because the date left that block.

### #16 Routines
**Files:** `RoutineListScreen.tsx`, `RoutineEditorScreen.tsx`, `AppShell.tsx`.
- No die on an existing routine. A new routine keeps it, so it can be re-rolled.
- "Add routine" offers Empty / Random….

### #17 Exercise library and editor
**Files:** `ExerciseLibraryScreen.tsx`, `ExerciseHistoryScreen.tsx`, `CreateExerciseScreen.tsx`, `ScreenHeader.tsx`, `lib/exerciseEditor.ts` (new).

**Done:**
- The library button reads "Manage"; the history button reads "Edit exercise" with a pencil.
- A "Weight" radio list with an example line for each choice.
- An "Advanced" group, collapsed, that opens on its own if the ladder or MAX is already on.
- A Danger zone with Delete.

**Deviations:**
- The cue caption reads "Shown on the exercise card while you do it", because Focus mode does not show the cue and the brief's line would be false.
- There is no Archive, because the library has no exercise archive.

### #18 Training order and the empty state
**Files:** `SequenceScreen.tsx`, `lib/sequenceSteps.ts` (new), `HomeScreen.tsx`, `AppShell.tsx`.
- **Step rows:** grip, number, name and sub-line, then the Next tag or "Make next".
  - Tapping a row opens its routine.
  - Drag-to-reorder replaces the ⌃/⌄ arrows.
- A "+ Add a step" button.
- **Empty state:** Create a routine / Set up a training order / Start an empty workout.

### #19 Tasks
**Files:** `TasksScreen.tsx`, `TaskDetailScreen.tsx`, `TaskActionList.tsx` (new), `state/taskMoveStore.ts` (new), `lib/taskTap.ts`, `lib/discoverability.ts`.
- **Rows:** a 44 dp tick, the name, and ⋯. The ⋯ and the hold open the same menu, which has the brief's five actions.
- **Task detail:** the same five actions as rows, then the Danger zone (Archive).
- **Excused days:** a dashed tick and a "Skipped on purpose" tag.
- **Hint line:** shown at the top of Tasks.

**Deviations:**
- "Set a number…" appears only on counted tasks.
- There is no Delete, because the tasks store has no delete.

### #20 Finance tiles
**Files:** `MoneyScreen.tsx`.
- Each tile body has a "+" badge. A 44 dp "›" strip on the right edge opens the category.
- The hint line is shown.

**Also:**
- The account edit sheet ends with a Danger zone (Archive). There is no account delete in the store.
- The category screen got the same Danger zone, for consistency.

## §6 Vocabulary
AI coach, Finance, Account, Calendar, and Reps left (RIR) are applied across visible strings, guarded by `lib/redesignG.vocabulary.test.ts`. The provider is still named "Google Gemini" in AI settings, where the user picks it.

## Bug found across the app during review
Three new controls, and several older screens, passed a `style` callback to React Native's own `Pressable`. NativeWind drops that callback silently, so the chips and buttons rendered with no size, fill or border. Every such file now uses the app's `components/Pressable` wrapper, and `lib/pressableStyle.test.ts` keeps it that way.

**Older screens fixed by the same change:**
- `DebriefSheet.tsx`
- `WrappedEntry.tsx`
- `WrappedScreen.tsx`
- `SettingsHomeScreen.tsx`
- `LandingScreen.tsx`
- `SequenceScreen.tsx`
- `CreateExerciseScreen.tsx`
- `ActiveWorkoutScreen.tsx`

**Also changed:**
- `Segmented` now reports tablist/tab roles.
- The sequence grip is 44 dp.
- A hold on the AI-review stepper value now has a tap twin.

## Tests
- **New pure modules, each with tests:** `setRowLayout`, `exerciseCardLine`, `finishSheet` (plan offer), `workoutHome`, `pastWorkout`, `weighIn`, `sequenceSteps`, `exerciseEditor`, `taskTap` (detail actions).
- **i18n coverage:** one test per group (`redesign{A–F}.i18n.test.ts`).
- The app guide (`lib/ai/appGuide.ts`) was refreshed to the new labels. Its drift test passes.
