# Progress — Waves 0–3

Resume rule: re-read this file, `IMPLEMENTATION_DECISIONS.md` and `ROADMAP.md`, then carry
on from the first unchecked task. One version bump at the very end; no APK built here.

Baseline (v2.2.0): tsc clean · 86 files / 1712 tests · eslint 0 errors, 4 warnings.

## Wave 0 — UX
- [x] T-U1 Readability pass (U3, U4, U21, U22)
- [x] T-U2 Touch-target pass (U17, U18, U28, U20, U16)
- [x] T-U3 Commit-slot consistency (U5, U12, U27)
- [x] T-U4 Tasks screen (U1, U2, U6, U13)
- [x] T-U5 Sheets and keyboards (U7, U8, U26)
- [x] T-U6 Landing (U9, U10)
- [ ] T-U7 Discoverability (U11, U15, U23, U24)
- [ ] T-U8 Safety and consistency (U14, U19, U25)

## Wave 1
- [ ] T-01 Lint clean
- [ ] T-02 e1RM trend + PR timeline
- [ ] T-03 Vacation mode
- [ ] T-04 Habit strength
- [ ] T-05 Year in Pixels
- [ ] T-06 Money calendar
- [ ] T-07 CSV export
- [ ] T-08 Weekly review card
- [ ] T-09 PR summary on Finish
- [ ] T-10 Wrapped

## Wave 2
- [ ] T-11 RIR/RPE per set
- [ ] T-12 Set types
- [ ] T-13 Measurable tasks
- [ ] T-14 N-times-per-week
- [ ] T-15 Negative habits
- [ ] T-16 Budgets
- [ ] T-17 Recurring payments
- [ ] T-18 Forecast
- [ ] T-19 Savings goals
- [ ] T-20 Body measurements
- [ ] T-21 Muscle volume map
- [ ] T-22 Correlations

## Wave 3 (one switch, off by default)
- [ ] T-23 Achievements
- [ ] T-24 XP / levels
- [ ] T-25 Streak freezes
- [ ] T-26 Milestones
- [ ] T-27 Weekly training goal (ring, no streak)
- [ ] T-28 AI weekly summary

## Release
- [ ] Version bump, final gate, push

## Log
- T-U1: inkFaint #57615C→#7D8882 (tokens, global.css; neutrals now `NEUTRALS` in lib/theme.ts + `contrastRatio`); the #6B766F "between" greys and actions ("Delete this workout", "Remove exercise", "Not this time") moved to inkFaint/inkMuted; 123× allowFontScaling={false}→maxFontSizeMultiplier={1.3} (RunningText gained the prop), false kept only on measured numerals (focus numerals+units, focus clock, timer-pill clock, RollingNumber, day dial, set-row numerals, landing figure, Home stat twin of a RollingNumber); every literal font <12.5 raised to 12.5 (39 sites + stepper/segment floors); focus "undo last set" is an outlined inkMuted chip; glass raised .055 + new `glass.raisedEdge` .06 (GlassCard raised uses it), lit .13/.30, `radius.sheet` 22 (Finish/Debrief sheets), radius header comments rewritten. Tests: contrast (inks + every preset acc on bg/surface/surfaceAlt), global.css↔NEUTRALS sync, type-floor grep, allowFontScaling allow-list. · decisions: tailwind `surface` stays 14 (design keeps set rows/wells at 14); floating `Sheet` SHEET_RADIUS 34 untouched (inset floating pane, not the design's edge sheet); stepper value of 5 chars is 12.5 (was 12), may be tight in its 34 dp slot. · skipped: AiOrb decorative star glyphs (8/11) treated as icons, not text.
- T-U2: `lib/hitTarget` (`hitSlopFor(visual, min=44)`, `reach`, `slopInsets` with per-side caps; TOUCH_MIN 44 / TOUCH_MIN_WORKOUT 48) + 14 tests; U17 amount editor Expense/Income halves 30→38 with the track's 3 dp as vertical slop (44), day chevrons drawn 44×44 (chip 38→44, old slop 8 dropped); U18 Money `+` and `⇄ Transfer` chips hitSlop 6; U28 stepper −/+ slop 4→6 (48) with the facing sides capped at 2 so they never overlap; U20 "Delete this workout" 24 dp + hairline below "Workout number"; U16 session header ⋮ (new `Icon` "more", `SessionHeader.onMenu`, 46 dp) opens a "Session options" Sheet: Restart clock (only once started → the existing Restart confirm) and Stop and exit… (→ `handleStopAndExit`, danger ConfirmSheet when sets are logged); header chip line and `SessionChip` removed. · decisions: menu is a `Sheet` with two 64 dp rows (the Money long-press pattern) rather than the design's top-right popover — no popover primitive exists; Stop row muted, not coral (the colour stays on the confirm); segment kept 38 drawn (not 44) so it matches the chips in its row; ru for "Restart clock" kept as shipped (Сбросить время), not the design's wording. · skipped: none. · APK checklist: (1) amount editor — tap Expense/Income at the top and bottom edge of the pill, and each day chevron; (2) Money — tap just outside `+` and `⇄`; (3) History → open a workout → Date/Started/Took steppers: taps between − and + hit the one aimed at, "Delete this workout" sits apart under a hairline; (4) session: ⋮ top-right opens the sheet, Restart only after Start, Stop with sets logged asks in the coral sheet, without sets exits; back closes the sheet.
- T-U3: U5 Routine editor and Create exercise lose the header Save/Create; a worded `FloatingAction` (✓ Save / Create, at new token `pushedSlot.bottom` 28; scrolls pad `pushedSlot.clearance` 116) is the commit — hidden while a row is lifted or a sheet is up (header keeps `Drop` only), Create asleep (no-op) while the name is empty; leave rules unchanged but now through pure `lib/editorLeave.ts` (`editorBack`, `editorGuardsBack`, `editorCommitSlot`) + 15 tests incl. each editor's dirty check. U12 Workout empty state split: no routines → kicker "No routines yet", "Make your first routine" / "It appears here, one tap from starting." + `New routine` button; routines all empty → "Nothing to open" + ghost `Open routines`; the slot shows a round `+` "New routine" once the log is read (HomeScreen gained `onNewRoutine` → AppShell `handleAddRoutine`). U27 `lib/fabScroll.ts` (`nextFabScroll`, anchor-based: hide on >6 dp down past 40, return on >6 dp up from the turning point) + 12 tests; `useBubbleOnScroll` returns `fabHidden`; `FloatingAction hidden` slides 180 dp / 320 ms × motion scale (instant at reduced motion), untouchable and hidden from TalkBack while away; applied on Workout home, Tasks, Money. · decisions: anchor instead of the prototype's per-event delta (slow drags at 16 ms throttle never passed 6); the all-empty case gets `Open routines`, not `New routine`; orphaned "list glyph in the corner" string removed from i18n. · skipped: none.
- T-U4: U1 day dial 196→132 (stroke 8, `focalType.dayDial` 44/46) with the weekday inside it (kicker row gone), rows 74→60, AI card moved under the list (hidden on an empty screen), bubble line 170/130 — six to seven rows above the fold at 360×800. U2 `AiEntryCard` (all three sections) gets a 44 dp ✕ ("Hide the assistant card") and renders nothing once the section is dismissed or has a chat (`lib/aiEntry.ts` `aiCardShown`); new optional settings field `aiCardsDismissed?: AiSection[]` + `dismissAiCard`, kept through Reset, carried by backup; tests for sanitize, store, backup round trip, a 2.2.0 backup without the key, cold start with old storage. U6 `lib/taskTap.ts` (`toggledMark`, `taskRowActions`, `tasksEmptyState`, `showTasksHint`) + 12 tests; store `cycleMark` → `toggleMark` (done ↔ unanswered, returns the replaced mark); long-press opens a hold-menu Sheet: Skip today, on purpose (→ `setMark('missed')` + shell Undo toast restoring the previous mark) / Take the skip back (on an excused row → unanswered) / Move (→ the old lift-and-slide reorder, only with 2+ rows) / Open history; `TasksScreen` gained `onToast` (AppShell passes `setToast`). U13 no live tasks → one dashed "Add your first task" card opening the editor (new token `glass.ghostEdge`); tasks but none today → one line; pills hidden on an empty day; hint ("Tap a circle… Hold a row to skip today on purpose or move it.") only with 2+ rows. Old `missed` logs untouched (store + rehydrate tests); auto-tick unchanged. · decisions: a tap on an excused row makes it DONE (the design's tapTask; a tap means "I did it"), un-skipping without claiming it is the menu's "Take the skip back"; tap itself shows no toast (it is its own undo) — only the skip does; Undo toast reuses the shell's `Toast` at its existing 4.5 s, not 4 s; dial kept as a dial (no collapse past 4 rows); first chat is recorded into `aiCardsDismissed` by the card so deleting past chats doesn't bring it back; past-day skip uses "Skip this day…"/"Skipped on purpose…" copy. · skipped: the design's "Pause for a while…" and "Edit task" menu rows — pause is T-03 (add it to `taskRowActions` and the hint then); edit lives on the task screen (Open history).
- T-U5: U7 `SheetFrame`/`Sheet` gained an optional `guard: SheetGuard` ((proceed) => boolean) asked before scrim, handle drag (springs back when held), hardware back and a child's `Cancel`; no guard = unchanged. TaskEditorSheet asks "Discard changes?" (danger ConfirmSheet, Keep editing / Discard changes, body differs new vs. edit) only when `lib/sheetDirty.ts` `taskDraftChanged(opened, wouldSave)` says saving would write something different; answer via `editorBack`. U8 `FieldWell` gained `onSubmitEditing` (keeps focus, `submitBehavior="submit"`) and `keyboardReach` (the composer's pan-mode padding trick); return saves in TaskEditorSheet and NumberSheet through `lib/sheetSubmit.ts` (`sheetNumber`, `taskSavable` — the same rule as the buttons); NumberSheet's field reach is measured to the pane's foot so pan lifts Save/Cancel above the keyboard. U26 AI composer multiline, 1→4 lines at 22 lh then scrolls inside, ➤ bottom-aligned, thread padding follows the measured pill. 24 tests. · decisions: dirty = "save would write something different" (trimmed name, day order, once-day as start), not the prototype's any-touch flag; `Cancel` asks too (it is a way out like the others); confirm label reuses `Discard changes` (the bare `Discard` key is already `Отклонить` for AI); return in the composer is a newline, ➤ sends. · skipped: none — keyboard lift in NumberSheet and composer growth need an on-device check (pan mode can't be tested here).
- T-U6: U9 Finance reads `lib/landing.ts` `landingAccount(accounts, moneyWindow.accountId)` — the account last chosen in the money section this session (shell's money window), else the first live one, never an archived one (null → "No accounts yet"). U10 tiles 262→150 dp (radius 24, 44 dp glyph, 21 sp name), Finance a full-width 104 dp row with the balance (`figureFontSize` gained an optional `largest`, 30 here) and chevron, Settings a 56 dp sunken row (theme · last backup, three dots, ›); every door still measures its own rect for the grow transition. Quick-action row of 48 dp chips under the subline (`quickActions`): `+ Expense` (with a live account) → `jumpFromLanding('Expenses', moneyAmount{expense, today, landing account, quickCategoryId})`; next task (`nextUnansweredTask`: first `mark === null` row in `tasksOn` order for today, skipping `auto` rows while autoTickTasks is on, as the prototype) — ✓ is `toggleMark` + Undo toast (`setMark` back); `▶ Resume workout · m:ss` only with a STARTED session → `jumpFromLanding('Workout', session)`. A comment marks the slot between Finance and Settings for T-08 weekly review / T-10 Wrapped. LandingScreen props: `workoutInProgress` → `runningSince`, + `moneyAccountId`, `onAddExpense`, `onResume`, `onToast`. 20 tests. i18n: `Finance · {account} · {spent} spent in {month}` (replaces the `all time` key), `Done: {name}`, `Mark {name} done`, `Resume workout · {time}`. · decisions: quick actions land IN the section with the screen on top (prototype's amountFromLanding; finish lands where the celebration/debrief play), via `jumpFromLanding` which applies navigate's leave rules; the task chip gets an Undo toast (the chip moves on, so the tick is otherwise out of reach); `last selected` account is the in-session money window, not persisted (no new stored field); measurable rows (design's `count` kind) don't exist yet — Wave 2 should add `kind !== 'count'` to `nextUnansweredTask`. · skipped: none — chip wrap and tile heights at font scale 1.3 need an on-device look.
