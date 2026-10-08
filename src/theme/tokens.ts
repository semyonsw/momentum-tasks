/**
 * Design tokens — the single source of truth for the visual system.
 *
 * These mirror the CSS variables in `global.css`. Tailwind/NativeWind classes
 * are the primary styling API (type scale, spacing and colours all live in
 * `tailwind.config.js`); this file exists for the places className can't reach:
 * SVG fills and strokes, the timer's numerals, and the app's one shadow.
 *
 * Rules encoded here:
 *  - ONE hue. Near-black page, one green scale, nothing else. No amber for
 *    warnings, no colour-coded categories. The single, deliberate exception is
 *    `danger` below — coral on the handful of controls that delete plan — and it
 *    is one constant so it can be turned back into `inkMuted` in one line.
 *  - Green-on-black TEXT is `greenBright` only; `green` fails contrast at small
 *    sizes and is for fills. Text on a `green` fill is `ink` at 600.
 *  - ONE radius SCALE, named by what a corner holds: 18 a row or tile, 20 a
 *    card, 22 a sheet, 24 the hero — plus 14 for a well or set row inside one,
 *    and the pill. It used to be two radii (14 and pill); the design board
 *    (tiles 16–17, "components → tokens") draws nested glass, and a card whose
 *    corner equals the row inside it stops reading as a container. Each step is
 *    2 dp apart so nesting is visible without any corner going soft. `radius`
 *    below holds them as numbers, `tailwind.config.js` as classes.
 *  - Elevation is hairlines + surface steps. Exactly ONE real shadow exists,
 *    under the timer pill, and exactly ONE glow (`glow`), behind the two marks
 *    that say "this is the work". Neither carries meaning on its own.
 *  - Numbers are always tabular. A weight that shifts by a pixel when it goes
 *    from 9 to 10 reps is the difference between "app" and "instrument".
 */

import { Easing, type BoxShadowValue, type TextStyle } from 'react-native';

import {
  DEFAULT_THEME_ID,
  DEFAULT_CUSTOM_COLORS,
  NEUTRALS,
  deriveTheme,
  rgba,
  themeColors,
  type DerivedTheme,
  type ThemeColors,
} from '../lib/theme';

/* ══════════════════════════════════════════════════════════════════════════
   THE THEME — the one green became three colours the user picks.

   Everything below that used to be a green literal is now a GETTER over the
   live theme, so the four hundred places that read `palette.greenBright`,
   `glassTier.lit` or `halo.single` paint in the chosen colours without a
   single call site learning that a theme exists.

   Why getters over a module-level theme rather than a React context: a context
   would mean threading a hook through every component that paints, including
   the forty memoised rows and the style objects built inside `useMemo`s. The
   app is dark-only and changes theme only from Settings, so the shell REMOUNTS
   the tree when the theme changes (`App.tsx`), every render re-reads these, and
   there is exactly one place that has to know the colours can move.
   ══════════════════════════════════════════════════════════════════════════ */

let current: DerivedTheme = deriveTheme(themeColors(DEFAULT_THEME_ID, DEFAULT_CUSTOM_COLORS));

/**
 * Pour three colours into the tokens. Called by the root before it renders, and
 * again — followed by a remount — whenever the setting changes.
 */
export function applyTheme(colors: ThemeColors): DerivedTheme {
  current = deriveTheme(colors);
  glow = tint(0.6);
  glowRepeating = tint(0.3);
  return current;
}

/** c2 at an alpha — the lit fills, borders, chips and glows. */
export function tint(alpha: number): string {
  return rgba(current.c2, alpha);
}

/** Any of the three stops at an alpha — for the lamps and the tile corners. */
export function stopTint(stop: 1 | 2 | 3, alpha: number): string {
  return rgba(stop === 1 ? current.c1 : stop === 3 ? current.c3 : current.c2, alpha);
}

/**
 * THE GRADIENT FILL — floating actions, marks, thumbs, the Home button:
 * `linear-gradient(135deg, c1, c2 55%, c3)`. `expo-linear-gradient` props.
 */
export function gradientFill(): {
  colors: [string, string, string];
  locations: [number, number, number];
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  return {
    colors: [current.c1, current.c2, current.c3],
    locations: [0, 0.55, 1],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  };
}

/** THE BAR — `linear-gradient(90deg, c1, c2 50%, c3)`: previews, swatches, bars. */
export function gradientBar(): {
  colors: [string, string, string];
  locations: [number, number, number];
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  return {
    colors: [current.c1, current.c2, current.c3],
    locations: [0, 0.5, 1],
    start: { x: 0, y: 0.5 },
    end: { x: 1, y: 0.5 },
  };
}

/**
 * THE AI COLOURS — fixed, never themed, so the assistant always stands out
 * from whatever three colours the rest of the app is wearing.
 */
export const ai = {
  ring: ['#8B5CF6', '#EC4899', '#F59E0B', '#22D3EE', '#8B5CF6'] as const,
  innerFrom: '#34245A',
  innerTo: '#130E22',
  glyph: '#FBCFE8',
  subline: ['#C4B5FD', '#F9A8D4', '#A5F3FC'] as const,
  ready: '#F472B6',
} as const;

export const palette = {
  // The neutrals' values live in `lib/theme.ts` (`NEUTRALS`), where the
  // contrast test can reach them.
  bg: NEUTRALS.bg, // page — near-black (OLED off-pixels)
  surface: NEUTRALS.surface, // cards, set rows
  surfaceAlt: NEUTRALS.surfaceAlt, // wells, the primed next set, inline editors, timer pill
  hairline: NEUTRALS.hairline, // 1px separators — the only "border" in the app
  ink: NEUTRALS.ink, // primary text. never pure white
  inkMuted: NEUTRALS.inkMuted, // secondary text, and any text you can act on
  inkFaint: NEUTRALS.inkFaint, // micro-labels, ghosted prefilled values — never an action
  /** Tinted card background — overload nudge only. */
  get greenWash(): string {
    return current.wash;
  },
  /** Progress tracks, timeline connectors, drop-target rules. */
  get greenDim(): string {
    return current.dim;
  },
  /** Primary fills — c2. Text on it is `onAcc`, never `ink`. */
  get green(): string {
    return current.c2;
  },
  /** Accent text/icons on black — `acc`. */
  get greenBright(): string {
    return current.acc;
  },
  get acc(): string {
    return current.acc;
  },
  get onAcc(): string {
    return current.onAcc;
  },
  get c1(): string {
    return current.c1;
  },
  get c2(): string {
    return current.c2;
  },
  get c3(): string {
    return current.c3;
  },
  /** Scrim behind a bottom sheet. */
  scrim: 'rgba(6,8,7,0.55)',
};

/**
 * GLASS — the raised translucent surfaces the sections are built from.
 *
 * A few percent of ink over the near-black, with a few percent more holding the
 * edge, so a card is legible over the lamps without punching a hole in them.
 * Flat alpha: every surface is one value, and `bg-ink/[0.055]` in a className is
 * the same decision as `glass.raised` here.
 *
 * The values are the design board's (decision 3): raised 5.5% with a 6% edge,
 * lit c2 at 13% with a 30% edge — the same numbers as `glassTier.card` and
 * `glassTier.lit` below, so a flat card and a glass pane of the same rank no
 * longer disagree by half a percent. The edge replaced the opaque `hairline` on
 * raised cards: a solid #1E2523 line over a lamp reads as a cut-out, a
 * translucent one as the rim of the pane.
 */
export const glass = {
  /** Cards, rows, tiles — the default raised surface. */
  raised: 'rgba(236,241,238,0.055)',
  /** Its edge. */
  raisedEdge: 'rgba(236,241,238,0.06)',
  /** Chips, wells and the second step down: present, but not a card. */
  sunken: 'rgba(236,241,238,0.03)',
  /** A dashed "add one" target — barely there until you look for it. */
  ghost: 'rgba(236,241,238,0.015)',
  /** The lit version: a surface that is currently the answer. */
  get green(): string {
    return tint(0.13);
  },
  /** Its edge. The hairline is invisible against a lit fill. */
  get greenEdge(): string {
    return tint(0.3);
  },
};

/**
 * THE FOUR STEPS OF FILL a month grid is drawn in, lightest first.
 *
 * `green-bright` at four alphas rather than four colours: it is one hue at four
 * distances, which is what makes a grid of them read as a scale instead of as a
 * legend you have to learn. They live here rather than in the screen because the
 * legend under that grid draws the same four, and a scale whose key disagrees
 * with the squares is worse than no key at all.
 */
export function greenSteps(): readonly [string, string, string, string] {
  return [tint(0.24), tint(0.42), tint(0.6), tint(0.82)];
}

/**
 * The one GLOW, and the only thing in the app that is not a hairline or a surface
 * step doing the job of elevation.
 *
 * `green-bright` spread behind two marks and no others: the current exercise's card
 * while it is shut, and the row of the set that should happen next. Both marks are
 * complete without it — a `green-bright` border and `green-bright` numerals carry
 * the meaning — so a renderer that drops `boxShadow` loses gloss and not
 * information. That is the condition on which it is allowed to exist.
 *
 * IT USED TO BE 0.34 AND IT WAS TOO POLITE. At a third alpha the halo is something
 * you notice on a desk and not on a bench: the phone is a metre away, face-up,
 * under gym lighting, and the whole job of this value is to make one row findable
 * without reading it. 0.6 is still translucent — it never becomes a fill, and the
 * numerals under it stay legible — but it reads as a lit row rather than a slightly
 * softer edge.
 *
 * Still ONE value. The ring, the card and the numerals all use it; only the blur
 * radius differs, because a 2 dp outline and a 30 dp numeral need different spreads
 * to bloom by the same amount.
 */
// Reassigned by `applyTheme`, so importers read the live theme.
export let glow = tint(0.6);

/**
 * THE SAME GLOW, FOR A MARK THAT REPEATS.
 *
 * `glow` is sized for exactly one card on a screen: at 0.6 and 18 dp of blur it
 * is findable from a metre away, which is the whole point on a bench. Nine done
 * tasks in a column at that value is nine halos overlapping into a green wall —
 * a row's own edge stops being a line you can see, and the list reads as lit
 * rather than as a list of which rows are lit.
 *
 * So a repeating mark gets this instead: half the alpha and half the spread, a
 * thin line of light along the border rather than a bloom around the whole row.
 * The rule for choosing is not "how important is this" but "how MANY of these
 * can be on screen at once" — one, `glow`; a column of them, this.
 *
 * Both are `boxShadow` and never `elevation`. Android's elevation draws its own
 * opaque, much wider shadow that ignores the radius asked for, which is exactly
 * how this got thick enough to need fixing.
 */
// Reassigned by `applyTheme`, so importers read the live theme.
export let glowRepeating = tint(0.3);

/**
 * The app's ONLY shadow. It belongs to the timer pill and nothing else — the
 * clock has to read as the layer above the list. Spec: `0 14px 36px rgba(0,0,0,0.65)`.
 */
export const timerShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 14 },
  shadowOpacity: 0.65,
  shadowRadius: 18,
  elevation: 16,
} as const;

/**
 * The halo behind a focus-mode numeral. Empty since 2.1.0 — see `textGlow`.
 *
 * The app's one glow, at a wider radius than `SetRow`'s 16: these numerals are
 * twice the size and more, and a bloom that does not grow with the glyph reads as
 * a sharper edge rather than a lit one. A token rather than a constant in a
 * component because two of them now draw glowing numerals — the clock's get-ready
 * count and the working numbers — and a glow that drifted apart between them
 * would be two different lights on one screen.
 */
export const focusGlow: TextStyle = {};

/* ══════════════════════════════════════════════════════════════════════════
   LIQUID GLASS — the layer the redesign added on top of everything above.

   Nothing below changes a colour. The palette, the hue rule and the type scale
   are untouched; what is new is DEPTH — the surfaces stopped being flat alpha
   over a flat page and became panes with light under them.

   The one thing the old glass was missing: the section glow sat BEHIND a
   surface with nothing to transmit, so a card over it read as a slightly
   lighter black. The lamps are layer 1, the glass is layer 2, and the glass is
   translucent enough to carry the lamp through it. That is the whole change,
   and every token below serves it.

   Six layers, bottom to top:
     0  page      #060807
     1  lamps     radial green, decorative, breathing            `LAMPS`
     2  content   cards, rows, tiles                             `glassTier`
     3  floating  one action per section, its own glow           `halo.floating`
     4  bars      top bar and nav pill, content scrolls under    `glassTier.bar`
     5  sheets    focus mode, keypad, confirmations
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * A glass tier — one tint, one blur, one border, one specular edge. FOUR of
 * them, and there is deliberately no way to ask for a fifth: a surface that
 * needs its own alpha is a surface that has stopped belonging to the system.
 *
 * `blur` is no longer a blur: since 2.1.0 there is none in the app, and `Pane`
 * (`components/glass.tsx`) turns it into how opaque a pane's dark fill is. The
 * number keeps its old meaning so the order still holds. The history: it was an
 * `expo-blur` INTENSITY. On Android that library divided it by
 * `blurReductionFactor`, and `components/glass.tsx` passes 1 — so these are the
 * design's own px blur radii, one for one, which is the most defensible mapping
 * available without a device to calibrate against. What must hold either way is
 * the ORDER: `well` < `card` < `lit` < `bar`.
 *
 * SATURATION HAS NO PROP. The design's `saturate(140–170%)` is what keeps the
 * glass dark and moody rather than milky, and `BlurView` cannot do it. The
 * compensation is to push the tint greener on the two tiers that carried the
 * most saturation — which is why `lit` is a green tint rather than an ink one,
 * and why `bar` is tinted with `surface` (#0E1211, the page's own green cast)
 * instead of with black.
 */
export interface GlassTier {
  /** Overlaid on the blur, as a plain `View`. */
  tint: string;
  /** The old blur intensity, 0–100 — now the backdrop fill's strength. */
  blur: number;
  /** The 1px edge that holds the pane. */
  border: string;
  /** The 1px lit line along the top edge, or null for a tier without one. */
  specular: string | null;
}

export const glassTier: Record<'well' | 'card' | 'lit' | 'bar', GlassTier> = {
  /** A well inside a card — present, but not a pane of its own. */
  well: {
    tint: 'rgba(236,241,238,0.028)',
    blur: 14,
    border: 'rgba(236,241,238,0.045)',
    specular: null,
  },
  /** The default raised pane: cards, rows, tiles, keypad keys. */
  card: {
    tint: 'rgba(236,241,238,0.055)',
    blur: 20,
    border: 'rgba(236,241,238,0.06)',
    specular: 'rgba(236,241,238,0.10)',
  },
  /** A pane that is currently the answer — the hero, a done task, a lit tile. */
  lit: {
    get tint(): string {
      return tint(0.13);
    },
    blur: 24,
    get border(): string {
      return tint(0.3);
    },
    specular: 'rgba(236,241,238,0.14)',
  },
  /** The two bars. The heaviest blur in the app, because content moves under it. */
  bar: {
    tint: 'rgba(14,18,17,0.58)',
    blur: 34,
    border: 'rgba(236,241,238,0.075)',
    specular: 'rgba(236,241,238,0.12)',
  },
} as const;

/** The floating action's own edge — the one element with a heavier specular. */
export const specularHeavy = 'rgba(236,241,238,0.22)';

/**
 * RETIRED IN 2.1.0 — every step is now empty, and that is the whole design.
 *
 * A blurred `boxShadow` on Android is a `RenderEffect` blur pass per view, and
 * the app had a hundred of them, several on views that scale, slide or sit in a
 * scrolling list. They were the largest share of the frames the UI dropped, for
 * a bloom on a dark page. Borders and fills carry the meaning — a lit pane is
 * still the green-tinted, green-edged one — so the names stay for the callers
 * and the light is gone. What follows is the old rule, kept for the count:
 *
 * THREE GLOW STEPS, and the rule for choosing between them is a COUNT rather
 * than an importance: how many of these can be on one screen at once.
 *
 *   repeating   many — done tasks, lit chips, the sequence's active step
 *   single      EXACTLY ONE per screen — the up-next set's ring
 *   floating    the floating action, and nothing else
 *
 * All three are `boxShadow` and never `elevation`. Android's `elevation` draws
 * its own opaque, much wider shadow that ignores both the colour and the radius
 * asked for — which is how the old repeating glow got thick enough to need
 * fixing in the first place.
 */
export const halo = {
  repeating: [] as BoxShadowValue[],
  single: [] as BoxShadowValue[],
  floating: [] as BoxShadowValue[],
  /** The soft bloom a hero card carries under its shadow. Not a halo step. */
  hero: [] as BoxShadowValue[],
};

/**
 * THE SHADOW UNDER THE GLASS — also retired, for the same reason as `halo`.
 * On a #060807 page a black drop shadow was close to invisible, and each one was
 * still a blurred layer behind a card that scrolls. The three steps stay as
 * names so a pane can keep saying how far up it sits; they draw nothing.
 */
export const elevation = {
  /** Cards, rows, tiles. */
  e1: [] as BoxShadowValue[],
  /** Hero cards and floating elements. */
  e2: [] as BoxShadowValue[],
  /** The rest clock, and nothing else. */
  e3: [] as BoxShadowValue[],
};

/**
 * RADIUS — the design board's scale (tiles 16–17): 18 a row or tile, 20 a card,
 * 22 a sheet, 24 a hero. Softer than the flat design's 14, because a pane with a
 * tight corner reads as a cut-out rather than as glass, and 2 dp apart so a card
 * holding rows, or a sheet holding cards, shows its nesting at the corner.
 * `sheet` is new with the scale: sheets borrowed `hero` before, which made the
 * finish sheet's corner the same as the hero card it slides over.
 *
 * These live here as NUMBERS as well as in `tailwind.config.js` because a
 * `BlurView` has to be told its corner in `style` — NativeWind's transform does
 * not reach a native component — and a radius that disagreed between the
 * clipper and the blur inside it is a hairline of unblurred page along the edge.
 */
export const radius = {
  cell: 10, // a calendar square
  row: 18, // a row, a chip container, a keypad key
  card: 20, // a card with contents of its own
  sheet: 22, // a bottom sheet's top corners
  hero: 24, // a hero, an instrument
  navPill: 26, // the nav pill, and only it
  pill: 9999,
} as const;

/**
 * FOUR FOCAL TYPE STEPS, and the rule that makes them work: ONE HERO PER
 * SCREEN, and nothing else on that screen comes near its size.
 *
 * They are here rather than in `tailwind.config.js` because every one of them
 * is a NUMBER a screen has to reason about — the day dial measures itself
 * against the ring it sits in, the amount shrinks to fit its own width. A
 * className cannot be measured.
 *
 * The fifth step the design names — focus mode's 112 — is not here on purpose:
 * `lib/focusType.ts` already measures that one per screen, and a fixed value
 * beside it would be a second opinion about the same numerals.
 */
export const focalType = {
  /** Today's routine name on the workout hero. */
  heroName: { fontSize: 32, lineHeight: 36, letterSpacing: -0.9 },
  /** The all-time balance. */
  balance: { fontSize: 54, lineHeight: 56, letterSpacing: -2 },
  /** The keypad's amount. */
  amount: { fontSize: 62, lineHeight: 66, letterSpacing: -2.4 },
  /** The day number inside the tasks dial. Was 44. */
  dayDial: { fontSize: 66, lineHeight: 66, letterSpacing: -2.4 },
} as const;

/**
 * THE TEXT GLOWS — retired with `halo`: a 30 dp text shadow is re-rasterised
 * every time the number under it rolls, which is exactly when the frame budget
 * is tightest. Empty styles, so the call sites keep their shape.
 *
 * The old note: `textShadow` is native on both platforms, so unlike the box
 * halos these need no workaround — but they still belong here, because the
 * numerals that carry them live in three different screens and a bloom that
 * drifted apart between them would read as two different lights.
 */
export const textGlow: Record<'hero' | 'live', TextStyle> = {
  /** The day number, the balance. */
  hero: {},
  /** The up-next set's numbers. */
  live: {},
};

/**
 * THE LAMPS — layer 1, per section.
 *
 * Two or three radial greens on the page, one of them anchored behind whatever
 * that section's hero is. They carry NO information: a build that dropped this
 * table entirely would lose atmosphere and not one fact, which is the condition
 * on which decoration is allowed to exist in this app at all.
 *
 * `x` is a fraction of the width and `y` is in dp from the top, because a lamp
 * behind the tasks dial has to stay behind the dial on a tall phone rather than
 * sliding down with a percentage.
 */
export interface LampSpec {
  /** 0–1 across the width. */
  x: number;
  /** dp from the top. */
  y: number;
  /** Radius in dp. */
  r: number;
  /** Peak opacity at the centre. */
  a: number;
  /** `bright` is c2, `dim` is c1, `third` is c3 — the theme's three stops. */
  hue?: 'bright' | 'dim' | 'third';
}

export const LAMPS: Record<string, readonly LampSpec[]> = {
  /** The landing: all three stops, one per sphere the tiles below it lead to. */
  Home: [
    { x: 0.22, y: 190, r: 260, a: 0.3, hue: 'dim' },
    { x: 0.88, y: 470, r: 240, a: 0.18, hue: 'third' },
    { x: 0.3, y: 810, r: 260, a: 0.14 },
  ],
  Workout: [
    { x: 0.4, y: 250, r: 200, a: 0.17 },
    { x: 0.98, y: 560, r: 170, a: 0.14, hue: 'dim' },
  ],
  Tasks: [
    { x: 0.5, y: 240, r: 210, a: 0.2 },
    { x: 0.08, y: 90, r: 150, a: 0.14, hue: 'third' },
    { x: 0.96, y: 620, r: 180, a: 0.14, hue: 'dim' },
  ],
  Expenses: [
    { x: 0.46, y: 210, r: 200, a: 0.18 },
    { x: 0.04, y: 420, r: 160, a: 0.14, hue: 'dim' },
    { x: 0.96, y: 700, r: 180, a: 0.12, hue: 'third' },
  ],
  Settings: [
    { x: 0.12, y: 120, r: 180, a: 0.12 },
    { x: 0.92, y: 500, r: 180, a: 0.1, hue: 'third' },
  ],
  /** Focus mode's single lamp, behind the numbers. */
  Focus: [{ x: 0.3, y: 370, r: 260, a: 0.16 }],
  /** The session screen: one behind the rest clock, one low on the right. */
  Session: [
    { x: 0.5, y: 200, r: 200, a: 0.14 },
    { x: 0.95, y: 600, r: 170, a: 0.1, hue: 'dim' },
  ],
  /** The launch: c2 behind the mark, c1 top-left, c3 bottom-right. */
  Launch: [
    { x: 0.5, y: 380, r: 230, a: 0.26 },
    { x: 0.12, y: 110, r: 160, a: 0.22, hue: 'dim' },
    { x: 0.92, y: 750, r: 180, a: 0.18, hue: 'third' },
  ],
};

/**
 * THE FLOATING SLOT — identical coordinates in every section, which is the
 * whole of placement rule 2 and half the reason the redesign exists.
 *
 * `right: 16, bottom: 92` puts one commit action in the thumb's arc on every
 * screen that has one, and the top-right corner keeps navigation only. On an
 * 800 dp phone a `Save` in that corner is ~620 dp of diagonal travel from a
 * right thumb, and the app was asking for that trip forty times a session.
 *
 * `bottom` clears the nav pill (64 tall at inset 12) with 16 of air.
 */
export const floatingSlot = { right: 16, bottom: 102, height: 64, paddingH: 24 } as const;

/**
 * The same slot on a PUSHED screen (an editor, a detail): no nav pill under it,
 * so 28 off the bottom (the design's worded pill sits at 24 + the pill's edge).
 * `clearance` is what a scroll on such a screen leaves under its last row so the
 * pill never sits on it: 28, the pill, and 24 of air.
 */
export const pushedSlot = {
  bottom: 28,
  clearance: 28 + floatingSlot.height + 24,
} as const;

/**
 * What a scroll must clear so the two translucent bars never hide a row.
 *
 * Content scrolls visibly UNDER both bars — that is the single clearest read on
 * whether the glass is working — so this padding is the only thing keeping the
 * first and last rows reachable. `bottom` is the nav pill (64), its inset (12),
 * and the floating action's clearance.
 */
export const barInset = { top: 76, bottom: 190 } as const;

/* ══════════════════════════════════════════════════════════════════════════
   MOTION — the redesign's second pass, and the one thing it adds to this file
   that is about TIME rather than about paint.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Three curves and a short list of durations. Every animation the motion pass
 * added uses one of these, multiplied by `useMotionScale()` so Android's "Remove
 * animations" turns the whole pass into end states at once.
 *
 *   ease   — anything arriving or moving. The base curve the app already had.
 *   pop    — a thing that is CAUGHT: a ✓, the Done pill, the DONE press. It
 *            overshoots, and the overshoot is the acknowledgement.
 *   spring — a sliding thumb or pane: the tab bar, a segmented control, the
 *            language switch. A slight overshoot, less than `pop`, because a thumb
 *            that lands is a position and not an event.
 *
 * NUMBERS, NOT `Easing` OBJECTS, so the table stays data a test can read and a
 * designer can diff against the handoff. `curve()` turns one into an easing.
 */
export const motion = {
  ease: [0.2, 0.8, 0.2, 1] as const,
  pop: [0.34, 1.56, 0.64, 1] as const,
  spring: [0.34, 1.25, 0.64, 1] as const,
  /** Scale-down on press. */
  press: 140,
  /** A section, a card, a row arriving: fade and rise. */
  enter: 320,
  /** A bottom sheet or focus mode sliding up. */
  sheet: 420,
  /** A set row growing in or shrinking out. */
  row: 300,
  /** Rolling digits. */
  roll: 650,
  /** A progress ring re-filling. */
  ring: 700,
  /** A logged set's green flash. */
  flash: 900,
  /** Focus mode's DONE ripple. */
  ripple: 700,
  /** One beat of the final-ten-seconds pulse. */
  pulseMs: 1000,
  /** One breath of the workout hero's halo. */
  halo: 6000,
} as const;

/**
 * THE ONE NON-GREEN HUE, and the rule that keeps it rare: destructive actions,
 * and only where they are already out of the way — the per-row `−` and
 * `Remove exercise` inside session edit mode, and the Settings reset.
 *
 * It exists because edit mode puts a delete next to every set row, and in green
 * a `−` beside a ✓ reads as another way of logging. Set this to
 * `palette.inkMuted` and the app is one hue again.
 */
export const danger = '#E0735F';

/**
 * One of the `motion` curves as an `Easing`, for `Animated.timing`.
 *
 * The only thing in this file that imports React Native, and it is here rather
 * than beside the hook because a curve and its name belong in the same table.
 */
export function curve(c: readonly [number, number, number, number]): (value: number) => number {
  return Easing.bezier(c[0], c[1], c[2], c[3]);
}
