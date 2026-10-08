# Momentum — Feature Roadmap & Claude Code Task Routine

> Status: **PLAN ONLY. Nothing here is implemented yet.**
> Baseline as of this plan (v2.2.0, versionCode 66): 86 test files / **1712 tests passing**,
> `tsc` clean, `eslint src` 0 errors (4 warnings).

---

## 1. What the app is today (analysis)

Momentum is a local-first, sideloaded, single-user Android app (Expo 54 / RN 0.81 /
TypeScript / Zustand / SQLite + AsyncStorage, NativeWind, ru + en) with three logs and an
optional AI assistant:

| Area | What already exists (and is strong) |
|---|---|
| **Workout** | Routines, training sequence, focus mode, big rest pill with count-in beeps, timed / count-up / boxing rounds, supersets, warm-up generator, plate maths across gyms, weight carry-down, rep ladder (Fighter Pull-Up), overload nudges, deload notice, bests and e1RM (Epley), history with editing, graphs, calendar, sets per cluster with weekly targets, bodyweight log, session effort, post-workout debrief, random routine die, Health Connect write |
| **Tasks** | Daily / weekdays / once schedules, done vs. missed-on-purpose vs. unanswered, honest streaks (excused days kept), reminders with follow-ups, auto-tick from workout and money, month grid and trend |
| **Money** | Accounts (Cash / Online) with opening balances, separate expense and income categories, day or whole-month amounts, transfers, balance, trends with top-5 categories |
| **AI** | Gemini with the user's own key in the keystore. Per-section chats; routine proposals and edits rendered as editable cards that apply only on tap; reads debriefs and notes |
| **Platform** | One JSON export/import, weekly auto-backup to a folder, 8 themes plus a custom one, haptics, bubbles |

**Design philosophy the code enforces.** Every proposal below is checked against it:

1. Honest numbers. Nothing is faked, guessed or rounded silently.
2. No punishment. Training has no streak ("nothing to break"); task streaks forgive excused days.
3. Nothing nags by default. Notifications are opt-in, per item.
4. Decisions live in `src/lib/` as pure, tested functions. Screens are composition.
5. Offline, no account, no server. Only the AI touches the network.

## 2. What comparable apps do (research summary)

Apps compared: Strong, Hevy, JEFIT, Fitbod, Boostcamp, Liftosaur, RP Hypertrophy, Loop, Streaks, TickTick, Todoist, Habitica, Finch, Monefy, Money Manager, 1Money, YNAB, Wallet (BudgetBakers), Spendee, Exist.io, Bearable, Daylio, and Strava's Year in Sport.

**Where Momentum already matches or beats them:**
- Prefilled last numbers.
- Warm-up and plate calculators with multiple gyms.
- Approve-before-apply AI.
- Offline with no account. Users of FitNotes and Loop praise exactly this, and paywalls are the category's top complaint.

**Gaps that competitors use to drive engagement, all buildable offline:**

| # | Gap | Who does it |
|---|---|---|
| G1 | Forgiving consistency: weekly streaks, freezes or vacation mode, a habit-strength score | Hevy, Duolingo, Todoist, Loop |
| G2 | Year / month "Wrapped" and a Year-in-Pixels grid | Strava, Daylio |
| G3 | Cross-domain insights ("you finish more tasks in weeks you train 3+") | Exist.io, Bearable |
| G4 | Ongoing workout notification with rest controls; home-screen widgets | Hevy, Loop, Monefy |
| G5 | Muscle recovery / volume heat-map; RIR/RPE per set; set types (drop, failure) | Fitbod, RP, Strong |
| G6 | Budgets, recurring and planned payments, month-end forecast | YNAB, Wallet, Money Manager, 1Money |
| G7 | Measurable habits (8 glasses), "N times per week", negative habits | Loop, Streaks, TickTick |
| G8 | Opt-in XP, levels and achievements, without punishment | Todoist Karma, Habitica, Finch |
| G9 | Shareable summary card / PR celebration | Hevy, Strava |
| G10 | App lock, CSV export, tags | Monefy, Strong, Spendee |

## 3. Feature catalogue

**Effort:** S is about half a day, M is 1–2 days, L is 3+ days or needs a native dependency.
**Philosophy fit:** ✅ fits as is · ⚠️ fits only if opt-in or carefully shaped · ❌ conflicts with the design philosophy.

### A. Workout
| ID | Feature | Value | Effort | Fit |
|---|---|---|---|---|
| W1 | **RIR / RPE per set** (optional chip next to reps), shown in history and fed to AI and to nudges | Pro lifters expect it; makes overload smarter | M | ✅ |
| W2 | **Set types**: drop set, to-failure, AMRAP (with warm-up as today) | Matches Strong/Hevy | M | ✅ |
| W3 | **Muscle volume map**: SVG front/back body coloured by weekly sets per muscle (extends sets-per-cluster) | Very visual and engaging | M | ✅ |
| W4 | **Recovery estimate** per muscle (Fitbod-style, from sets × load × days since) on the Home hero | "What's fresh today" | M | ⚠️ (must state that it is an estimate) |
| W5 | **e1RM trend chart and PR timeline** per exercise | Data is already computed | S | ✅ |
| W6 | **PR celebration** on the Finish sheet: list of records broken this session, with SparkBurst | Rewarding moment | S | ⚠️ (README says "no medals, no banners", so it must be quiet) |
| W7 | **Shareable workout card**: render a PNG summary and share it via the Android share sheet | Social without a server | M | ✅ |
| W8 | **Weekly training goal**: "3 workouts/week" ring and weekly streak (weeks, not days; a missed week from illness can be excused) | Hevy's most effective retention mechanic | S | ⚠️ (calendar.ts refuses a streak, so this is a decision for you) |
| W9 | **Body measurements** (waist, arms, chest…) beside bodyweight, with trend lines | Common request | M | ✅ |
| W10 | **Cardio fields**: distance and pace for runs or swims (`meters` CountUnit already exists) | Rounds out the "cardio" cluster | M | ✅ |
| W11 | **Program templates**: a few built-in multi-week programs (5/3/1, PPL, GZCLP) loadable as a sequence | Boostcamp-style | L | ✅ |
| W12 | **Ongoing workout notification**: next set, rest countdown, Skip/+15 buttons | Big in-gym usability gain | L (native) | ✅ |

### B. Tasks / habits
| ID | Feature | Value | Effort | Fit |
|---|---|---|---|---|
| T1 | **Measurable tasks**: a target count ("8 glasses", "20 pages") with partial progress ring | Loop's #1 feature | M | ✅ |
| T2 | **"N times per week"** schedule (any days) | Flexible habits | M | ✅ |
| T3 | **Vacation / pause mode**: excuse a date range for all or some tasks in one action | Extends the existing "missed on purpose" | S | ✅ |
| T4 | **Habit strength score** (Loop's decaying %) beside the streak | Forgives one bad day | S | ✅ |
| T5 | **Year in Pixels**: 365 squares per task or overall | Daylio-style, visual | S | ✅ |
| T6 | **Notification actions**: "Done" / "Skip today" buttons on the reminder | Answer without opening the app | M | ✅ |
| T7 | **Negative habits** ("no sugar"): done means "avoided" | Streaks-style | S | ✅ |
| T8 | **Task notes / journal line** per day | Context for AI | S | ✅ |

### C. Money
| ID | Feature | Value | Effort | Fit |
|---|---|---|---|---|
| M1 | **Monthly budgets per category** with progress bar and an optional alert at 80% / 100% | #1 money feature everywhere | M | ✅ |
| M2 | **Recurring / planned payments** (rent, subscriptions), auto-created or confirm-to-create | Reason to open the app | M | ✅ |
| M3 | **Month-end forecast**: balance after planned payments plus average daily spend | Wallet's cash-flow forecast | S (after M2) | ✅ (labelled as an estimate) |
| M4 | **Money calendar**: month grid of daily spend (heat) | Money Manager's most-loved view | S | ✅ |
| M5 | **Savings goals**: target amount and date, fed from transfers | Motivating | M | ✅ |
| M6 | **Tags / notes search** across amounts | Spendee-style | M | ✅ |
| M7 | **CSV export** (amounts, workouts) | Strong's selling point; spreadsheets | S | ✅ |
| M8 | **Multi-currency** accounts (AMD + USD…) with manual rate | Real need if you hold USD | L | ⚠️ (balance math touches everything) |

### D. Cross-domain insights (Momentum's unique advantage: three logs in one app)
| ID | Feature | Value | Effort | Fit |
|---|---|---|---|---|
| X1 | **Monthly / yearly "Wrapped"**: swipeable story cards (tonnage, PRs, best streak, top category, busiest day) | Most shareable, most fun | M | ✅ |
| X2 | **Correlations**: "Tasks done 82% on training days vs 61% on rest days", "spending +24% on weekends"; only shown when there is enough data | Exist.io's core value | M | ✅ (honest thresholds) |
| X3 | **Weekly review** card on the landing every Monday (last week across all three logs) | Weekly ritual | S | ✅ |
| X4 | **AI weekly coach summary** (opt-in, uses the existing Gemini key) built on X3 | Uses the AI already in the app | S | ✅ |

### E. Engagement layer (opt-in, never punishing)
| ID | Feature | Value | Effort | Fit |
|---|---|---|---|---|
| E1 | **Achievements**: about 30 local badges ("100 workouts", "1 ton in a session", "30-day habit", "budget kept 3 months"), computed from the logs, so retroactive | Fun, no server | M | ⚠️ (off by default) |
| E2 | **XP and levels** across the three logs; no HP loss, no decay | Todoist Karma-like | M | ⚠️ (off by default) |
| E3 | **Streak freezes** earned by consistency (1 per 7-day run, max 2) | Duolingo's proven mechanic | S | ⚠️ (overlaps T3) |
| E4 | **Milestone moments**: a quiet one-time celebration at the 50th or 100th workout | Delight | S | ⚠️ |

### F. Platform / professional polish
| ID | Feature | Value | Effort | Fit |
|---|---|---|---|---|
| P1 | **Home-screen widgets**: today's tasks (tap to tick), quick-add expense, next workout | High-retention surface | L (native) | ✅ |
| P2 | **App lock** (biometric / PIN) via `expo-local-authentication` | Money data is private | S–M (native dependency) | ✅ |
| P3 | **Armenian (հայերեն) language** as a third language | Amounts are in AMD | M (translation volume) | ✅ |
| P4 | **Onboarding tour** for first launch (3 cards) | More professional | S | ✅ |
| P5 | **Health Connect read**: steps and sleep to auto-tick tasks ("10k steps") | Streaks-style auto-complete | M (new permissions) | ⚠️ |
| P6 | **Wear OS tile** | Expected by gym users | L+ (separate native app) | ✅ (but large) |
| P7 | **Fix the 4 ESLint warnings** and keep CI at 0 | Hygiene | S | ✅ |

## 4. Deep analysis → prioritisation

Each feature was scored on **value × engagement**, **risk to working code**, **native work**
(every native dependency needs a prebuild, an APK check and a new permission audit), and **philosophy fit**.

**Wave 0 — UX polish of the existing app** (§8, tasks T-U1…T-U8): small, low-risk, and every later feature lands on the improved base.

**Wave 1 — pure-logic, low-risk, high-delight** (no native deps; each has a `src/lib/` core plus tests):
`P7 → W5 → T3 → T4 → T5 → M4 → M7 → X3 → W6 → X1`

**Wave 2 — data-model changes** (need a backup/import migration and tests that old backups still import):
`W1 → W2 → T1 → T2 → T7 → M1 → M2 → M3 → M5 → W9 → W3 → X2`

**Wave 3 — opt-in engagement layer:** `E1 → E2 → E3 → E4 → W8 → X4`

**Wave 4 — native / large** (each its own release, with APK-artifact verification):
`P2 → T6 → W12 → P1 → P5 → P3 → W7 → W10 → W11 → W4 → M6 → M8 → P6`

> Why this order: Wave 1 ships visible value without touching the persisted schema. Wave 2
> touches `models.ts`, the stores and `backup.ts`, the parts where a bug can lose the training
> log, so it comes after the routine is proven. Native work comes last because each item adds
> build risk and a manifest check.

## 5. Task list (ready for Claude Code)

Every task uses the **Definition of Done** in §6. "Tests" lists the minimum new cases; existing
tests must stay green.

### Wave 1
- **T-01 · P7 Lint clean.** Fix the 4 ESLint warnings. *Tests:* `eslint src` reports 0 problems.
- **T-02 · W5 e1RM trend + PR timeline.**
  - `lib/records.ts`: `e1rmSeries(history, exerciseId)` and `prTimeline(...)`.
  - UI: ExerciseHistoryScreen gets a chart and a list.
  - *Tests:*
    - empty history
    - bodyweight-loaded lifts use body load
    - warm-ups excluded
    - ties
    - unit conversion
- **T-03 · T3 Vacation mode.**
  - `lib/tasks.ts`: `excuseRange(marks, taskIds, from, to)`.
  - UI: a TaskSettings sheet.
  - *Tests:*
    - the streak survives the range
    - the denominator shrinks
    - a range never overwrites `done`
    - one-off tasks inside the range
    - future days
- **T-04 · T4 Habit strength.**
  - `lib/habitStrength.ts`: Loop's decaying score, with excused days neutral.
  - *Tests:*
    - monotonic in completions
    - bounded 0–100
    - a single miss after a long run drops it by less than X
    - schedule-aware (weekday tasks)
- **T-05 · T5 Year in Pixels.**
  - `lib/yearPixels.ts` plus a component in TasksHistory.
  - *Tests:*
    - leap year
    - days before `startedOn` blank
    - excused days distinct
    - Monday-first alignment
- **T-06 · M4 Money calendar.**
  - `lib/moneyCalendar.ts`: daily totals and heat buckets. Whole-month amounts are excluded from days and shown separately.
  - *Tests:*
    - transfers excluded
    - month amounts
    - per-account filter
    - empty month
- **T-07 · M7 CSV export.**
  - `lib/csv.ts` for amounts and workout sets, with RFC 4180 quoting.
  - Uses the existing file-picker flow.
  - *Tests:*
    - commas, quotes and newlines in names
    - Cyrillic / UTF-8 BOM
    - warm-ups flagged
    - empty data gives a header only
- **T-08 · X3 Weekly review card.**
  - `lib/weeklyReview.ts` for the last Mon–Sun across three logs; the landing shows it on Monday until dismissed.
  - *Tests:*
    - week boundaries
    - clauses dropped when empty (house rule)
    - dismiss persistence
- **T-09 · W6 PR summary on Finish.**
  - `lib/records.ts`: `recordsBrokenIn(session, history)`.
  - UI: a quiet list on the FinishSheet.
  - *Tests:*
    - first-ever session is not "all PRs" (decision needed)
    - warm-ups ignored
    - ties are not records
- **T-10 · X1 Wrapped.**
  - `lib/wrapped.ts` builds the period stats.
  - A WrappedScreen with swipe cards, reachable from history and the landing in December/January.
  - *Tests:*
    - each stat on the fixture history
    - empty domains omitted
    - ru/en strings present

### Wave 2
- **T-11 · W1 RIR/RPE per set.**
  - Optional field on the set row; shown in the editor, history and AI context.
  - Backup round-trip.
  - *Tests:*
    - old backups import with the field absent
    - AI context includes it
    - nudge ignores sets above RPE 9 (decision needed)
- **T-12 · W2 Set types** (drop / failure / AMRAP).
  - Volume rules, shorthand glyphs, counting rules.
  - *Tests:* shorthand, volume, ladder and nudge interaction.
- **T-13 · T1 Measurable tasks.**
  - Target and unit, partial progress, done at the target.
  - *Tests:* progress math, streak at partial, auto-tick unaffected, migration.
- **T-14 · T2 N-times-per-week.**
  - *Tests:*
    - week boundary
    - over-completion
    - streak counted in weeks
    - mixed with excused days
- **T-15 · T7 Negative habits.**
  - *Tests:* labelling and streak semantics.
- **T-16 · M1 Budgets.**
  - `lib/budgets.ts`: per category per month, with optional 80/100% local notification.
  - *Tests:*
    - month amounts count
    - transfers excluded
    - rollover off by default
    - archived categories
- **T-17 · M2 Recurring payments.**
  - `lib/recurring.ts` with a schedule, next-due date and confirm-to-create.
  - *Tests:*
    - 31st-of-month in February
    - catch-up after the app was closed for weeks
    - no duplicates on double launch
- **T-18 · M3 Forecast.**
  - *Tests:* planned and average-spend math; labelled as an estimate; no data means no forecast.
- **T-19 · M5 Savings goals.**
  - *Tests:* progress from transfers, past-due goal, archived account.
- **T-20 · W9 Body measurements.**
  - *Tests:* units and backup.
- **T-21 · W3 Muscle volume map.**
  - SVG body plus `lib/muscleVolume.ts`.
  - *Tests:* secondary muscles count half (decision needed), cluster sums match the existing screen.
- **T-22 · X2 Correlations.**
  - `lib/insights.ts` with a minimum sample size and an effect-size threshold.
  - *Tests:*
    - nothing shown below the threshold
    - direction wording
    - no division by zero

### Wave 3 (all behind one "Achievements & levels" switch, off by default)
- **T-23 · E1 Achievements.**
  - `lib/achievements.ts` is a pure function of the logs, so it is retroactive.
  - *Tests:* each badge's boundary (99 vs 100 workouts…) and stability across re-computation.
- **T-24 · E2 XP / levels.** *Tests:* deterministic XP, no negative XP, level curve.
- **T-25 · E3 Streak freezes.** *Tests:* earn and spend rules, cap, interaction with excused days.
- **T-26 · E4 Milestones.** *Tests:* shown exactly once.
- **T-27 · W8 Weekly training goal.** *Tests:* ISO weeks, illness-excused week.
- **T-28 · X4 AI weekly summary.** *Tests:* prompt contains the X3 data; no call without a key.

### Wave 4 (native — one release each)
- **T-29 · P2 App lock.**
- **T-30 · T6 Notification actions.**
- **T-31 · W12 Ongoing workout notification.**
- **T-32 · P1 Widgets.**
- **T-33 · P5 Health Connect read.**
- **T-34 · P3 Armenian.** An i18n completeness test fails on any missing key.
- **T-35 · W7 Share card.**
- **T-36 · W10 Cardio fields.**
- **T-37 · W11 Program templates.**
- **T-38 · W4 Recovery estimate.**
- **T-39 · M6 Tags + search.**
- **T-40 · M8 Multi-currency.**
- **T-41 · P6 Wear OS tile.**

Each Wave 4 task adds an APK-level check: `aapt2 dump badging` for new permissions, and `grep -a` of the bundle for a new ASCII string.

## 6. The Claude Code routine (per task)

```
 1. PICK     next task from §5; restate its acceptance criteria in TaskCreate.
 2. READ     the neighbouring lib/screen/test files first (house style: file header
             explains the decision and rejected alternatives).
 3. LIB      write the decision as a pure function in src/lib/ (or the store).
 4. TEST     write tests FIRST for every rule + edge case listed in the task;
             watch them fail, then implement until green.
 5. MODEL    if persisted shape changes: optional field, validator in the store,
             backup.ts export/import, test that an OLD backup still imports.
 6. UI       compose the screen from existing primitives; ru + en strings in i18n.
 7. CHECK    npx tsc --noEmit · npx vitest run · npx eslint src · npx prettier --write src
             (all four, zero failures — the suite is the bug memory).
 8. REVIEW   re-read own diff adversarially; nothing else in the app changes behaviour.
 9. RELEASE  bump app.json version + versionCode + package.json; expo prebuild;
             gradle assembleRelease (background, ~10 min); copy to momentum-<ver>.apk.
10. VERIFY   apksigner (CN=Android Debug, FA:C6:17:45…), aapt2 badging (version,
             no RECORD_AUDIO, expected permissions), grep -a bundle for a new string.
11. SHIP     git add -f the APK; one-line commit; push.
12. LOG      mark the task done; note any decision taken for the next task.
```

**Safety rails**
- Never change behaviour outside the task.
- Never delete an older APK.
- Never break import of an old backup.
- Never add a default-on notification.
- Never fake a number.

## 7. Decisions needed before coding

These become the questions in the next step (when you say **start**):
- which features and waves you want
- whether to break the "no training streak" rule
- the UX behaviour changes: U6 (task tap no longer cycles to "missed") and U10 (Landing gets a quick-action row; Settings becomes a slim row)
- whether gamification is in at all
- release cadence: one APK per task or per wave
- branch target
- whether to install the Android SDK in this cloud container to build APKs here

## 8. UX optimisations to the existing app (audit of the current screens)

Each finding was read from the code (file:line) and the key ones were re-checked by hand:
the Landing `accounts[0]` bug, the task tap cycle, the `inkFaint` contrast (3.13:1) and
the 136 `allowFontScaling={false}` uses. Effort: S/M/L as above.

### Things to KEEP (do not "fix" these)
- The floating commit slot.
- The amount editor's own keypad with an "asleep" Save.
- The ghost-prefilled set that logs in one tap, the ± chips, and focus mode's 176 dp DONE.
- Undo instead of confirm for removing sets and exercises.
- Tapping a Money tile logs on that category, on the day being viewed.
- ⟲ history in the same corner of every section; Android back order (sheet → pop → home → double-press exit).
- Spoken labels on every icon button; skeletons while loading.

### High impact
| ID | Problem (where) | Fix | Effort |
|---|---|---|---|
| U1 | **Tasks list starts below the fold**: about 500 dp of top bar, dial, kicker, pills and AI card before row 1, so only about 2 rows are visible (`TasksScreen.tsx:407-472`) | Move the AI card under the list; shrink the dial to about 140 dp, or collapse it to the bubble when there are more than 4 rows | S |
| U2 | **The AI entry card can't be dismissed** and duplicates the ✦ orb in all three sections (`AiEntryCard.tsx`, `HomeScreen.tsx:347`, `TasksScreen.tsx:472`, `MoneyScreen.tsx:514`) | Show it until the first chat or a ✕, then rely on the orb | S |
| U3 | **`inkFaint #57615C` is 3.1:1 contrast**; 166 uses include empty states, "Delete this workout" and "Undo last set" | Raise the token to about `#7D8882` (5.5:1); actionable text uses `inkMuted` | S |
| U4 | **Phone font size is ignored**: 136 × `allowFontScaling={false}` | `maxFontSizeMultiplier={1.3}`; keep `false` only on the measured focal numerals | M |
| U5 | **Save sits in the top-right header** in the Routine editor and Create exercise (`RoutineEditorScreen.tsx:488`, `CreateExerciseScreen.tsx:305`), breaking the app's own "commit lives in the floating slot" rule | Use `FloatingAction` with the worded pill, as TaskDetail does | S |
| U6 | **A double tap marks a task "missed on purpose"**: the tap cycles unanswered → done → missed (`tasksStore.ts:368`) and removes it from the denominator silently | Tap toggles done/undone; "Skip today" goes in long-press or the task screen, or show a toast "Marked skipped · Undo" | M |
| U7 | **The task editor drops a typed draft** on a scrim tap, a handle drag or back (`TaskEditorSheet.tsx:211`) | "Discard changes?" when dirty (reuse the leave-guard) | S |
| U8 | **Return key does nothing** in TaskEditorSheet and NumberSheet, and the keyboard covers Save (`NumberSheet.tsx:87`) | `onSubmitEditing` saves when valid | S |

### Medium impact
| ID | Problem (where) | Fix | Effort |
|---|---|---|---|
| U9 | **Bug:** the Landing Finance tile shows `accounts[0]` even when it is archived (`LandingScreen.tsx:97`) | First live account, or the last selected one | S |
| U10 | **The Landing has no direct action**: the 34 sp greeting is the largest thing and Settings is a full tile; logging an expense takes tile → FAB → digits → Save | Shorter tiles, Settings as a slim row, a **quick-action row** (+ Expense, next task ✓, Resume workout) | M |
| U11 | **Long-press-only actions with no visual cue**: money subsection chip, category detail, reorder exercise cards, the routine die options | ⋯ on the selected chip, "›" on tiles, a grip glyph on reorderable cards | M |
| U12 | **The Workout empty state has no button** ("find the list glyph in the corner") and the FAB slot is empty (`HomeScreen.tsx:1499`) | A "+ New routine" FAB plus a button in the card | S |
| U13 | **Tasks empty state repeats itself** (two "nothing" lines) and shows the reorder hint with 0–1 rows | One empty card with "Add your first task"; hint only with 2+ rows | S |
| U14 | **An archived AI chat deletes in one tap** (`AiChatScreen.tsx:351`) | Undo toast | S |
| U15 | **A delete "−" on every row of the add-exercise picker** reads as "deselect" (`ExerciseLibraryScreen.tsx:475`) | Hide it in the picker; trash icon in an edit mode | S |
| U16 | **"Stop and exit" sits next to "Restart clock"** as 34 dp chips in the session header (`ActiveWorkoutScreen.tsx:969`) | A ⋯ overflow in the header | S |
| U17 | **Small targets in the amount editor**: Expense/Income is 30 dp, the date chevrons are 28×30 (`AmountEditorScreen.tsx:1215,1304`) | 44 dp minimum | S |
| U18 | **Money "+ subsection" and ⇄ chips are 38 dp** with no hitSlop (`MoneyScreen.tsx:423,436`) | `hitSlop={6}` | S |
| U19 | **Destructive styling is inconsistent** (coral / muted / faint; some confirms lack `tone="danger"`) | One rule: muted text at the foot of the screen, plus a danger-tone confirm | S |
| U20 | **"Delete this workout" directly under "Workout number"** with no gap (`HistoryScreen.tsx:1266`) | 24 dp gap and a hairline | S |

### Low impact / polish
| ID | Problem (where) | Fix | Effort |
|---|---|---|---|
| U21 | Text at 10–10.5 sp (FinishSheet labels, AiBlocks, bubble kickers, AiReview) | Never below micro (12.5) | S |
| U22 | "Undo last set" in focus mode is faint micro text | An outlined chip in `inkMuted` | S |
| U23 | The Workout top bar has 4 unlabelled glyphs (≡ and 📖 look alike); the others have 2 | Merge into one "Routines & exercises" destination | M |
| U24 | Section settings are only reachable via Settings → row | "Settings ›" at the foot of each section's history | S |
| U25 | The money keypad has no decimal key although USD/EUR can be chosen | A decimal key for currencies with cents | M |
| U26 | The AI chat input is single-line | Multiline, up to 4 lines | S |
| U27 | The 64 dp FAB covers the right column of rows mid-scroll | Hide on scroll-down, show on scroll-up | S |
| U28 | The stepper button is 36 dp + hitSlop 4 (`primitives.tsx:376`) | hitSlop 6–8 | S |

### UX tasks (become **Wave 0**, done before the features: small, low-risk, every screen benefits)
- **T-U1 · Readability pass:** U3, U4, U21, U22. *Tests:*
  - a contrast test in `theme.test.ts` that asserts every text token is ≥ 4.5:1 on bg, surface and surfaceAlt
  - a grep-style test that fails on `fontSize` < 12.5 in `src/`
- **T-U2 · Touch-target pass:** U17, U18, U28, U20, U16. *Tests:* a test of the hit-size helper; manual checklist in the APK.
- **T-U3 · Commit-slot consistency:** U5, U12, U27. *Tests:* a leave-guard test for the editors that now use the FAB.
- **T-U4 · Tasks screen:** U1, U2, U6, U13. *Tests:*
  - `cycleMark` → `toggleMark` semantics: done ↔ unanswered, and skip only through an explicit action
  - old logs with `missed` are untouched
  - the AI card's dismissed flag persists
- **T-U5 · Sheets and keyboards:** U7, U8, U26. *Tests:* dirty-state helper (`lib/inlineEditor`-style), submit-on-return validity.
- **T-U6 · Landing:** U9 bug plus the U10 quick-action row. *Tests:*
  - the Landing account picks the first non-archived account
  - quick-action visibility rules (Resume only with a live session; next task only when one is unanswered)
- **T-U7 · Discoverability:** U11, U15, U23, U24. *Tests:* the picker hides delete; menus expose every long-press action.
- **T-U8 · Safety and consistency:** U14, U19, U25. *Tests:*
  - undo restores an archived chat
  - decimal key only for currencies with minor units; amounts stay integers in minor units

> Two of these change behaviour you may be used to: **U6** (what a tap on a task does) and
> **U10** (Landing layout). They are on the question list in §7.
