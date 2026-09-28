# Handoff: Momentum v3 — Home, liquid navigation, themes, inner screens

Target repo: `semyonsw/workout_tracker` (Expo / React Native, NativeWind, Android-only, sideloaded APK).

## Overview
A major UI pass on the existing app:
- The app is renamed **Momentum**. The tagline stays "Train · tick · count".
- There is a new **Home** landing screen with 4 section tiles (Workout, Tasks, Finance, Settings). The Expenses section is renamed Finance.
- A new **icon nav bar**: two icons, a raised Home button, two icons. It is hidden on Home.
- **Three-colour gradient themes**: 8 presets plus custom. The default is **Fintech Lime**.
- Section-to-section transitions: a liquid shrink/grow between Home and its tiles, a slide between sections, and swipe paging that follows the finger. Pushed inner screens slide in with a parallax on the screen behind.
- **Floating scroll pills** (Workout / Tasks / Finance) that spring in once the section's top card has scrolled away.
- **Icon-only floating actions** (▶ / +). Bigger type. **46 dp top buttons**. An **AI button with its own animated colour gradient**.
- **Running text** everywhere a label overflows.
- Rhythm between blocks: 16–22 dp everywhere.
- A launch mark that morphs from workout to money to done.
- Glass bottom sheets. Android back behaviour.
- **Animations always on**: ignore Android's "Remove animations" setting.
- **Dark only.** There is no light theme; do not build one.

## About the Design Files
The `.dc.html` files are **design references built in HTML**. They are prototypes showing the intended look and behaviour, not production code. Recreate them in the repo's own environment: React Native, `Animated` / Reanimated, `expo-blur`, `expo-linear-gradient` and `react-native-svg`. Follow the house style in `CLAUDE.md`: decisions go in `src/lib/` as pure functions, and screens are composition.

## Fidelity
**High-fidelity.** Colours, sizes, radii, timings and easings below are final. All base tokens are the repo's own (`src/theme/tokens.ts`). Only the additions listed here are new.

---

## Design Tokens (new / changed)

### Theme (replaces the single green)
A theme is 3 colours `c1 → c2 → c3`, stored in `settingsStore` as `{ themeId, custom: [hex,hex,hex] }`. The following are derived from them:
- `acc` (accent text/icon on black) = `mix(c2 80%, white)` in OKLab. It replaces `greenBright` for text.
- `onAcc` (glyph/text on a gradient fill) = `#06120A` if relative luminance(c2) > 0.45, else `#FFFFFF`.
- Tints: `c2 @ 13%` lit card fill, `c2 @ 30%` lit border, `c2 @ 14–20%` chips/badges, `c2 @ 22–50%` glows.
- Gradient fill (floating actions, marks, thumbs): `linear-gradient(135deg, c1, c2 55%, c3)`.
- Theme preview / bars: `linear-gradient(90deg, c1 0%, c2 50%, c3 100%)`.
- Lamps: section radial lamps use c1 / c2 / c3 instead of green / greenBright.

| id | name | c1 | c2 | c3 |
|---|---|---|---|---|
| lime (**default**) | Fintech Lime | #C6F432 | #3DDC84 | #00A389 |
| emerald | Emerald (v1 green) | #1E7A4C | #3FA96C | #2BC4A4 |
| electric | Electric Violet | #1E72FF | #9624FF | #FF4FD8 |
| aqua | Aqua Tech | #00C2A8 | #0EA5E9 | #6366F1 |
| sunset | Sunset Pulse | #FF7A18 | #FF3D68 | #A62BFF |
| sapphire | Deep Sapphire | #1D4ED8 | #3B82F6 | #22D3EE |
| aurora | Aurora | #7CFF6B | #00E5FF | #8B5CF6 |
| ember | Ember | #F59E0B | #F97316 | #EF4444 |
| custom | Custom | user | user | user |

`danger` stays `#E0735F`. Page, ink and glass tiers are unchanged from `tokens.ts`.

### AI colours (fixed; never themed)
The conic ring is `#8B5CF6 → #EC4899 → #F59E0B → #22D3EE → #8B5CF6`. The inner fill is a radial from `#34245A` to `#130E22`. The glyph is `#FBCFE8`. Its subline text is a gradient `#C4B5FD → #F9A8D4 → #A5F3FC`. The "ready" dot is `#F472B6`.

### Type scale (≈ +1.5 px)
| token | old | new |
|---|---|---|
| micro / kicker | 11 / 14, ls 1.1 | **12.5 / 16**, ls 1.1 (section title 13, ls 1.4) |
| label | 13 / 18 | **14.5 / 20** |
| body | 16 / 22 | **17 / 23** |
| task name | 15 / 20 | **16.5 / 22** |
| hero name | 30 / 34 | **32 / 36**, ls −0.9 |
| day dial | 64 | **66** |
| balance | 52 / 54 | **54 / 56** |
| hero stat values | 20 | **22** |
| hero stat labels | 10 | **11.5** |

Font: Roboto (the system font). Numbers are tabular.

### Spacing rhythm
Between blocks in a section: hero → AI card is **16**. Card → section kicker is **22**, and kicker → list is **10**. The old 40 dp (`mt-xxl`) kicker gaps are gone. Rows in a list are 8 apart.

### Sizes
- Top-bar buttons: **46 dp** circles (were 36). Glyphs 23 (were 18). Gap 8.
- Floating action: **64 dp circle, icon only**, at `right 16, bottom 102`. It uses the gradient fill, a glow `0 0 44 c2@50%`, `e2`, and a 2 px specular.
  - Workout: ▶ (the repo `play` path, filled, 26 dp, offset +3 px right).
  - Tasks and Finance: + (`plus`, 28 dp, stroke 2.6).
  - Settings: ghost glass circle with `cloud_upload`.
- Nav bar: inset 12 / bottom 14, 70 tall, radius 30, `bar` glass (blur 34, sat 180%).
  - Item slots (centres in a 368 px bar): 44, 110 | 258, 324.
  - Icons 27 dp: Material Symbols Rounded `fitness_center`, `task_alt`, `account_balance_wallet`, `settings`. Inactive is FILL 0 / wght 450 in `#8A968F`; active is FILL 1 / wght 600 in `acc`, scaled 1.1.
  - The tab dot (4 → 18 wide) sits under the icon.
  - **Home button**: 66 dp circle, gradient, raised `top: −24`. It has a 6 px `#0B0F0E` ring, a glow `0 0 34 c2@55%` and a slow blob highlight inside.

### Radii
Home tiles 28. Sheets 34. Floating pills 9999. Everything else is from `tokens.radius`.

---

## Screens / Views

Reference file: `Momentum.dc.html` (phone frame 392 × 852). Every screen has `data-screen-label`.

### 1. Launch (`LaunchScreen.tsx`)
- Keep the existing structure: lamps, waves, progress ring, wordmark, chips.
- **The mark is an 86 dp gradient circle.** Inside, three glyphs cycle on a 2.7 s loop, offset 0 / 0.9 / 1.8 s: `fitness_center` → `payments` → `task_alt`.
- Each glyph: 0 % opacity 0, rotate −200°, scale .25 → 10 % in → 27 % hold → 35 % out (rotate +200°, scale .25). Easing `(.34,1.3,.64,1)`.
- The mark squeezes on the same 0.9 s beat: 72 % → 84 % scale .86 / −8° → 94 % 1.06 / 4° → 100 %. Easing `(.34,1.56,.64,1)`.
- A second ring spins 1.1 s linear (dash 110/330, gradient stroke) while the progress ring fills a third per store.
- Wordmark: "Momentum", letters rise 520 ms, staggered 28 ms.

### 2. Home (new)
- Header: kicker "MONDAY · 28 SEP" in acc. "Good afternoon" 34/38 −1 600. A 46 dp app icon on the right. The subline (15.5, muted) is computed, e.g. "6 of 8 tasks done · Pull is up next".
- 2 × 2 grid, gap 12. Tiles are 262 tall, radius 28, card glass plus a corner lamp.
- Each tile has a 54 dp gradient badge with its glyph, and a top-right extra:
  - Workout: `#92` pill.
  - Tasks: mini ring 46 dp with %.
  - Finance: "AMD".
  - Settings: three theme dots.
- Tile bottom: kicker (acc), name 23/28 600, running-text detail 14.5 muted.
- Tiles arrive with `tileIn` 620 ms, staggered 70 ms.
- No nav bar on Home.

### 3. Workout (`HomeScreen.tsx`)
- Same content as today. Changes:
  - Type scale.
  - 46 dp corner buttons, in the order AI, routines, library, history.
  - Gaps per the rhythm above.
  - Icon-only ▶ floating action.
- Routine and recent rows: every line uses RunningText.

### 4. Tasks (`TasksScreen.tsx`)
- Same content. The dial stroke is the theme gradient, and the dial halo alpha is `18 % + 28 % × fraction` of c2.
- The done mark is the gradient circle with a 340 ms pop.
- Floating action: +.

### 5. Finance (renamed from Expenses; `MoneyScreen.tsx`)
- Same content. The selected account chip uses the gradient fill.
- Tapping a category tile opens the **Amount keypad** on that category. The floating + opens it on Food.

### 6. Settings (`SettingsHomeScreen.tsx`)
- **Appearance** comes first:
  - Preview bar: 96 tall, radius 18, the 90° gradient with a sheen, the theme name and the CSS string in mono 11.5.
  - "Presets": a 2-column grid of cards. Each has a 36 tall gradient swatch, the name and a tag. The selected card has a 1.5 px `acc` border and a ✓.
  - "Custom" card: three 38 dp colour dots that open the system colour picker. Changing any dot selects Custom.
  - Footnote: "The three colours tint the buttons, the rings, the lit cards and the light behind every section. The AI button keeps its own colours so it always stands out."
- Then Sections (renamed "Finance settings"), AI, backup and reset.
- Reset opens the **Confirm sheet**.

### 7. Pushed screens (inner)
All share a header: a 46 dp back circle, a kicker (13 / ls 1.4, muted) and a subline (14.5 ink). A 3 px lit edge on the left hints at the back swipe. The nav bar hides while a pushed screen is open.

**Training history** (⟲ in Workout, or a Recent row):
- Lit card "Sets per cluster" with a segmented control `4w / 12w / All`: a 46 wide sliding gradient thumb, 360 ms `(.34,1.3,.64,1)`.
  - Bars are 10 tall with a gradient fill. They grow in (`scaleX`, 800 ms, staggered 70 ms) and change width on a range change (640 ms `(.34,1.2,.64,1)`, staggered 50 ms).
- Month kicker, then session cards that expand to show their exercises. The chevron rotates 180° in 320 ms.

**Live workout** (floating ▶, the pill's ▶, or a routine row):
- Header subline: "3 of 25 sets · 12:21", ticking.
- **Rest card** (lit):
  - "BETWEEN SETS" / "Next: set 4".
  - Clock 68/70 −2.5, tabular. Its glow grows under 10 s, and it breathes at 1 s.
  - 6 px gradient progress bar that drains linearly.
  - Controls: `+15 s`, pause/play, `Skip`.
- **Exercise card**:
  - Name 19/24 600, the plan line, and an overload nudge in acc with `trending-up`.
  - Set rows. The **primed** set row has a lit fill, glow and 30 dp numerals. The other rows use 21 dp numerals.
  - Mark 46–50 dp: gradient ✓ when done; acc ring when primed.
  - Logging a set restarts rest at 2:00 and vibrates.
  - "+ Add set" / "− Remove set".
- Collapsed cards for the other exercises, then a dashed "+ Add an exercise".
- Floating pair at bottom 28: ghost `Finish` (52 tall) and filled `Focus` (64 tall).

**Amount keypad** (`AmountEditorScreen.tsx`):
- "AMOUNT · AMD". The amount is 62/66 −2.4, faint at 0, glowing once typed. A caret blinks at 1 s.
- Category chips: the selected one is lit and glowing.
- Account chip, an Expense|Income segmented control (80 wide sliding thumb), and a date chip.
- ✓ Save pill at `right 16, bottom 318`. It is asleep at 50 % / scale .94 until a digit exists, then wakes with a 420 ms spring.
- 3 × 4 keypad, 62 tall, radius 20, card glass. Keys rise in, staggered 22 ms. Keys: `000`, `0`, backspace.

**Task detail** (tap a task row):
- Name 30/35, then "Every day · since 4 January 2026".
- Two stat cards: STREAK (lit, with a flame) and THIS MONTH.
- Month nav, weekday row, then a 7-column grid of day cells (aspect 1, radius 11):
  - done: c2 @ 75 %
  - on purpose: dashed
  - not answered: ink @ 5 %
  - today: 2 px acc ring plus glow
  - future: faint
- Cells pop in, staggered 14 ms. Legend below.
- "Archive this task" in danger. Ghost floating `Edit task`.

### 8. Floating scroll pills (`FloatingBubble.tsx` + the three sections)
- Shown when a section's scroll passes its threshold: Workout 300, Tasks 250, Finance 240.
- Position: top 104, centred, width 338 / 300 / 326.
- Glass `rgba(23,28,26,.72)`, blur 30, saturate 180 %. Border ink @ 10 %. Glow `0 0 30 c2@26%`, shadow `0 16 40 rgba(0,0,0,.6)`. A 1 px specular line and a 4.5 s sheen.
- **In**: from translateY(−28) scale(.82) blur(6), 560 ms `(.34,1.5,.64,1)`.
- **Out**: 320 ms `(.4,0,.6,1)`.
- While the pill is up, the hero recedes to scale .95 / opacity .45 / blur 2 (420 ms).
- Contents:
  - **Workout**: a `#92` badge (50 dp), "UP NEXT · WORKOUT", the running name, "8 exercises · 25 sets", and a gradient ▶ (50 dp). The ▶ opens the Live workout; tapping anything else scrolls to the top.
  - **Tasks**: a mini ring (52 dp) with the day number, "TODAY · MON", "28 September", "6 of 8 done", and a % pill. The pill's glow scales with the fraction, and it fills solid at 100 %.
  - **Finance**: one half per account (glyph, name kicker, balance 18). The selected half is lit. Tapping a half switches account.

### 9. Sheets (`Sheet.tsx`, `ConfirmSheet.tsx`, `TaskEditorSheet.tsx`)
- Backdrop `rgba(6,8,7,.55)` plus blur 10, fading in over 360 ms.
- Sheet: inset 8, radius 34, glass `rgba(20,26,24,.86)`, blur 34, saturate 170 %, top glow `c2@14%`.
- **In**: translateY(110 %) → 0, 600 ms `(.32,1.28,.5,1)`. **Out**: 340 ms `(.4,0,.8,.4)`.
- Drag the 44 × 5 handle down more than 110 px to dismiss. Otherwise it springs back (460 ms).
- **New task** sheet:
  - Name field: 56 tall, radius 18, c2 border with a 4 px glow ring.
  - "Repeats" segmented control: Every day / Weekdays / Pick days / Once, with a sliding lit thumb.
  - "Remind me" row with a switch.
  - `✓ Save task`: 58 tall, gradient. Asleep at 50 % until a name exists.
- **Confirm reset**: title, body, then `Keep mine` (ghost) and `Reset settings` (danger fill).

---

## Interactions & Behavior

### Navigation model
```
Home ──tap tile──▶ Section ──push──▶ Inner screen
  ▲                  │  ▲                │
  └──Home btn / back─┘  └──back / edge───┘
Section ◀─swipe / tap nav─▶ Section
```
- **Default landing is Home.**
- **Android back** (use `BackHandler`):
  - sheet open → close it
  - pushed screen → pop
  - section → Home
  - Home → toast "Press back again to exit"; a second press within 2 s exits.
- **Edge swipe back** on a pushed screen: start within 44 dp of the left edge. The screen follows the finger and the section behind un-parallaxes proportionally. Commit if dx > 120 or velocity > 0.6 px/ms; otherwise spring back (440 ms `(.34,1.3,.64,1)`).
- **Swipe between sections** (extend `SwipePager`): the horizontal lock is |dx| > 10 and |dx| > 1.3·|dy|.
  - The current screen follows at 0.55 × dx, scales `1 − |d|/2800` and blurs up to 3.
  - The nav blob interpolates toward the neighbour slot and **stretches** (half-width 30 + 16·sin(πp)).
  - First and last sections rubber-band at 0.22×.
  - Commit if |dx| > 90 or velocity > 0.5, then run the slide transition. Otherwise spring back (460 ms).

### Transitions (D = 640 ms; ease `(.22,1,.36,1)`)
- **Home → Section**: the incoming screen's **clip rect expands from the tapped tile** (radius 28) to full screen (radius 48). The clip easing is `(.3,1.08,.35,1)`. The incoming screen also goes from opacity .5 and blur 6 / saturate 1.5 to normal. Home scales to .88, blurs 12 and fades out. Section content rises 34 dp over D+180 (delay 90).
  - In RN: animate a Reanimated view's `left/top/width/height/borderRadius` from the tile's measured layout, or use a `MaskedView`.
- **Section → Home**: the reverse. The section clips down into its own tile while fading. Home comes in from scale 1.07 and blur 10.
- **Section → Section**: incoming from translateX(±55 %), scale .94, blur 8. Outgoing to translateX(∓32 %), scale .9, fade out.
- **Nav bar**: slides up with `(.34,1.45,.64,1)` over 620 ms, delay 160, when entering a section. It drops away over 380 ms when going Home or when a screen is pushed.
- **Nav blob between tabs**: the leading edge moves in 360 ms and the trailing edge in 560 ms (delay 60), both on `(.34,1.3,.64,1)`, which gives a liquid stretch.
- **Push**: in from translateX(100 %) over 560 ms (ease); out with `(.4,0,.6,1)`. The section behind goes to translateX(−26 %), scale .94, opacity .35, blur 3.
- **Press (haptic)**: every tappable element sinks to .94 in 130 ms. On release it goes .94 → 1.035 → 1 over 460 ms. A radial ripple expands from the touch point over 620 ms.
  - Use `expo-haptics`: Light on taps, Medium on task tick and set log, Success on save and day closed.
- **Running text**: keep `lib/marquee.ts` as is. Apply RunningText to **every** one-line label that can overflow: names, details, kickers, chips, toasts and pill texts.

### Always-on motion
`src/hooks/useMotionScale.ts`: make `useMotionScale()` and `getMotionScale()` return `1` unconditionally, and remove the `AccessibilityInfo` subscription. The two loops that checked for 0 (marquee, breathing lamps) then always run.

### Toasts
Keep the existing `Toast`, glowing with c2 @ 30 %. It sits at bottom 190 in sections and above the floating actions.

## State Management (additions)
- `settingsStore`: `themeId`, `customColors[3]`. Persist both. Derived colours are computed in `lib/theme.ts` (pure, testable).
- `AppShell`:
  - `route: 'home' | Section` with `lastTileLayout` per section, for the clip transition.
  - Push stack.
  - `exitArmedAt` for the double-back exit.
- Per section: `bubbleUp` (already exists via `useBubbleOnScroll`) and `heroRecede` (exists).

## Performance (Android)
Sideloading an APK changes nothing about GPU cost: blur runs on the phone every frame.
- Keep the repo's budget of at most 3 `BlurView`s per screen: the top bar, the nav bar and whichever floating pill or sheet is up. Every card stays `flat`.
- Put transitions, swipe paging, the clip expand, sheet drag and the nav blob on **Reanimated** (installed) on the UI thread. Keep `Animated` for the small existing loops.
- The launch morph and the AI ring are transform-only loops, which suits the native driver.

## Assets
- **App icon**: `icon/`. It is exported in Fintech Lime. See `icon/README.md`.
  - Expo: `assets/icon.png` (1024) and `assets/adaptive-icon.png` (1024 foreground). Background `#060807`.
  - Also mipmaps for every density, round variants, adaptive XML and `play-store-512.png`.
  - In `app.json`, set `"name": "Momentum"`.
- **Icons**: the existing `Icon.tsx` paths plus Material Symbols Rounded, installed via `@expo/vector-icons` (`MaterialSymbols`) or as a bundled font. Glyphs: `fitness_center`, `task_alt`, `account_balance_wallet`, `settings`, `home`, `payments`, `palette`, `cloud_upload`, `notifications`, `backspace`, `center_focus_strong`, `pause`, `play_arrow`.
- Emoji glyphs for categories and accounts stay user data.

## Files
- `Momentum.dc.html`: the full interactive prototype (v3). Open it in a browser. Try:
  - Esc as Android back.
  - Dragging a section sideways.
  - Dragging from the left edge of a pushed screen.
- `Workout Tracker v2.dc.html`: the previous iteration (no inner screens or sheets).
- `Momentum Icon.dc.html`: the icon source.
- `icon/`: exported PNGs.

## Suggested build order
1. `lib/theme.ts` and the settings fields, then swap `green*` usages to theme tokens.
2. Home screen and the new nav bar, with the back handler.
3. Transitions: clip expand, slide, push, and swipe paging with the stretching blob.
4. Floating scroll pills.
5. Type-scale bump, 46 dp top buttons, AI button and icon-only floating actions.
6. Sheets and inner screens restyled as specified.
7. Launch morph, icon and rename.
8. `useMotionScale` → always 1.

Bump the version and build the APK per `CLAUDE.md`.
