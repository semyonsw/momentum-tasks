/**
 * How big the working numbers can be drawn.
 *
 * ── WHY A FUNCTION AND NOT A SIZE IN THE SCALE ──────────────────────────────
 *
 * `focus-work` was 56 dp and the comment in `tailwind.config.js` says exactly why:
 * `+120 kg × 12 reps` on ONE line, with its units at 22, lands at 314 of the 328
 * dp a 360 dp phone has inside its gutter. That is a line already touching the
 * edge — so no constant in the scale could be raised without clipping the worst
 * realistic set, and the size everybody actually reads was being set by a set
 * almost nobody does.
 *
 * The line is two lines now (`components/FocusNumbers.tsx`), which gives each
 * number the whole width, and at that point the right size stops being a constant
 * at all: `5 REPS` could be drawn at 140 and `+120 KG` at 96 on the same phone.
 * This is that arithmetic — the biggest size at which EVERY line still fits —
 * and it is here rather than in the component because it is a decision with
 * edge cases (the long weight, the narrow phone, the floor) and none of them can
 * be reached from a test that has to render a screen.
 *
 * ── THE MODEL ───────────────────────────────────────────────────────────────
 *
 * Measured off the app's own numerals rather than guessed: at weight 600 with
 * `tabular-nums`, a digit occupies almost exactly 0.60 of the font size, and the
 * unit beside it is drawn at `UNIT_RATIO` of the numeral with the same 0.6 per
 * character. A `+` and a `.` are narrower than a digit and are counted as full
 * ones, which is the direction an estimate here should err in: a line that ends
 * up 4 dp short of the edge costs nothing, and one that ends 4 dp past it clips
 * the number the whole screen exists to show.
 *
 * Every line gets the SAME size — the smallest that fits all of them. Two numbers
 * stacked at different sizes read as two different kinds of fact, and they are
 * the same kind: what to load, and how many.
 */

/** How wide one numeral glyph is, as a fraction of the font size. */
export const NUMERAL_ADVANCE = 0.6;

/**
 * And how wide a LETTER is — `MAX`, `МАКС`, the one value here that is a word.
 *
 * Tabular numerals are all one width and a capital M is not: measuring `MAX` as
 * three digits under-counts it by nearly half a line, which at 120 dp is the word
 * running off the screen. Capitals are the only letters that reach this, so this
 * is sized for them.
 */
export const LETTER_ADVANCE = 0.85;

/** Per character, by what it is. Digits and the signs around them are tabular. */
function advanceOf(text: string): number {
  let ems = 0;
  for (const ch of text) ems += /[0-9+\-.,:]/.test(ch) ? NUMERAL_ADVANCE : LETTER_ADVANCE;
  return ems;
}

/** The unit's font size, as a fraction of the numeral's. `KG`, `REPS`, `SEC`. */
export const UNIT_RATIO = 0.3;

/** The gap between a number and its unit, in numeral em. */
export const UNIT_GAP = 0.2;

/**
 * Below this the two-line layout has stopped being worth its vertical space —
 * `display` is what the same numbers are drawn at everywhere else in the app, so
 * a "big" number that went under it would be a regression wearing a feature's
 * clothes. Reached only on a phone narrower than anything sold.
 */
const FLOOR = 40;

export interface WorkLine {
  /** The numerals, already formatted: `+120`, `32.5`, `12`. */
  value: string;
  /** What follows them, already translated: `KG`, `REPS`. May be empty. */
  unit: string;
}

/**
 * The biggest font size at which every line fits `width`, capped at `ceiling`.
 *
 * `width` is what the numbers actually have — the caller has already taken the
 * gutters and anything sitting beside them (the `±` box) off it. Returns a whole
 * number: fractional font sizes round differently on every renderer, and a size
 * that changes by a third of a pixel between two renders of the same set is a
 * number that shivers.
 */
export function workNumeralSize(
  lines: readonly WorkLine[],
  width: number,
  ceiling: number,
): number {
  if (lines.length === 0) return Math.floor(ceiling);
  /*
   * A width nobody has measured yet — the first render before layout, a caller
   * whose arithmetic went negative. The FLOOR is the only answer that cannot
   * overflow something, and it is one frame of a smaller number rather than one
   * frame of a number running off the screen.
   */
  if (!Number.isFinite(width) || width <= 0) return FLOOR;

  let fits = ceiling;
  for (const line of lines) {
    // In numeral em: the digits, then the unit at its own size, then the gap
    // between them — and no gap at all when there is no unit to separate.
    const ems =
      advanceOf(line.value) + (line.unit === '' ? 0 : UNIT_GAP + advanceOf(line.unit) * UNIT_RATIO);
    if (ems <= 0) continue;
    fits = Math.min(fits, width / ems);
  }

  // FLOOR rather than round: rounding up is a half-pixel that puts the widest
  // line back over the edge, which is the one outcome this whole file exists to
  // prevent. The floor is applied last so a phone too narrow for the smallest
  // legible number gets that number anyway rather than an unreadable one.
  return Math.max(FLOOR, Math.floor(Math.min(ceiling, fits)));
}
