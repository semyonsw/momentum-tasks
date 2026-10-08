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
