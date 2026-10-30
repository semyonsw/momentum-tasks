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
Conventions: "tap" = short press, "hold" = long-press, "FAB" = the round floating button bottom-right. Labels in quotes are the exact on-screen English text. Icon-only buttons are described by icon. Most destructive actions show an "Undo" toast for a few seconds.

## 1. Navigation & Home

### Bottom nav bar (glass pill, icons only)
- Visible on the four section screens; hidden on Home, on every pushed screen, during a workout session, and while a sheet is open.
- Left to right: dumbbell = Workout · check-circle = Tasks · raised round house button in the middle = "Home" · wallet = Finance · gear = Settings.
- Android Back on a pushed screen goes back one screen.

### Home (landing) — the first screen
- Greeting + subline. App mark top-right (decorative).
- Level chip "Lv N" (only if Settings → "Achievements and levels" is on): tap → Level sheet ("How XP is earned", "Badges" button → Badges screen, "Close").
- Quick chips row (each shown only when relevant):
  - "+ Expense" → amount keypad (new expense) on the current subsection; saves into Finance.
  - Next task chip (task name with a ✓ or ⊘ circle): tap = mark that task done/avoided today; toast with "Undo".
  - "Resume workout · mm:ss" (only while a session runs) → back into the session.
- Tiles: "Workout" tile (next routine name, "#N" badge, "Today"/"In progress") → Workout section. "Tasks" tile (ring %, "N of M done") → Tasks section.
- "Finance" wide row (balance + "spent in <month>") → Finance section.
- Weekly review card (appears on its own): "x" dismisses; "Ask the coach for a summary" (needs AI key) writes a summary; "Try again" on error.
- "<Month>, wrapped" / year wrapped card (first week of a month; Dec/Jan for the year) → Wrapped story.
- "Settings" slim row at the bottom → Settings section.

### Section top bar (top of Workout / Tasks / Finance; icons only)
- Sparkle orb = "Open the AI assistant" (opens that section's AI chat, or AI setup if no key yet).
- Workout only: book icon = "Routines & exercises".
- Clock-arrow (⟲) rightmost = that section's history ("Training history", "Task history", "Finance history").
- Settings tab has "РУ" / "EN" language letters here instead.

### Wrapped (story cards)
- Tap right two-thirds = next card; tap left third = previous; horizontal swipe also steps. "x" (Close) top-right or Back to leave.

### First launch
- Language choice screen: tap Русский or English.

## 2. Workout

### Workout section (nav: dumbbell)
- Top bar: sparkle (AI), book ("Routines & exercises"), ⟲ ("Training history").
- "In progress" card (when a session exists) → back into the session.
- "Sequence" strip (only if a training sequence is on): tap the strip = show/hide the steps; tap any step chip → Training sequence screen.
- Hero card "Today · <focus>" with Exercises / Sets / Workout #N / Last — information only, not a button.
- "This week" weekly-goal card (only with Achievements and levels on) → "Weekly goal" sheet: "Workouts a week" stepper, "Excuse this week", "Excuse last week".
- Debrief card "How did <routine> go?" (after a finish, if enabled) → question sheet; "x" = "Not this time".
- AI card "Gemini · summaries, trends, suggestions" with prompt chips; "x" hides it (sparkle stays).
- "Other routines" / "Start a workout" list: tap a routine row (green ▶) → opens it as a workout (not started yet).
- "Recent": tap a past workout → Training history with that workout expanded.
- FAB (round, icon only): ▶ "Open <next routine>" or ▶ "Back to <routine>" when one is in progress; "+" "New routine" when there is nothing to open.
- Scrolling down shows a floating bubble of the hero: tap = back to top; its ▶ opens/resumes.
- Empty state: "New routine", "Open routines".

### Starting a workout
- Open a routine (Workout section row, FAB ▶, Home's Workout tile → FAB, or ▶ next to a routine in Routines & exercises). The session screen opens NOT started.
- Bottom pair before start: "Stop and exit" (leave, discard) and "Start workout" (starts clock). Logging the first set also starts it.
- A routine with no exercises opens the routine editor instead.

### Live session screen
Header:
- "<" (Back) = leave the session running (it keeps; resume from Home/Workout).
- Title, "N of M sets" progress, elapsed clock, "#N" workout number.
- "⋮" (Session options) → sheet: "Restart clock" (only after start; asks "Restart the clock?") and "Stop and exit…" ("Leaves without saving"; asks "Stop and exit without saving?" → "Throw it away" / "Keep logging").
Timer pill under header (only while running):
- Rest pill: "−15 s", "+15 s" (step set in settings), pause/play icon, "Skip"; shows "Next: set N / next exercise".
- Set-timer pill (timed sets): "Start now" (skip get-ready), "+15 s", "Stop" (logs what it read), "x" (cancel, no log).
Exercise cards (one open at a time):
- Tap a collapsed card = open it; tap the open card's header or the "⌄" = close it.
- Hold a card header (has a grip mark) ~0.3 s = lift it; slide up/down; tap "Drop" in the header to place. Only with 2+ exercises.
- Collapsed card shows a small dot when a suggestion is waiting; a green bracket on the left = superset.
- Open card header: name, target, "last: …", "New best · …", form cue; trash-can circle = remove exercise immediately (toast "Removed <name>" with "Undo"); pencil circle = plan edit mode ("Editing plan").
- Overload suggestion line ("Try …" / "Same … for N days"): "Use" = apply to every remaining set; "x" = dismiss.
- Stall note (trending-down icon) = information only.
Set row (one per set):
- Left: set number, or badge W (warm-up), D (drop), F (failure), A (AMRAP). TAP the number/badge → set sheet: "Set type" (Working set, Warm-up, Drop set, To failure, AMRAP) and "Reps in reserve" scale; "Clear", "Done".
- Small "W" checkbox (weighted exercises, before the ✓): tap = mark/unmark as warm-up.
- Weight cell and reps/time cell: tap → inline editor under the row (see below). On the glowing "up next" row, tapping a number opens Focus mode instead.
- Plate breakdown under weight (barbell exercises) = info only.
- "RIR n" chip after the reps (once graded): tap → set sheet.
- ▶ (timed sets only): start the clock; while running it is green = stop and log.
- Big circle on the right = "Complete set" (✓); tap again = "Undo set". Previous-session numbers are pre-filled (faint), so an unchanged set is one tap.
- Hold the glowing "up next" row = open Focus mode.
Inline editor (after tapping a number):
- ± step chips around the value; "Type" = type an exact value; "Set type" chip; "Warm-up"/"Working set" toggle; "Remove set"; "Done".
- After the set is logged: "Reps in reserve" "+ RIR" → set sheet.
Card footer (normal mode):
- "+ Add set" (+ Add round on a rounds exercise), "− Remove set" (removes the last row).
- "Rest m:ss" chip = start a rest now; "Focus" chip (card holding the next set) = Focus mode.
Card footer in plan edit mode (after pencil):
- Each row gets a "−" to remove THAT set.
- "+ Add set"; "+ Warm-up <weights>" (auto warm-up sets; only before anything is logged); "Rest, targets and cue" (opens the exercise editor); "Remove exercise".
- Green "Done" pill (top right of card) ends edit mode.
Below the cards:
- Dashed "+ Add an exercise" → exercise picker; picked exercise is added to this workout only.
Bottom floating pair (after start):
- "Finish" (ghost) and "Focus" (filled). When every set is logged it becomes one "Finish workout".
Toasts: "Removed a logged set…" / "Removed <name>" with "Undo"; "Was <weight> a warm-up?" with "Yes, keep <weight>".

### Focus mode (full-screen, one set at a time)
- Open: "Focus" button, "Focus" chip on a card, tapping/holding the up-next row.
- Close: "⌄" top-left ("Leave focus mode"), swipe the top band down, or Back.
- Lift view: big weight and reps with round "−"/"+" steps either side; tap the big number = full ± panel (coarse and fine steps).
- "undo last set" link; big "done" button logs the set and starts rest.
- Rest view: ring countdown, "−15", "+15", pause/play, "Skip"; "Up next" card.
- Timed hold: "Start", "Start now", "+15", "Stop", "x" cancel.
- After the last set: "Session complete" with "Finish workout".

### Finish sheet ("Finish" / "Finish workout")
- Stats: Minutes, Sets, Kg moved; "Records this session"; milestone card.
- Warning if sets are unlogged ("… won't be saved").
- "How did that go": Easy / Right / Brutal.
- "Save workout"; if the session changed the planned sets: "Finish and update the plan" (also changes the routine) plus "Save workout" (keeps routine).
- "Keep going" / "x" = back to logging.

### Routines & exercises (Workout top bar → book icon)
- Header switch "Routines | Exercises".
- Routines tab:
  - "Training sequence" row (On/Off · N steps) → Sequence screen.
  - Routine rows: tap → routine editor; green ▶ on the row = open it as a workout.
  - "Add routine" → new routine in the editor.
- Exercises tab = Exercise library (below).

### Routine editor
- Header: "<" back (asks "Discard your changes?" if edited); die icon = roll a random routine; hold the die or tap "⋮" next to it → "Build a random routine" sheet (Muscle groups, How many exercises, Sets each, "Roll").
- "Routine name" field.
- Exercise rows: tap = expand its editor; hold (grip) = lift to reorder, "Drop" to place; "x" = remove (asks "Remove …?").
- Expanded item: Sets stepper, Reps stepper ("Down to" for a range), "Ladder" info, Rest stepper ("Follow the setting instead"), "Superset with the one above" switch, "Open its history".
- "Add exercise" → exercise picker (adds to routine).
- "Duplicate this routine"; "Delete routine" (asks).
- FAB "Save" (✓).

### Training sequence (Routines & exercises → "Training sequence", or tap a step on the Workout section strip)
- "Use this sequence" switch (needs ≥1 step).
- "The order": tap a step = make it "next"; ⌃/⌄ arrows move; "x" removes; "edit exercises", "make it different" (separate copy for a repeated step).
- "Add a step": tap "+ <routine>".
- "Start the sequence over".

### Exercise library (Routines & exercises → "Exercises"), also the "Add exercise" picker
- Search box "Search exercises, muscles, days"; "Create “<text>”" appears when typing.
- Tree: muscle cluster rows → muscle rows → exercises; "Add exercise to <muscle>"; "Unfiled".
- "New exercise"; "Recently used" list.
- Tap an exercise: in library → its History; in a picker → adds it.
- Header "Edit" → delete mode: trash icon on each row (asks "Delete …?"); "Done editing".

### Exercise history (library → tap exercise; routine editor → "Open its history")
- "Best", ladder line, "Estimated 1-rep max" chart, "Records", "Top working weight", "Sessions".
- Tap a record or session row → that workout in Training history.
- Header "Edit" → exercise editor.

### New / Edit exercise
- "Name", "Cue" (form cue), "Muscles" (cluster chips then muscle chips; first pick = primary).
- "Requires weight" switch; "Counted in": Reps / Time / Metres / Rounds; "Set inputs".
- "Timer": Manual / Countdown / Count up; "Get ready".
- "Load mode": External / Added / Assisted (bodyweight).
- "Sets" stepper, "Increment", "Rest between sets" ("Follow the setting instead").
- "Reps to MAX" switch; "Rep ladder" switch with max ± and "Current maximum".
- FAB "Create" / "Save".

### Training history (Workout top bar → ⟲)
- Switch "Log | Graphs | Cal".
- Log view:
  - "Sets per cluster" card with range switch "4w", "12w", "All"; "Muscle map · this week" → Muscle map.
  - Workouts grouped by month; tap a workout = expand: "Started", "Ended", exercises.
  - Tap an exercise in an expanded workout = list all its sets; tap a set's weight or count to correct it (± steps, "Set type", "Reps in reserve", "Remove set", "Done"); tap the set number → set sheet.
  - "+ Add a set", "Remove exercise", "+ Add an exercise" (picker into that past workout).
  - "Edit name, date and length" → Name field, "Date" ± (one day per tap), "Started" ±, "Took" ±; "Done editing".
  - "Workout number: N" / "Set the workout number" → number sheet.
  - "Delete this workout" (asks).
- Graphs view: "All workouts" chip or one chip per exercise; charts (top weight, reps, bodyweight); "Body measurements" row.
- Cal view: month grids of trained days (read only).
- Foot of history: "<Month>, wrapped", "Insights", "Settings" (→ Workout settings).

### Body measurements (Graphs view → "Body measurements", or Workout settings → Body)
- Weight row (read only, "Set in Workout settings").
- Tap a measurement → its readings; tap a reading → edit sheet ("Delete this reading").
- "Add a reading" → sheet: site chips, ±, keypad, "Date", "Save <name>".

### Muscle map (Training history Log → "Muscle map · this week")
- "<" / ">" previous/next week; Front / Back view; tap a muscle (on the body or in the list) for its weekly sets vs target; "x" clears.

### Insights (foot of any history → "Insights")
- Read-only pattern cards across the three logs.

### Badges (Settings → Badges, or Level sheet → "Badges"; needs Achievements and levels on)
- Tap a badge → badge sheet; "Close".

### Workout settings (Settings → "Workout settings", or foot of Training history → "Settings")
- Rest: "Between sets", "Between exercises" (steppers; a "You rest m:ss … Use it" suggestion may appear), "Start rest automatically", "Timer ± step".
- Timed sets: "Get ready". Rep ladder: "Make every exercise a rep ladder".
- Countdown: "Beep the last", "Sound", "Vibration", "Test the beep", "Keep the screen on", "Notify when a timer ends".
- "Questions after a workout" switch (debrief).
- Workout reminder: "Remind me to train", day chips, time.
- Body: "Bodyweight" − / + stepper, "Clear my bodyweight", "Body measurements".
- Gym / Plates: gym chips, tap plate sizes to toggle, "Add another gym", "Remove <gym>…".
- "Weekly sets": per-cluster target steppers.
- Units: Kilograms | Pounds.
- "Workouts on disk"; "Share workouts with Health Connect"; "Delete all workout history" (asks).

## 3. Tasks (nav: check-circle)

### Tasks screen
- Top bar: sparkle (AI), ⟲ "Task history".
- Day dial: "‹" / "›" = day before / after (dial itself is display only). Pills: "N done", "N left", "N on purpose".
- Task row:
  - Tap the circle on the left = done ↔ not answered (avoid-tasks: "held off"). Counted tasks: +1 per tap.
  - Tap the rest of the row → task detail.
  - Streak flame shows the run; snowflake on it (if freezes held) → "streak freeze" sheet.
  - HOLD a row → menu: "Set a number…" (counted tasks), "Skip today, on purpose" / "Take the skip back", "Pause for a while…", "Move" (then slide, "Drop"), "Open history". Skip shows "Undo" toast.
- "Coming up" list of upcoming one-off tasks.
- Hint line (2+ rows): "Tap a circle to mark it done. Hold a row to skip today on purpose or pause the task."
- AI card under the list.
- FAB "+" = "Add task" → "New task" sheet. Empty: "Add your first task".
- Scrolled: day bubble; tap = back to the dial.

### New task / Edit task sheet
- "Name"; "A target, counted in parts" (Target, unit chips, "+ unit"); "A number of times per week" ("Times a week"); "Avoid this".
- "Repeats": Every day / Weekdays / Pick days / Once (Today, Tomorrow, "Which day"); "Starts on".
- "Remind me" switch, time, "Remind again" interval.
- "Save task", "Cancel".

### Task detail (tap a task row)
- Streak (snowflake → freeze sheet), "This month" counts, "Habit strength", "Last 90 days".
- "Pause for a vacation…" → Pause sheet; if paused: "Resume now".
- Month grid with "‹"/"›"; tap a day → "Note" field for that day.
- "Archive this task" (asks). FAB "Edit task" → edit sheet.

### Pause sheet ("Pause for a while…")
- Tap first and last day on the calendar ("‹"/"›" months); "All tasks" or tick tasks; "Pause N days". Toast with "Undo".

### Task history (Tasks top bar → ⟲)
- Switch "Month | Year | Trend".
- Month: "‹"/"›"; tap a day → goes back to Tasks on that day.
- Year: "All tasks" or a task chip; year "‹"/"›"; tap a square, then "Open this day".
- Trend: range chips; "Done", "Full days", chart.
- Foot: wrapped, "Insights", "Settings" (→ Daily tasks settings).

### Daily tasks settings (Settings → "Daily tasks settings")
- "Let the app tick what it knows" (workout finish / amount auto-ticks).
- "Pause for a vacation…". "History opens on": range chips.

## 4. Finance / Expenses (nav: wallet)

### Finance screen
- Top bar: sparkle (AI), ⟲ "Finance history".
- Subsection chips (e.g. Cash, Online): tap = switch; HOLD a chip, or tap "⋯" on the selected chip → menu "Edit subsection" / "Archive this subsection…".
- "+" round button next to chips = "Add subsection". ⇄ "Transfer" (2+ subsections) = move money between subsections.
- Balance hero ("<subsection> · All time"): tap = "Tap to set what you actually have here" → balance sheet ("What you have", "Save").
- "Due today" card for recurring payments: "Confirm" (records), "Skip this month" (or week / year), "+N more due" → Recurring payments.
- Period row: "‹" / "›" = window before/after; tap the period name "▾" → "Time interval" sheet.
- "Expenses" / "Incomes" tiles = choose which side the grid shows.
- Category tiles: TAP = record a new amount in that category (on the day being viewed); "›" on the tile or HOLD the tile → category screen.
- Dashed "Add category" (adds to the side shown).
- Rows: "Budgets", "Recurring payments", "Savings goals".
- FAB "+" = "Add expense" / "Add income" (opens keypad on a default category).
- Scrolled: balance bubble; tap selected = top, tap another = switch subsection.

### Amount editor (keypad screen)
- Header New expense / Edit income etc. with "<" back.
- Big amount; keypad 0–9, "000", "." (cents), backspace.
- "Note" button (pencil) → note sheet.
- Category button "⌄" → Category list. Subsection chip → list. "Expense | Income" switch. Date chip with "‹"/"›" ("Earlier"/"Later"). "A day" / "Whole month".
- Transfer mode: "From" / "To" chips, swap button.
- FAB "Save". When editing: "Delete this amount" / "Delete this transfer" (asks).

### Category screen (tile "›" or hold)
- Glyph and name fields (edit in place), amounts in the window (tap → edit amount), "Add to this category", "Archive this category" (asks).

### Finance history (Finance top bar → ⟲)
- "Expenses" / "Incomes" and "Day | Calendar | Categories".
- Day: "One day at a time", "‹"/"›", amounts (tap → edit; chevron expands long note), "Today"; "Expenses over time" chart with bucket and range chips; "Balance over the same range"; "Where it went".
- Calendar: month "‹"/"›"; tap a day, then "Open this day".
- Categories: "Period" chips incl. "Custom" ("Starts"/"Ends"); tick categories (group tick = all); totals "Spent"/"Received", "By category", list ("Show N more").
- Foot: wrapped, "Insights", "Settings" (→ Finance settings).

### Budgets (Finance → "Budgets")
- Tap a category → budget sheet: "Monthly budget" amount (0 removes), "Tell me at 80% and 100%", "Save budget".

### Recurring payments (Finance → "Recurring payments")
- Tap a payment → edit sheet; "Add a payment" → sheet: Name, Amount, Category, Subsection, "Repeat" Weekly/Monthly/Yearly, "On day", "Counts for the whole month", "Save", "Delete this payment".

### Savings goals (Finance → "Savings goals")
- Tap a goal → edit; "Add a goal" → sheet: glyph, name, "Target", "Subsection", "A date to reach it by", "Save", "Delete this goal". Progress = subsection balance (fill it with a transfer).

### Finance settings (Settings → "Finance settings")
- "Counted in" (currency text), "Opens on" (interval + Expenses/Incomes), "History opens on".

## 5. Settings (nav: gear)
- Top-right "РУ" / "EN" = app language.
- Appearance: "Presets" theme cards; "Custom" card (tap its colour dots → colour picker).
- Sections: "Workout settings", "Daily tasks settings", "Finance settings".
- AI: "AI assistant" row → AI settings.
- "Achievements and levels" switch (off by default) — turns on levels, badges, weekly goal, streak freezes, milestones; then "Badges" row.
- Everything, in one file: "Last backup" status, "Back up automatically" switch, "Export everything", "Replace everything from a file" (asks), "Export a spreadsheet (CSV)" → "Export amounts (CSV)" / "Export workouts (CSV)".
- "Reset every setting" (asks; logs untouched).
- FAB "Choose a backup folder" / "Back up now".

## 6. AI assistant
### Opening
- Sparkle orb in any section's top bar, an AI card's prompt chip, "Ask the assistant about it" after a debrief. Without a working key it opens AI settings first.
### AI settings (Settings → "AI assistant")
- "Provider" (Google Gemini), "API key" field with "Paste" and "x" clear, "Model" (tap → model list), "What it reads"; FAB "Test & connect" / "Test again"; "Disconnect…" (asks).
### AI chat
- Header: "<" Back, clock icon = "Past chats" sheet (tap to reopen, "x" deletes with Undo), "+" = "Start a new chat".
- Starter prompt chips; text box ("Ask, or say what to change…/what you did…/what you spent…"); send arrow. Keyboard mic works for voice.
- Answer cards: "Suggested routine" or "Suggested edit" → "Review & edit" or "Add to routines"/"Apply changes"; "Suggested changes" → "Apply changes"/"Discard"; "Suggested training loop" → "Apply loop"/"Discard". Nothing changes until Apply; applying shows an Undo toast.
### AI review (from "Review & edit")
- Routine name, "Why", exercise rows with Sets/Reps/Kg steppers, "Keep"/remove, "Add an exercise"; bottom "Discard" and "Add to routines"/"Apply changes".`;
