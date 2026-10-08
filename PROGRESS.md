# Progress — Waves 0–3

Resume rule: re-read this file, `IMPLEMENTATION_DECISIONS.md` and `ROADMAP.md`, then carry
on from the first unchecked task. One version bump at the very end; no APK built here.

Baseline (v2.2.0): tsc clean · 86 files / 1712 tests · eslint 0 errors, 4 warnings.

## Wave 0 — UX
- [x] T-U1 Readability pass (U3, U4, U21, U22)
- [ ] T-U2 Touch-target pass (U17, U18, U28, U20, U16)
- [ ] T-U3 Commit-slot consistency (U5, U12, U27)
- [ ] T-U4 Tasks screen (U1, U2, U6, U13)
- [ ] T-U5 Sheets and keyboards (U7, U8, U26)
- [ ] T-U6 Landing (U9, U10)
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
