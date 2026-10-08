/**
 * Tailwind / NativeWind configuration.
 *
 * The scale is deliberately amputated: no default colour palette, five radii,
 * five spacing steps, five type sizes. A design system you cannot deviate from
 * is what keeps a minimal app minimal six months in.
 *
 * Colour is near-black + one green scale. There is no second hue: no red for
 * destructive, no amber for warnings, no category chips. Green-on-black TEXT
 * is always `green-bright` (`green` fails contrast at small sizes); text on a
 * `green` fill is always `ink` at 600.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    // `colors` (not `extend.colors`) — the default Tailwind palette is removed
    // on purpose so `text-blue-500` simply doesn't exist.
    colors: {
      transparent: 'transparent',
      bg: 'rgb(var(--bg) / <alpha-value>)',
      surface: 'rgb(var(--surface) / <alpha-value>)',
      'surface-alt': 'rgb(var(--surface-alt) / <alpha-value>)',
      hairline: 'rgb(var(--hairline) / <alpha-value>)',
      ink: 'rgb(var(--ink) / <alpha-value>)',
      'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
      'ink-faint': 'rgb(var(--ink-faint) / <alpha-value>)',
      'green-wash': 'rgb(var(--green-wash) / <alpha-value>)',
      'green-dim': 'rgb(var(--green-dim) / <alpha-value>)',
      green: 'rgb(var(--green) / <alpha-value>)',
      'green-bright': 'rgb(var(--green-bright) / <alpha-value>)',
      // THE THEME, as named stops. `green-*` above are the same variables under
      // their old names — every one of them is derived from these three now
      // (`lib/theme.ts`), and `App.tsx` rewrites them all when the theme changes.
      acc: 'rgb(var(--acc) / <alpha-value>)',
      'on-acc': 'rgb(var(--on-acc) / <alpha-value>)',
      c1: 'rgb(var(--c1) / <alpha-value>)',
      c2: 'rgb(var(--c2) / <alpha-value>)',
      c3: 'rgb(var(--c3) / <alpha-value>)',
    },
    // THE RADIUS SCALE is the design board's (tiles 16–17, decision 3): 18 a
    // row or tile, 20 a card, 22 a sheet, 24 a hero, each 2 apart so a container
    // reads as one at its corner — a card's corner equal to the row inside it is
    // how nesting stops reading. Below that sit `cell` and `surface` (14), the
    // well or set row INSIDE a row; the design keeps set rows at 14 on purpose.
    //
    // Only the steps a className needs are here. Cards (20) and heroes (24) are
    // glass panes, and their corners live in `radius` in `theme/tokens.ts` as
    // NUMBERS, because a native backdrop has to be told its corner in `style` —
    // NativeWind's transform does not reach a native component — and a second
    // spelling of the same step is a second thing to keep in sync for nobody.
    borderRadius: {
      none: '0',
      cell: '10px', // a calendar square, a keypad key
      surface: '14px', // wells, set rows, inline editors — inside a row or card
      card: '18px', // a row or tile with its own contents — category tiles, task rows
      sheet: '22px', // a bottom sheet, the balance panel
      pill: '9999px',
    },
    fontSize: {
      // Momentum's +1.5 px: the three small steps grew so the running text and
      // the kickers read at arm's length on a bench, not just in a hand.
      micro: ['12.5px', { lineHeight: '16px', letterSpacing: '1.1px' }],
      label: ['14.5px', { lineHeight: '20px' }],
      body: ['17px', { lineHeight: '23px' }],
      // The one step between label and body: a task's name, a toast.
      task: ['16.5px', { lineHeight: '22px' }],
      title: ['22px', { lineHeight: '28px', letterSpacing: '-0.4px' }],
      // The SIXTH size, and it exists for exactly one thing: the numbers of the
      // set that is up next (`SetRow`). Title is what every other set row reads,
      // and Display is the timer pill — 40 px of numeral does not fit beside a
      // ✓ and a ▶. This is the one step between them, so "bigger" is a real
      // step in the scale rather than a transform nobody else can reuse.
      'title-lg': ['26px', { lineHeight: '32px', letterSpacing: '-0.6px' }],
      // The SEVENTH, and the up-next row's numbers moved onto it: 26 read as
      // "slightly larger" and the point of that row is that it is findable
      // without being read. 30 is the largest numeral that still leaves the ✓ and
      // the ▶ their thumb targets on a 360 dp phone with a five-character weight
      // in the cell — past it the row starts clipping instead of shouting.
      'title-xl': ['30px', { lineHeight: '36px', letterSpacing: '-0.8px' }],
      display: ['40px', { lineHeight: '44px', letterSpacing: '-1.2px' }],
      // The EIGHTH, NINTH and TENTH, and all three exist only inside focus mode
      // (`components/FocusMode.tsx`) — the full-screen sheet where one fact owns
      // the screen and there is no list, no pill and no header competing with it.
      //
      // `focus-work` was the set you are about to do, on ONE line, and 56 was the
      // largest size its worst line could take: `+120 kg × 12 reps` with its units
      // at `title` lands at 314 of the 328 dp a 360 dp phone has inside its
      // gutter. Those numbers are two lines now and their size is measured per
      // screen (`lib/focusType.ts`), which is what let them grow to the clock's
      // own 120. This step survives for the one thing left at a fixed 56: the
      // `Session complete` headline, which is words rather than a number.
      'focus-work': ['56px', { lineHeight: '60px', letterSpacing: '-1.6px' }],
      // `focus-clock` is the countdown. `PillClock` keeps 84 on the session
      // screen, where four controls share the row with it; this is the largest
      // step that still keeps `10:00` inside the same 328 dp at weight 600.
      'focus-clock': ['120px', { lineHeight: '118px', letterSpacing: '-4px' }],
      // `focus-count` is the get-ready count — one digit, nothing beside it, read
      // off the floor while you get into position under a bar. The pill's own
      // `count` variant is 104 for exactly that job; this is the same idea with a
      // whole screen instead of a pill.
      'focus-count': ['160px', { lineHeight: '150px', letterSpacing: '-6px' }],
      // The glass redesign's four FOCAL steps are not here either, and for the
      // same reason as its radii: `focalType` in `theme/tokens.ts` holds them as
      // numbers because a screen has to reason about them — the day dial sizes
      // itself against the ring it sits in, the keypad's amount against its own
      // width — and a className cannot be measured.
    },
    spacing: {
      0: '0px',
      // A separator drawn as a View rather than a border needs a height, and
      // `h-hairline` should mean the same 1px everywhere `border-hairline` does.
      hairline: '1px',
      xs: '4px',
      sm: '8px',
      md: '12px',
      lg: '16px',
      xl: '24px',
      xxl: '40px',
      // Momentum's block rhythm: card → section kicker is 22, kicker → list 10.
      kicker: '22px',
      'kicker-gap': '10px',
      hit: '44px', // minimum tap target
      bar: '46px', // a top-bar button
      // THE THREE FOCUS-MODE TARGETS. Sized for a thumb that is not aiming: the
      // phone is flat on a bench, the hand is coming from above, and the screen is
      // read from two metres. `focus-done` is the widest circle that leaves the
      // 16 dp gutter and still clears Android's swipe-up strip by 24 — 4× the area
      // of `hit` and the only control on the screen while it is there.
      'focus-done': '176px',
      // `Finish workout` takes DONE's slot and deliberately not its geometry: the
      // thumb finds it by position, the eye sees it has changed, and finishing is
      // the one commit in this app that is not one tap to undo.
      'focus-finish': '112px',
      // `Start` / `Stop` / `✕` on a timed set: the floor for a control that is
      // pressed mid-hold, and half of `focus-finish` so the two read as one family.
      'focus-action': '96px',
      row: '56px', // set rows, list rows
      'row-lg': '64px', // editor / library rows (two lines of text)
      timer: '132px', // the timer pill's minimum height — keep in sync with `size.timer`
      well: '96px', // numeric wells
    },
    extend: {
      borderWidth: {
        hairline: '1px',
      },
    },
  },
  plugins: [],
};
