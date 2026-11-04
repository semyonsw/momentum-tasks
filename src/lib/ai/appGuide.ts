/**
 * The app, described for the assistant — so "where do I pause a habit?" gets a
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
 * Sent with the chat (`aiPrompts.ts`): "where is X" is asked from the chat —
 * the price of the answer being right, paid once per request.
 */

/** How to use the guide — the rules, kept apart from the map they apply to. */
export const APP_GUIDE_RULES = `APP GUIDE. Below is a map of this app's screens and controls. Use it whenever the user asks where something is, how to do something in the app, what a button does, what the app can do, or asks for a guide or documentation.
- Answer "where/how" with the exact path of taps as a short numbered list in one "text" block (e.g. "1. Settings tab (gear). 2. "AI coach" row. 3. ..."), naming icons by how they look. Mention a hold or hidden tap explicitly — those are what users miss.
- If the user writes in Russian, describe the controls in Russian; the quoted labels in the map are the English UI text, so translate them naturally rather than quoting English.
- For "what can this app do" or a full guide: one "summary" block per part of the map with notes (at most 4 notes each, short), then offer to explain any part.
- If the user could do it through you (the "AI coach" part of the map lists what you can change), say so and offer it — but still say where it is in the app.
- Never describe a screen, button or feature the map does not contain. If it is not there, say the app does not have it. This app is one log; it has no screens for anything else.`;

const CONVENTIONS = `APP MAP
Conventions: "tap" = short press, "hold" = long-press. Labels in quotes are the exact on-screen English text. Icon-only buttons are described by icon. Every hold has a visible twin (a ⋯ button, a labelled button or a ⋮⋮ grip). Most destructive actions show an "Undo" toast for a few seconds; the rest ask first.`;

const NAVIGATION = `## 1. Navigation

### Bottom nav bar (glass pill, icon + label)
- Two items: "Tasks" (where the app opens) and "Settings". The active one is in the accent colour.
- Hidden on pushed screens and while a sheet is open. Android Back on a pushed screen goes back one screen; Back on the "Tasks" screen leaves the app.

### Top bar of the "Tasks" screen
- Round icons with captions underneath: "AI coach" (sparkle) · "History" (clock-arrow).
- Settings has "РУ" / "EN" language letters here instead.

### First launch
- Language choice: tap Русский or English.`;

const TASKS_MAP = `## 2. Tasks (nav: "Tasks")

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
- A switch: "Month", "Year", "Trend"; tap a day to open it.

### Daily tasks settings (Settings → "Daily tasks settings")
- Vacation pause; history range.`;

const SETTINGS = `## 3. Settings (nav: "Settings")
- "РУ" / "EN" language; appearance presets and custom colours; "Daily tasks settings"; "AI coach" row → AI settings.
- "Achievements and levels" switch (levels, badges, streak freezes) and "Badges".
- Backups: "Back up automatically", "Export everything", "Replace everything from a file" (asks); "Reset every setting" (asks).`;

const ASSISTANT = `## 4. AI coach
### Opening
- "AI coach" (sparkle) in the top bar, or an AI card's prompt chip. Without a working key it opens AI settings first.
### AI settings (Settings → "AI coach")
- Provider (Google Gemini), API key with paste/clear, model, what it reads; "Test & connect"; disconnect (asks).
### AI chat
- Header: "<" Back, clock icon = past chats, "+" = new chat.
- Starter chips, including "App guide". Type a question or tell it what to do; to talk instead of type, tap the mic on your phone's keyboard.
- It can, through a card you must Apply: add a task, rename it, change its schedule or daily target, archive it, and tick, excuse or clear a task's day.
- Answer cards: "Suggested changes" → "Apply changes"/"Discard". Nothing changes until Apply; applying shows an Undo toast.`;

/** The whole map the assistant is given. */
export const APP_GUIDE = [CONVENTIONS, NAVIGATION, TASKS_MAP, SETTINGS, ASSISTANT].join('\n\n');
