# Implementation decisions — Waves 0–3 (Oct 2026)

The contract for this run, from the Phase 2 answers. `ROADMAP.md` is the source of
truth for *what*; the Claude Design prototype (`Momentum.dc.html` + spec board) is the
picture of *how it looks*.

| # | Question | Decision |
|---|---|---|
| 1 | Scope | Wave 0 (UX), Wave 1, Wave 2, Wave 3. |
| 2 | Wave 4 (lock, notification, widgets, share card, onboarding) | Skipped for now. |
| 3 | Design vs. tokens | **Adopt the design's values app-wide**: `inkFaint` `#7D8882`; glass raised `.055` with a `.06` edge; lit c2 13% fill / 30% edge; radii 18 rows/tiles, 20 cards, 22 sheet, 24 hero. |
| 4 | Task tap (U5) | Tap toggles done ↔ not done. "Skip today, on purpose" moves to a long-press menu, with an Undo toast. |
| 5 | Training consistency | A weekly goal ring (`2 / 3 this week`) and **no streak**. The design's "{n} weeks in a row" line is not built. |
| 6 | Engagement (Wave 3) | Opt-in: one Settings switch, off by default. |
| 7 | Celebration | Quiet: one `SparkBurst` and one line. No light sweep on the milestone card. |
| 8 | Release cadence | No per-task or per-wave APKs. **One** version bump at the very end. |
| 9 | Push target | `main`, as CLAUDE.md says. |
| 10 | APK builds | Not built here (no SDK in this container). The final report gives the build steps for the Windows box. |
| 11 | Design gaps / design vs. file-header rule | Use the existing visual language. Where they conflict, the file-header rule wins, and each case is logged in `PROGRESS.md`. |

## Roadmap-level decisions (taken after ROADMAP.md arrived)

`ROADMAP.md` (§5 T-01…T-28, §8 T-U1…T-U8) is now committed beside this file and is the task
list. The design numbers its UX fixes differently from §8; the design's U-numbers map onto
§8 by content (design U5 = roadmap U6, design U7 = roadmap U10, and so on).

| Task | Open point in ROADMAP | Decision |
|---|---|---|
| T-27 · W8 | ROADMAP shows a weekly streak; answer 5 says ring only | Weekly goal ring (`2 / 3 this week`, ISO weeks). No streak. A week the user excuses (illness) shows as excused, not as a miss. |
| T-09 · W6 | Is the first-ever session "all PRs"? | No. A record needs a previous best to beat, so an exercise's first session shows no record. |
| T-11 · W1 | Does the nudge ignore sets above RPE 9? | Yes. A set at RPE ≥ 9.5 (RIR ≤ 0.5) is not used as evidence to raise the weight, because it was at the limit. |
| T-21 · W3 | Do secondary muscles count half? | Yes, 0.5 per set, and the screen says so in micro text. |
| T-10 · X1 | When is Wrapped offered? | Monthly Wrapped for the previous month is reachable from history at any time, and from a Landing card during the first 7 days of a month. The yearly one is offered during 1 Dec–31 Jan. |
| T-U1 · U4 | Font scale | `maxFontSizeMultiplier={1.3}`. `allowFontScaling={false}` stays only on measured focal numerals (focus mode, the timer pill). |
| Wave 0 | ROADMAP U-items the design doesn't draw (U14, U15, U18, U22, U24, U28…) | Built in the existing visual language (answer 11). |
| Wave 2–3 | New persisted fields | All optional. A v2.2.0 backup imports unchanged, and a test proves it for each new field. |
