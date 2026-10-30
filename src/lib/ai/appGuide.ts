/**
 * The app, described for the assistant — so "where do I mark a warm-up?" gets a
 * path of taps rather than "I can only see your data".
 *
 * ── WHY A HAND-CHECKED MAP AND NOT THE SCREENS THEMSELVES ──────────────────
 *
 * The model never sees the UI; everything it knows about the app is what this
 * file says. So it is written the way the user would describe it — the on-screen
 * English labels in quotes, icons named by what they look like, every hold and
 * hidden tap spelled out — and built from the JSX, not from the header comments,
 * because a header says what a screen was meant to do and the JSX what it does.
 *
 * ── AND WHY IT CANNOT QUIETLY GO STALE ─────────────────────────────────────
 *
 * A guide that names a button the app no longer has is worse than no guide.
 * `appGuide.test.ts` checks that every quoted label below still exists in the
 * source; rename a button and that test names the line to fix here.
 *
 * REJECTED: generating it from the i18n catalogue. The catalogue has the words
 * but not where they are, and "where" is the whole question.
 *
 * Sent with every section's chat (`aiPrompts.ts`): "where is X" is asked from
 * whichever chat happens to be open. About 22 KB — the price of the answer being
 * right, and paid once per request against a context that is often larger.
 */

/** How to use the guide — the rules, kept apart from the map they apply to. */
export const APP_GUIDE_RULES = `APP GUIDE. Below is a map of this app's screens and controls. Use it whenever the user asks where something is, how to do something in the app, what a button does, what the app can do, or asks for a guide or documentation.
- Answer "where/how" with the exact path of taps as a short numbered list in one "text" block (e.g. "1. Workout tab (dumbbell). 2. Book icon top-right. 3. ..."), naming icons by how they look. Mention a hold or hidden tap explicitly — those are what users miss.
- If the user writes in Russian, describe the controls in Russian; the quoted labels in the map are the English UI text, so translate them naturally rather than quoting English.
- For "what can this app do" or a full guide: one "summary" block per section with notes (at most 4 notes each, short), then offer to explain any part.
- If the user could do it through you (log an amount, tick a task, change a setting, fix a set), say so and offer it — but still say where it is in the app.
- Never describe a screen, button or feature the map does not contain. If it is not there, say the app does not have it.`;

export const APP_GUIDE = `APP MAP
Conventions: "tap" = short press, "hold" = long-press. Labels in quotes are the exact on-screen English text. Icon-only buttons are described by icon. Every hold has a visible twin (a ⋯ button, a labelled button or a ⋮⋮ grip). Most destructive actions show an "Undo" toast for a few seconds; the rest ask first.

## 1. Navigation & Home

### Bottom nav bar (glass pill, icon + label)
- Labels under the icons, left to right: "Workout" · "Tasks" · "Home" (raised round button in the middle) · "Finance" · "Settings". The active one is in the accent colour.
- Hidden on Home, on pushed screens, during a workout and while a sheet is open. Android Back on a pushed screen goes back one screen.

### Home — the first screen
- Running-workout card (only while a workout is running): routine name with "· running", elapsed time and the current set, a "Resume" button; tapping the card resumes too.
- Quick chips: "+ Expense" (amount keypad for a new expense) and the next task (tap = mark it done today; "Undo" toast).
- Tiles: "Workout" → Workout section, "Tasks" → Tasks section, the "Finance" row → Finance section, the "Settings" row → Settings.
- Weekly review card (appears on its own): "Ask the AI coach for a summary" (needs an AI key).
- Month/year wrapped card at the start of a month → Wrapped story (tap right = next card, left = previous, "x" closes).

### Section top bar (Workout / Tasks / Finance)
- Round icons with captions underneath:
  - Workout: "AI coach" (sparkle) · "Routines" (book) · "History" (clock-arrow).
  - Tasks: "AI coach" · "History".
  - Finance: "AI coach" · "Accounts" (wallet) · "History".
- Settings has "РУ" / "EN" language letters here instead.

### First launch
- Language choice: tap Русский or English.

## 2. Workout

### Workout section (nav: "Workout")
- Hero card "Today · <routine>": the whole card is tappable and holds a labelled "▶ Open <routine>" button. While a workout runs, the floating button reads "Resume <routine>".
- Floating button bottom-right: an extended "▶ Open <routine>" pill at the top of the page; it folds to a round ▶ when you scroll.
- "Progress" card: its header ("Graphs ›") opens Training history on Graphs; chips "Muscle map" and "Body" open those screens.
- "Last session" card: the latest workout; tap an exercise name (underlined, ›) to open that exercise's history.
- "Weekly workout goal" card: "N of M this week" with one pip per workout; tap it to change the goal. Always shown.
- "Sequence" strip (only with a training order on): tap a step → Training sequence.
- Debrief card "How did <routine> go?" after a finish (if enabled).
- Routine list: tap a routine row → opens it as a workout (not started yet).
- "Recent": tap a past workout → Training history with it expanded.
- Empty state (no routines): "Create a routine", "Set up a training order", "Start an empty workout".

### Starting a workout
- Open a routine (hero card, floating button, a routine row, or ▶ in Routines). The session opens NOT started.
- Bottom dock before start: "Stop and exit" and ▶ Start workout. Logging the first set also starts the clock.

### Live session screen
Header:
- "<" Back: leaves the screen, the workout KEEPS RUNNING (resume from the Home card or the Workout section). The first time, a toast says "Workout still running — resume it from Home" with "Resume".
- Title, sets progress, elapsed clock, workout number.
- ⋮ captioned "Options" → Session options sheet: "+ Add an exercise", "Auto-start rest" switch ("Rest timer starts when you log a set"), "Restart clock", "Stop and exit…".
Timer pill under the header (only while running): rest "−15 s" / "+15 s" / pause / "Skip"; timed sets: "Start now", "+15 s", "Stop" (logs), "x" (cancel).
Exercise cards (one open at a time):
- Tap a collapsed card to open it; tap the open card's name to close it.
- Hold a card header (it has a grip mark) to lift it, slide, then "Drop" to reorder exercises.
- Open card header: name; sub-line like "4 sets · target 80 kg × 8"; a "Focus" chip (viewfinder icon, on the card holding the next set); an "Edit" pill.
- Overload suggestion line: "Use" applies it to every remaining set; "x" dismisses.
Set row (one per set), left to right:
- W warm-up toggle: a dashed square with "W" (solid green when on). Shown only on sets that can still be a warm-up (not logged, no working set logged above). Tap = mark/unmark warm-up BEFORE logging, so its lighter weight is not copied to the working sets.
- Set well: the set number, or W / D / F / A for warm-up / drop set / to failure / as many as possible, with a small ▾. Tap → the "Set N · Set type & reps left" sheet: radio list (Normal set, Warm-up, Drop set, To failure, As many as possible, each with a one-line description), "Reps left (RIR)" chips, "Done".
- Weight well and reps well: tap either → the inline editor under the row (on every row, including the highlighted next one). A graded set shows an "RIR 2"-style chip in the reps well.
- Round log button on the right: tick = log the set; tap again = undo. Pre-filled numbers come from last session, so an unchanged set is one tap.
- A first-time tip above the rows explains the letters; "Got it" hides it for good.
- If you log a light first set without marking it, a toast asks e.g. Was 60 kg a warm-up? with a Yes, keep 80 kg button: one tap marks it a warm-up and puts the heavier weights back.
Inline editor (after tapping a weight or reps well):
- Two steppers: weight (− / value / +, step = the exercise's increment) and reps (−1 / value / +1). Tap the value to type an exact number.
- "Set type" chips: Normal, W Warm-up, D Drop set, F To failure, A As many as possible.
- "Reps left (RIR)" chips: 0 1 2 3 4+ (tap the lit one again to clear).
- "Close" and "Log set".
Card footer (normal mode): "+ Warm-up" (adds warm-up sets; only before anything is logged) and a rest chip like Rest 1:30 (tap = start a rest now; its pencil = edit the rest).
Edit mode (tap "Edit"; the pill becomes "Done"):
- Each row: ⋮⋮ grip, set well, weight, reps, and a red − that removes THAT set.
- Moving a set: tap ⋮⋮ on a set to lift it, then tap ⋮⋮ on the row where it should go (only sets not yet logged can move).
- Buttons: "+ Add set", + Warm-up 40 · 60 · 80 (warm-ups at those % of the working weight), "Rest, targets and cue" › (exercise editor), then the red "Remove exercise".
Below the cards: "+ Add an exercise" (adds to this workout only).
Bottom dock (after start): "Focus" (viewfinder icon) and "Finish"; when every set is logged it becomes "Finish workout".

### Focus mode (full-screen, one set at a time)
- Open: the dock's "Focus" or the card's "Focus" chip.
- Close: "⌄" top-left, swipe the top band down, or Back.
- Big weight and reps with "−"/"+"; "done" logs the set and starts rest; rest view with ring countdown, "−15", "+15", pause, "Skip".

### Finish sheet ("Finish" / "Finish workout")
- Stats: "Time", "Sets", "Volume"; records this session; milestone card.
- "How did that go": Easy / Right / Brutal.
- If the session changed the plan: a "Changed from the plan" card (e.g. Bench press 3 sets → 4 sets) and a two-line button such as Save and make 4 sets the plan for Bench press (or Save and update 2 exercises in the plan) that also updates the routine.
- "Save workout" saves without touching the routine. "Keep training" goes back to logging.

### Routines & exercises (Workout top bar → "Routines")
- Header switch "Routines | Exercises".
- Routines: "Training sequence" row → Sequence screen; tap a routine → routine editor; ▶ on a row opens it as a workout.
- "Add routine" → a sheet: "Empty" (start blank and add exercises yourself) or "Random…" (pick muscles and length, the app fills it in).

### Routine editor
- "Routine name"; exercise rows: tap to expand (Sets, Reps, Rest, "Superset with the one above", "Open its history"); hold the grip to reorder, "Drop" to place; "x" removes.
- "Add exercise"; "Duplicate this routine"; "Delete routine" (asks); floating "Save".
- A brand-new random routine has a die in the header to roll again; existing routines have no die.

### Training sequence ("Training sequence" row, or a step on the Workout section strip)
- "Use this sequence" switch.
- Each step: grip, number, routine name, and either a "Next" tag (the routine trained next) or a "Make next" button. Tap a step row to open its routine. Hold the grip to reorder.
- "+ Add a step" → pick a routine. "Start the sequence over".

### Exercise library ("Routines & exercises" → "Exercises")
- Search "Search exercises, muscles, days"; muscle tree; "New exercise"; "Recently used".
- Tap an exercise → its history. Header "Manage" → delete mode (trash on each row, asks first).

### Exercise history (tap an exercise in the library, or "Open its history")
- "Best", "Estimated 1-rep max" chart, "Records", "Top working weight", "Sessions"; tap a row → that workout.
- Header "Edit exercise" → the exercise editor.

### New / Edit exercise
- "Name", the form cue (shown on the exercise card while you do it), "Muscles".
- "Weight": "Plates or machine" / "Bodyweight + extra" / "Assisted" (each with an example line).
- Counted in reps / time / metres / rounds; sets; rest between sets.
- "Advanced" (collapsed): rep ladder, reps to MAX, increment and overload settings.
- "Danger zone" at the bottom: "Delete" (asks; sets already logged stay in history).
- Floating "Create" / "Save".

### Training history (Workout top bar → "History")
- Switch "Log | Graphs | Calendar".
- Log: "Sets per cluster" ("4w", "12w", "All"); "Muscle map · this week"; workouts by month — tap one to expand.
  - Expanded workout: a date button (calendar icon, day, length, ▾) → "Move to another day" sheet with a calendar, "Cancel", "Move here".
  - Hint "Tap a set to correct it"; each exercise header has a pencil; tap a weight or reps well to correct it; tap the set number → the set-type sheet.
  - "+ Add a set", "Remove exercise", "+ Add an exercise", "Edit name, start and length", workout number, "Delete this workout" (asks).
- Graphs: "All workouts" chip or one chip per exercise; charts; "Body measurements" row.
- Calendar: trained days have a dot; tap one → a preview row with "Open ›" opens that workout.
- Foot: wrapped, "Insights", "Settings" (→ Workout settings).

### Body measurements (Progress card → "Body", or Graphs → "Body measurements")
- Weight card: tap the big value (pencil) → keypad, logs the weight; "−"/"+" nudge it; "Log weight" records it.
- Tap a measurement → its readings; "Add a reading" → site, value, date, save.

### Muscle map ("Muscle map" chip or Log → "Muscle map · this week")
- Previous/next week, front/back; tap a muscle for its weekly sets.

### Workout settings (Settings → "Workout settings")
- Rest between sets / exercises, "Start rest automatically", timer step; get-ready; countdown sounds, vibration, keep screen on, notifications.
- "Weekly workout goal" row (shown on the Workout section) → workouts a week.
- "Questions after a workout"; workout reminder; bodyweight; gyms and plates; weekly sets per cluster; units Kilograms | Pounds; Health Connect; "Delete all workout history" (asks).

## 3. Tasks (nav: "Tasks")

### Tasks screen
- Hint at the top: tap the circle to tick a task off; ⋯ or hold for more; "on purpose" means an excused day that doesn't break the streak.
- Day dial: "‹" / "›" = previous / next day.
- Task row: round tick on the left (counted tasks: +1 per tap); tap the name to open task detail; ⋯ on the right.
- ⋯ (or hold the row) → a sheet titled with the task name ("Same menu as press-and-hold"): "Set a number…" (counted tasks), "Skip today, on purpose" (an excused day — your streak stays), "Pause for a while…", "Move", "Open history".
- An excused day shows a dashed circle and the tag "Skipped on purpose".
- Floating "+" = "Add task" → "New task" sheet.

### New task / Edit task sheet
- Name; target counted in parts; times per week; "Avoid this"; repeats (every day / weekdays / pick days / once); start day; reminder; "Save task".

### Task detail (tap a task's name)
- Streak, this month, habit strength, last 90 days, month grid (tap a day → its note).
- The same five actions as rows: Set a number…, Skip today, on purpose, Pause for a while…, Move, Open history.
- "Danger zone": "Archive" (asks). Floating "Edit task".

### Task history (Tasks top bar → "History")
- "Month | Year | Trend"; tap a day to open it.

### Daily tasks settings (Settings → "Daily tasks settings")
- "Let the app tick what it knows"; vacation pause; history range.

## 4. Finance (nav: "Finance")

### Finance screen
- Account chips (e.g. Cash, Card): tap = switch account; hold a chip, or ⋯ on the selected chip → "Edit account". Round "+" = "Add account". "Transfer" (2+ accounts) moves money between accounts.
- Top bar "Accounts" → a list of accounts with balances; tap one → its edit sheet; "Add account".
- Edit account sheet: name and glyph, "Save"; "Danger zone" → "Archive" (only when another account exists).
- Balance hero: tap to set what you actually have.
- "Due today" recurring payments: "Confirm" / skip.
- Period row "‹" / "›", tap the period name to change the interval. "Expenses" / "Incomes" tiles switch the side shown.
- Category tiles: tap the tile body ("+" badge) = record a new amount in that category; tap the "›" strip on its right edge (or hold the tile) = open the category.
- "Add category"; rows "Budgets", "Recurring payments", "Savings goals". Floating "+" = add an expense / income.

### Amount editor (keypad)
- Big amount, keypad, "Note", category, account chip, "Expense | Income", date "‹"/"›", "A day" / "Whole month"; "Save"; when editing, "Delete this amount" (asks).

### Category screen (tile "›" or hold)
- Glyph and name, the amounts in the window (tap to edit), "Add to this category", "Danger zone" → "Archive".

### Finance history (Finance top bar → "History")
- "Expenses" / "Incomes" and "Day | Calendar | Categories"; charts; calendar ("Open this day"); categories with period chips incl. "Custom".

### Budgets, Recurring payments, Savings goals (rows on Finance)
- Budgets: tap a category → monthly budget, alerts at 80% and 100%.
- Recurring: add / edit payments (repeat weekly / monthly / yearly).
- Savings goals: a goal reads one account's balance; fill it with a transfer.

### Finance settings (Settings → "Finance settings")
- Currency, opening interval, history range.

## 5. Settings (nav: "Settings")
- "РУ" / "EN" language; appearance presets and custom colours; "Workout settings", "Daily tasks settings", "Finance settings"; "AI coach" row → AI settings.
- "Achievements and levels" switch (levels, badges, streak freezes, milestones) and "Badges".
- Backups: "Back up automatically", "Export everything", "Replace everything from a file" (asks), CSV export; "Reset every setting" (asks).

## 6. AI coach
### Opening
- "AI coach" (sparkle) in any section's top bar, an AI card's prompt chip, or "Ask the AI coach about it" after a debrief. Without a working key it opens AI settings first.
### AI settings (Settings → "AI coach")
- Provider (Google Gemini), API key with paste/clear, model, what it reads; "Test & connect"; disconnect (asks).
### AI chat
- Header: "<" Back, clock icon = past chats, "+" = new chat.
- Starter chips, including "App guide". Type a question or tell it what to do; to talk instead of type, tap the mic on your phone's keyboard.
- It can, through a card you must Apply: suggest or edit routines and the training loop, change exercise and workout settings, log an amount, tick or excuse a task day, log today's body weight, and mark a set in a past workout as a warm-up (or another set type) so it stops counting.
- Answer cards: "Suggested routine" or "Suggested edit" → "Review & edit" or "Add to routines"/"Apply changes"; "Suggested changes" → "Apply changes"/"Discard"; "Suggested training loop" → "Apply loop"/"Discard". Nothing changes until Apply; applying shows an Undo toast.
### AI review (from "Review & edit")
- Routine name, "Why", exercise rows with steppers, "Add an exercise"; "Discard" and "Add to routines"/"Apply changes".`;
