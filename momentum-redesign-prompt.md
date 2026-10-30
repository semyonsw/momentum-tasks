# Momentum: findability redesign. Implementation brief for Claude Code

You are working in the `momentum-app` repo (React Native, Android, one-handed use, dark OLED + frosted-glass look). Implement the redesign described below **1:1**. The mockups exist on a design canvas, but everything you need is written here. Do not invent features beyond this brief.

---

## 0. How to work

1. **Explore first. Do not edit yet.** Map the codebase and write a short plan to `REDESIGN_PLAN.md` with:
   - The theme/tokens file: where `acc`, the glass card styles, the type scale and the 12.5 px floor live.
   - The components for:
     - the live workout session screen, the exercise card, the set row, QuickAdjust (the inline ± editor), Focus mode, and the "Set type & Reps in reserve" sheet;
     - the Finish sheet, the bottom nav, the FAB and the section top bars;
     - the Workout hero card, the Progress card, training history (Log/Graphs/Cal), the past-workout editor and Body measurements;
     - `NumberSheet`, `DayPicker`, the routine editor, the exercise library, exercise history, the exercise editor and the training sequence;
     - task rows and the hold menu, task detail, Finance category tiles, the Subsection screens, AI chat and Settings.
   - Every user-visible string that must be renamed (see §6). Grep for them.
   - For each numbered item below, the file(s) you will touch.
2. **Work in small commits**, one numbered item (or a tight group) per commit. Message format: `redesign(#N): <what moved>`.
3. **Respect the visual language exactly.**
   - Use only the existing tokens: the near-black background, glass cards, the single green `acc` (it means "this is the thing to do") and the existing danger red.
   - Add **no** new colours, fonts or decorative elements.
   - Minimum font size is **12.5 px**. Touch targets are **≥ 44 dp**. Set rows stay **56 dp**.
   - The layout must work from **360 to 412 dp** width.
4. **Reuse existing components.** Use `NumberSheet` for keypad entry and `DayPicker` for date picking. Use the existing bottom sheet, chip and pill primitives. If a primitive is missing (for example a "well" field or a labelled icon button), create it once in the shared components folder and reuse it everywhere.
5. **Accessibility.**
   - Every icon-only control gets an `accessibilityLabel`.
   - Toggles use `accessibilityRole="switch"` or `"checkbox"` with `accessibilityState`.
   - Tabs and segments use the tab role.
6. **Run the checks after each group.** Run the existing typecheck, lint and tests, and fix what you break. Add or adjust tests where tests exist for the touched components.
7. **When finished,** write `REDESIGN_CHANGELOG.md`. List each numbered item, the files changed, and anything you could not do 1:1 and why.

---

## 1. Global findability rules (apply everywhere)

- **Every hold has a visible twin.** Each long-press gets one of: a labelled button, a "⋯" (44 dp), or a ⋮⋮ grip mark (for reorder).
- **A number shows a value.** If tapping it does something, it must *look* tappable. Use the **well** style: a 40 dp tall field with a subtle fill (`rgba(255,255,255,.06)`-ish, from existing tokens), a 1 dp hairline border and 11 dp radius.
- **An icon that leads to a destination gets a micro caption** (12.5 px, muted) under its 46 dp circle.
- **One word per concept across all sections** (see §6).

Reference values used in the mockups (map them to the nearest existing tokens; do not hard-code them):

- background: `#000`
- glass card: white at 5.5% with a white 11% hairline, radius 22
- muted text: about `#A9AEAB`
- `acc`: about `#4FE08A`, with ink-on-acc about `#03140A`
- acc-soft fill: `acc` at 14%; acc outline: `acc` at 45%
- danger: about `#FF6B6B`

---

## 2. Live workout session (highest priority)

### #1 Set row (56 dp), the full spec

**Grid:** `80 | 1fr | 1fr | 48`, gap 6, inside a card with 12 dp padding.

- The lead column (80) holds the **W toggle** (30), a 6 dp gap, and the **set well** (44).
- At 360 dp each value well is about 79 dp wide; at 412 dp it is about 105 dp.

**Lead column, part 1: the W warm-up toggle.** It replaces the old tiny `[ ]W` checkbox.

- One **30 × 30 dp rounded square** (radius 9) with the letter **W** centred (13 px, weight 800).
- **Off:** 1.5 dp **dashed** outline in muted grey, with a muted W.
- **On:** solid `acc` fill, with W in ink.
- Hit area is ≥ 44 dp (extend it with hitSlop).
- Role `checkbox`, label "Mark set N as warm-up".
- **Show it only while the row can still be a warm-up.** That means the row is un-logged AND no working (non-warm-up) set before it is logged.
- Otherwise render an **empty 30 dp spacer**, so the weight column never shifts.

**Lead column, part 2: the set well.**

- A 44 × 40 dp well (same style as the value wells) showing the **set number** (17 px, bold, tabular figures).
- If the set has a type, it shows the **type letter** (W / D / F / A) instead of the number.
- A small **▾ chevron** (10 dp, muted) sits inside, right of the number.
- Tap opens the **"Set type & Reps in reserve"** sheet. This replaces the old loose number plus tiny badge box.

**Weight and reps cells:**

- Each is a **well** (40 dp): value at 19 px bold, with a 12.5 px muted unit ("kg" / "reps").
- **Tapping either one ALWAYS opens the inline QuickAdjust editor, on every row, including the lit up-next row.**
  - **Remove** the behaviour where tapping the up-next row opened full-screen Focus.
- If an RIR value exists, show a 22 dp chip **"RIR 2"** inside the reps well, in place of the "reps" unit.

**Log cell:** a 44 dp circle with a tick.

**Row states:**

| State | Row | Wells | Log circle | W toggle |
|---|---|---|---|---|
| Un-logged | transparent | values in muted text, weight 600 | hairline outline, muted tick | shown (off) if it can still be a warm-up |
| Up-next (lit) | `acc` at about 7% fill + `acc`-outline border, radius 14 | slightly brighter well + border | **solid `acc`** with an ink tick (the only solid `acc` on the row) | shown (off) if eligible |
| Logged | transparent | full-weight values | `acc`-soft fill + `acc` tick | hidden (spacer) |
| Warm-up | as un-logged | values one step smaller (17 px) | as un-logged | **on**; set well shows "W" |

**Remove** the long-press-on-row → Focus gesture.

Focus keeps exactly two labelled entry points: the bottom **"Focus" pill** and the card header **"Focus" chip**.

**First-use badge tip:** a tip card above the first exercise's set rows. Show it once, persisted with the app's existing settings/storage.

- Text: `W warm-up · D drop set · F to failure · A as many as possible. Tap a set number to change it.`
- Button: `Got it`.

### #2 Inline editor (QuickAdjust)

- It opens **in place under the tapped row**, inside the card. The tapped well gets an `acc` outline.
- **Two steppers side by side:**
  - "Weight · kg": `−2.5` | value | `+2.5`
  - "Reps": `−1` | value | `+1`
  - Each is a 48 dp field with 46 dp step buttons. Use the existing increment setting for the step.
- **Show these BEFORE the set is logged**, not only after:
  - **"Set type"** chips: `Normal`, `W Warm-up`, `D Drop set`, `F To failure`, `A As many as possible`. They wrap. The selected chip uses the `acc`-soft style.
  - **"Reps left (RIR)"** chips: `0 1 2 3 4+`, equal width.
- **Buttons:** `Close` (ghost) and **`Log set`** (`acc` primary, with a tick icon).

### Set type & Reps in reserve sheet (opened from the set well)

- **Title:** `Set N · Set type & reps left`.
- **Help line:** `W warm-up · D drop set · F to failure · A as many as possible`.
- **Radio list (50 dp rows):** letter badge + name + one-line description:
  - Normal set: "Counts toward your volume"
  - Warm-up: "Light set, not counted"
  - Drop set: "Lower the weight, keep going"
  - To failure: "Until no clean rep is left"
  - As many as possible: "Max reps at this weight"
- The selected row gets an `acc`-soft background and an `acc` tick.
- **"Reps left (RIR)"** chips: `– 0 1 2 3 4+`.
- Primary button: `Done`.

### #3 Exercise card header and edit mode

- **Header:** the exercise name, then a sub-line `4 sets · target 80 kg × 8`, then a **"Focus" chip** (with the Focus icon), then an **"Edit" pill** (pencil + "Edit").
  - **Delete** the unlabelled trash and pencil circles.
- **Normal-mode footer:**
  - **`+ Warm-up`** chip, shown only while nothing in this exercise is logged.
  - **`Rest 1:30`** chip with a timer icon and a small trailing pencil, so it is visibly editable. Tap opens the rest editor.
- **Edit mode** (the "Edit" pill becomes an `acc`-soft **"Done"** pill). The sub-line reads "Editing · drag ⋮⋮ to reorder".
  - Each row: a **⋮⋮ grip** (30 dp) | set well | weight | reps | a **"−" remove** button (44 dp circle, danger-soft).
  - Full-width secondary buttons, in this order:
    - `+ Add set`
    - `+ Warm-up  40 · 60 · 80` (adds warm-ups at those % of the working weight; the percentages render muted)
    - `Rest, targets and cue ›`
  - A divider, then a full-width red **`Remove exercise`** (danger style) at the bottom of the card.

### #4 Add an exercise

- Replace the faint dashed text with a **full-width secondary button**: `+ Add an exercise`, below the exercise cards.
- The session header **⋮** (46 dp circle with the caption **"Options"**) opens the **Session options** sheet, which contains:
  - `+ Add an exercise`
  - **`Auto-start rest`** switch, with the sub-line "Rest timer starts when you log a set". Wire it to the same setting as in Workout settings.
  - The existing options, kept below.

### #5 Focus icon

- Use **one** Focus icon everywhere: a viewfinder (four corner brackets plus a small centre circle).
- Use it on the bottom dock "Focus" pill and on the card "Focus" chip.
- Reserve **▶ for start/play only** (open a routine, resume).

### Bottom dock in the session

A glass bar holding two equal buttons: **[Focus icon] Focus** and **Finish**.

### #6 Finish sheet

- Stats row: Time · Sets · Volume.
- A "Changed from the plan" card, e.g. `Bench press  3 sets → 4 sets`.
- **Primary button (`acc`, two lines):**
  - Line 1: `Save and make 4 sets the plan for Bench press`
  - Line 2 (12.5 px): `Next Push starts with 4 × 80 kg. Other exercises stay as planned.`
  - Template: `Save and make {n} sets the plan for {exercise}`. With 2 or more changed exercises use `Save and update {k} exercises in the plan`, and the caption lists them.
  - Show this button only when the session differs from the plan.
- **Secondary:** `Save workout` (unchanged). **Tertiary (ghost):** `Keep training`.

### #7 Leaving a running session

- The back `<` (label "Back, workout keeps running") navigates away **without ending** the workout.
- **First time only** (persisted), show a toast above the nav for about 6 s:
  - Text: `Workout still running — resume it from Home`
  - Action: `Resume`
- Home shows a running-workout card: `Push · running`, the elapsed time and current set, plus a primary `▶ Resume`.

---

## 3. Workout section and navigation

### #8 Hero card and FAB

- The **"Today · Push"** card is tappable as a whole and opens the session. It contains a labelled primary `▶ Open Push`.
- The **FAB** becomes an extended pill **`▶ Open Push`** when there is room, and collapses to the round ▶ on scroll.

### #9 Section top bars

The 46 dp icon circles get 12.5 px captions underneath, in all three sections:

- **Workout:** `AI coach` (sparkle) · `Routines` (book) · `History` (⟲)
- **Tasks:** `AI coach` · `History`
- **Finance:** `AI coach` · `Accounts` · `History`

### #10 Bottom nav and naming

- The glass nav gets labels under the icons: **Workout · Tasks · Home · Finance · Settings**.
- The active item uses `acc`.
- The money section is called **Finance** everywhere, including the AI chat kicker: **`AI coach · Finance`**.
- **"Expenses / Incomes"** is used only for the direction toggle (a segmented control).

### #11 Progress card, session cards and the weekly goal

- **Progress card on Workout:**
  - Its header row opens **Graphs directly** (header text "Progress" with a "Graphs ›" link) and shows a sparkline.
  - Two secondary chips sit below it: **`Muscle map`** and **`Body`**.
  - These were previously 3–4 levels deep behind ⟲.
- **Last-session card:** each exercise name is a link (underlined, with ›) that opens **that exercise's history**.
- **Weekly goal:** add a **"Weekly workout goal"** card on the Workout section (`2 of 4 this week` plus 4 progress pips). It is always shown (see #13).

### #12 Training history

- Rename the segments to **`Log | Graphs | Calendar`**. The Calendar segment may carry a calendar icon.
- Calendar days with a workout show an `acc` dot.
- **Tapping such a day opens that workout**, as the Tasks and Finance calendars already do. Show a preview row under the calendar with `Open ›`.
- Hint text: "A dot means you trained that day. Tap it to open the workout."

### #13 Weekly workout goal setting

- Workout settings gets its own row **"Weekly workout goal"** (value + ›), with the sub-line "Shown on the Workout section".
- It is **independent of the "Achievements and levels" switch.** The goal card renders whether that switch is on or off.

### #14 Bodyweight

- On Body measurements, tapping the value (a large well with a small pencil) opens **`NumberSheet`** (keypad). The ± buttons stay for nudges.
- Add a primary **`Log weight`** button.

### #15 Past workout editing

- The date is a full-width well button: calendar icon, `Mon 27 Oct 2026`, duration, ▾. It opens **`DayPicker`** in a sheet titled "Move to another day", with `Cancel` / `Move here`.
  - This replaces the ±1-day-per-tap behaviour.
- An expanded past workout shows the hint **`✎ Tap a set to correct it`** and a 44 dp pencil button on each exercise header.
- Set values render as wells.

### #16 Routines

- **Remove** the random-routine die from the header of an existing routine.
- **"Add routine"** opens a sheet with two choices:
  - **Empty**: "Start blank and add exercises yourself"
  - **Random…**: "Pick muscles and length, Momentum fills it in"

### #17 Exercise library and editor

- **Library header button:** **`Manage`** (it opens the existing delete mode).
- **Exercise history header button:** **`Edit exercise`** (labelled pill with a pencil).
- **Exercise editor:** plain words, each with a one-line example. Replace `Load mode: External / Added / Assisted` with a radio list titled **"Weight"**:
  - **Plates or machine**: "e.g. barbell squat, leg press, cable row"
  - **Bodyweight + extra**: "e.g. pull-up with a belt, weighted dip"
  - **Assisted**: "e.g. band or machine pull-up — less is harder"
- Keep visible: Name, Rest between sets, Cue ("Shown in Focus mode").
- Group **Rep ladder, Reps to MAX, Increment and all overload settings** under a collapsed **"Advanced"** row, with the summary sub-line listing them.
- A danger row sits at the bottom (§6).

### #18 Training order (sequence)

- Each step row is: grip, number circle, routine name and sub-line, then either a **`Next`** tag (`acc`-soft, on the current next step) or a labelled **`Make next`** button.
- **Tapping the row opens its routine.** Only the `Make next` button changes the next step. Previously, tapping the row silently made it next.
- Add a `+ Add a step` button.
- **Workout empty state:**
  - Primary: `Create a routine`
  - Secondary: **`Set up a training order`**
  - Ghost: `Start an empty workout`

---

## 4. Tasks

### #19 Task rows, menu and detail

- **Task rows:** each row is a 44 dp tick circle, then the name and sub-line (which opens task detail), then a visible **`⋯`** button (44 dp).
- **`⋯` and the long-press open the same sheet**, titled with the task name and the sub-line "Same menu as press-and-hold":
  - `Set a number…`
  - `Skip today, on purpose`, with the sub-line "An excused day — your streak stays"
  - `Pause for a while…`
  - `Move`
  - `Open history`
- **Task detail** shows the same five actions as labelled rows, then the danger row (§6).
- **Excused days:** keep the wording "on purpose". The row shows the tag `Skipped on purpose` and a dashed tick circle.
- **Explain it once in the hint line at the top of Tasks:** "Tap the circle to tick a task off. ⋯ or hold for more. "On purpose" means an excused day — it doesn't break your streak."

## 5. Finance

### #20 Category tiles

Each tile has two zones:

- **The body** (tap adds an amount). Show a small **"+" badge** (24 dp circle) in its top-right corner.
- **A "›" strip** on the right edge, at least **44 dp wide** and the full tile height, separated by a hairline. It opens the category.

Add the hint line "Tap a category to add an amount. › opens it."

## 6. Vocabulary (global rename and placement)

| Was | Now | Rule |
|---|---|---|
| Coach / AI assistant / Gemini | **AI coach** | every caption, title and kicker |
| Money / Expenses (as section name) | **Finance** | section, nav, kickers |
| Subsection | **Account** | everywhere; the Finance top-bar button is "Accounts" |
| mixed hide/remove | **Archive** = hide but keep history | |
| | **Delete** = gone, with history | red text |
| RIR (label) | **Reps left (RIR)** | the row chip stays "RIR 2" |
| Cal | **Calendar** | |
| Finish and update the plan | **Save and make {n} sets the plan for {exercise}** | |
| Load mode External/Added/Assisted | **Weight: Plates or machine / Bodyweight + extra / Assisted** | |

**Danger row placement is the same everywhere.** It is the last block on the item's *own* screen (exercise editor, task detail, account), under the label "Danger zone":

- **Archive**: "Hide it. History stays."
- **Delete** (red): "Gone, with all its history."

It is a bordered group with a danger-tinted hairline. Remove Archive and Delete from any other location.

Put all new and renamed strings in the app's existing i18n/strings mechanism if there is one.

---

## 7. Acceptance checklist (verify before finishing)

- [ ] Tapping weight or reps on **any** row, including up-next, opens QuickAdjust and never Focus. There is no long-press-to-Focus on rows.
- [ ] The W toggle shows only on eligible rows, and the weight column x-position is identical with or without it.
- [ ] The set well opens the Set type sheet. Type letters replace numbers. Nothing is cropped at 360 dp with "102.5 kg" and "12 + RIR 2".
- [ ] QuickAdjust shows Set type and Reps left (RIR) before logging.
- [ ] The header has a single "Edit" pill, and edit mode matches #3 exactly.
- [ ] One Focus icon is used in both places. ▶ appears only for start/play.
- [ ] The Finish primary button text is generated from the plan diff.
- [ ] Back keeps the workout running, the toast shows once, and the Home Resume card works.
- [ ] Every top-bar icon and nav item has a caption. "Finance" and "AI coach" are used everywhere. A grep for "Subsection", "Gemini", "AI assistant" and "Cal" (in UI strings) returns nothing user-facing.
- [ ] Every long-press has a visible twin (⋯, labelled button or grip).
- [ ] The danger row is consistent on exercise, task and account screens.
- [ ] No new colours or fonts. No text below 12.5 px. All targets ≥ 44 dp. Verified at 360 and 412 dp.
- [ ] Typecheck, lint and tests pass. `REDESIGN_CHANGELOG.md` is written.
