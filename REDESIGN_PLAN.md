# Redesign plan: findability (brief: `momentum-redesign-prompt.md`)

## Where things live
- **Tokens:** `src/theme/tokens.ts`.
  - `palette.acc` / `tint(alpha)` for acc-soft (0.14) and the acc outline (0.45).
  - `glass.raised` / `glass.sunken` / `glass.raisedEdge` for glass and wells.
  - `danger` + `dangerTint` (allowed only in `components/primitives.tsx`, `ConfirmSheet.tsx` and `tokens.ts`; enforced by `lib/destructive.test.ts`).
  - The type scale is in `tailwind.config.js`. `text-micro` = the 12.5 px floor, guarded by `lib/theme.test.ts`.
- **Shared primitives** (`src/components/primitives.tsx`):
  - Existing: `Kicker`, `GlassCard`, `Segmented`, `SelectChip`, `Toggle`, `PrimaryButton`, `TextButton`, `DangerFootAction`, `StepperRow`, `SwitchRow`.
  - **Added for this redesign:**
    - `ValueWell`: the 40 dp tappable well.
    - `CaptionedIconButton`: a 46 dp circle with a caption.
    - `MoreButton`: a 44 dp ⋯.
    - `DangerButton`: the full-width red button.
    - `RemoveRowButton`: a 44 dp danger-soft −.
    - `DangerZone`: the Archive/Delete group.
- **Icons** (`src/components/Icon.tsx`): **added** `focus` (viewfinder), `timer`, `calendar`, `grip` (⋮⋮) and `accounts`.
- **Sheets:** `components/Sheet.tsx`, `NumberSheet.tsx`, `DayPicker.tsx`, `ConfirmSheet.tsx`.
- **Settings** (`state/settingsStore.ts`): **added** the persisted one-time flags `seenSetTypeTip` and `seenLeaveRunningTip`, set through `setFlag`.
- **Strings:** `src/lib/i18n.ts` (an EN-keyed Russian dictionary). One anchor comment per group, for parallel insertion.

## Groups (worked in parallel; each owns its files)
| Group | Items | Files owned |
|---|---|---|
| A | #1 set row, #2 QuickAdjust, set-type sheet, badge tip | `SetRow.tsx`, `QuickAdjust.tsx`, `SetMarksSheet.tsx`, `lib/setType.ts`, new `SetTypeTip.tsx`; the `<SetRow>` / `<QuickAdjust>` elements in `ExerciseCard.tsx`; the set-level handlers in `ActiveWorkoutScreen.tsx` |
| B | #3 card header/edit mode, #4 add exercise + session options, #5 Focus icon, dock, #6 Finish sheet, #7 leave toast | `ExerciseCard.tsx` (header, footer, edit chrome), `ActiveWorkoutScreen.tsx` (header, options sheet, dock, toast), `SessionHeader.tsx`, `FinishSheet.tsx`, `lib/finishSheet.ts`, `lib/routinePlan.ts` |
| C | #7 Home resume card, #8 hero + FAB, #9 top-bar captions, #10 nav labels, #11 progress card / links / weekly goal card, #13 goal setting, #18 empty state | `HomeScreen.tsx`, `LandingScreen.tsx`, `NavBar.tsx`, `SectionTopBar.tsx`, `WeeklyGoal.tsx`, `WorkoutSettingsScreen.tsx`, `AppShell.tsx` (routing) |
| D | #12 history Calendar, #14 bodyweight, #15 past-workout editing | `HistoryScreen.tsx`, `CalendarScreen.tsx`, `BodyScreen.tsx`, `ProgressScreen.tsx`; the "Cal" label in `AppShell.tsx` |
| E | #16 routines, #17 library/history/editor + danger zone, #18 sequence screen | `RoutineListScreen.tsx`, `RoutineEditorScreen.tsx`, `RandomRoutineSheet.tsx`, `ExerciseLibraryScreen.tsx`, `ExerciseHistoryScreen.tsx`, `CreateExerciseScreen.tsx`, `SequenceScreen.tsx` |
| F | #19 tasks, #20 finance tiles, the Accounts top-bar button, danger zones on task and account | `TasksScreen.tsx`, `TaskDetailScreen.tsx`, `TaskEditorSheet.tsx`, `MoneyScreen.tsx`, `CategoryDetailScreen.tsx`, the account-edit UI |
| G (after A–F) | §6 vocabulary renames (AI coach, Finance, Account, Calendar, Reps left (RIR)), app guide refresh | i18n keys across `src/`, `lib/ai/appGuide.ts` |

Contract for `SectionTopBar` (C builds it; C and F use it): `TopBarAction` gains `caption?: string`, and the history button shows `historyCaption` (default "History").

After A–F: an independent bug review, the vocabulary pass, the full checks (tsc, eslint, prettier, vitest), the build and APK verification, one commit per group, and `REDESIGN_CHANGELOG.md`.
