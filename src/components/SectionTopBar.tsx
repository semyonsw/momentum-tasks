/**
 * SectionTopBar — the strip at the top of a section root.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ WORKOUT                        (✦)  📖   ⟲   │
 *   │ DAILY TASKS                        (✦)   ⟲   │
 *   │ SETTINGS                            РУ  EN   │
 *   └──────────────────────────────────────────────┘
 *
 * ── WHY THE HISTORY GLYPH IS UP HERE ───────────────────────────────────────
 *
 * Every section used to keep its own past at the BOTTOM of the screen it was
 * looking at: the tasks' month grid and trend under the day's rows, the money's
 * charts under the category tiles. So "how has this been going" was a scroll
 * through everything you already know before you reach the part you came for,
 * and it got longer every time the top of the screen grew. One tap in a corner
 * that never moves is the same distance from every section, and the past gets a
 * screen of its own rather than a tail.
 *
 * ── AND WHY IT IS NOW A ROW OF THEM ────────────────────────────────────────
 *
 * The workout section's other two destinations — the routines and the exercise
 * library — lived at the FOOT of its scroll, under the routines they are about.
 * That was the right call when the alternative was a tab of their own, and it is
 * the wrong one against this corner: they are the same kind of thing as the ⟲.
 * All three are "somewhere else in this section", none of them is content, and
 * two of the three were a scroll away while the third was a tap.
 *
 * (They were two glyphs, ≡ and 📖, until U23 merged them into one
 * `Routines & exercises` door — two unlabelled marks that look alike are worse
 * than one; `lib/discoverability.ts`.)
 *
 * So the corner takes a LIST of actions, laid out left to right in the order
 * they are declared, then the ⟲ — all at the same 46 dp (v3; they were 36). Same size is not a detail — it is
 * what makes them read as one row of destinations rather than one button and two
 * things beside it. The ⟲ stays rightmost, under the thumb, because it is the
 * one every section has.
 *
 * ── EVERY CIRCLE SAYS WHERE IT GOES (2.9, redesign #9) ─────────────────────
 *
 * Each 46 dp circle carries a 12.5 px muted caption under it — `AI coach`,
 * `Routines`, `History`. The corner was icons-only on the argument that a row of
 * same-size glyphs reads as a row of destinations; it does, but it does not say
 * WHICH, and an icon nobody can name is an icon nobody taps. The caption is the
 * action's `caption` (and the ⟲'s `historyCaption`, `History` unless a section
 * says otherwise); the spoken `label` stays the longer, fuller name. The row grew
 * from 60 to 66 to hold the line, still inside the 76 the scrolls already clear
 * (`barInset.top`). Rejected: captions only on first use (a label that goes away
 * is a label you never learned) and putting the words BESIDE the glyphs (three of
 * them would not fit a 360 dp corner beside the section's name).
 *
 * ── THE CORNER HOLDS DESTINATIONS ONLY ─────────────────────────────────────
 *
 * Placement rule 1, and this component is where it is enforced: an action takes
 * an ICON and a caption NAMING ITS DESTINATION, and nothing else, so there is no
 * button-shaped way to put a word like `Save` up here. Every commit action in the app lives in the floating slot
 * (`components/glass.tsx`) instead — `right: 16, bottom: 92`, which on an 800 dp
 * phone is about 620 dp of diagonal closer to a right thumb than this corner.
 *
 * ── THE ONE THAT IS NOT A GLYPH ────────────────────────────────────────────
 *
 * Settings' corner holds `РУ` and `EN`, and they are letters rather than a flag
 * for the obvious reason — a flag names a country and this names a language —
 * and rather than a word ("Русский") because the corner is 38 dp tall and the
 * point of a language switch is that it is legible to somebody who cannot read
 * the language currently on screen. Two letters in their own script are.
 *
 * ── IT IS A PANE NOW, AND THE CONTENT RUNS UNDER IT ────────────────────────
 *
 * Absolutely positioned, at the `bar` tier, with each section's scroll paying
 * `barInset.top` in padding rather than the bar claiming the space in the flow.
 * Together with the detached nav pill (`components/NavBar.tsx`) that is the
 * load-bearing half of the redesign: a list that visibly passes behind glass is
 * the only thing that tells the eye a bar is a LAYER and not a strip of chrome.
 *
 * ── THE ONE BUTTON THAT IS NOT GHOST GLASS ────────────────────────────────
 *
 * The assistant's action is drawn as `AiOrb` — its own spinning conic ring and
 * breathing sparkle, in fixed colours that no theme uses — instead of a ghost
 * circle. It is the one destination in the corner that is a conversation rather
 * than a place, and on eight themes it has to be findable on every one. An
 * action is the assistant's when it says `ai: true`, or, for the callers written
 * before that flag, when its glyph is the `sparkle` — nothing else uses it.
 *
 * ── WHY NOT `ScreenHeader` ─────────────────────────────────────────────────
 *
 * That one is for a screen you are INSIDE: it leads with back, and its kicker
 * reads as a place you can leave. A section root is somewhere you already are —
 * nothing to go back to, and the tab bar says where you are as well. So this is
 * the same type scale and the same safe-area handling with the two halves
 * swapped: no back, and a row of actions.
 */

import type { ReactNode } from 'react';
import { Animated, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiOrb } from './AiOrb';
import { Icon, type IconName } from './Icon';
import { BubblePressable } from './bubbles';
import { GlassBar, SpecularEdge } from './glass';
import { usePressScale } from './motion';
import { SlidingThumb } from './SlidingThumb';
import { useT } from '../hooks/useT';
import { ai, glass, palette, radius, tint } from '../theme/tokens';

/** The v3 top buttons: 46 dp circles, 23 dp glyphs, 8 apart. */
const BUTTON = 46;
const GLYPH = 23;
const GAP = 8;
/** The row: a circle, 3 of air and a 16 dp caption line. */
const ROW = 66;
/** The prototype's ghost glyph — between `ink` and `inkMuted`, so an idle row reads as live. */
const GHOST_GLYPH = '#AEB9B3';

export interface TopBarAction {
  /** Stable across renders, so a row of three does not re-key on every tick. */
  key: string;
  icon: IconName;
  /** Spoken — the full name ("Open the AI coach"). */
  label: string;
  /**
   * The micro caption under the circle (redesign #9): the destination in a word
   * or two — `AI coach`, `Routines`, `Accounts`. Absent, the circle stands alone.
   */
  caption?: string;
  onPress: () => void;
  /** Lit, for an action that is currently the answer — the language in force. */
  active?: boolean;
  /**
   * The whole circle lit, not just its glyph: the assistant's sparkle once a key
   * has passed its test. A green glyph alone says "selected"; a lit circle says
   * "this is switched on and waiting", which is what a connected assistant is.
   */
  lit?: boolean;
  /**
   * Drawn as the assistant's `AiOrb` rather than a ghost circle. Defaults to
   * `icon === 'sparkle'` — see the file header.
   */
  ai?: boolean;
}

interface SectionTopBarProps {
  /** The section's own name: 13 / ls 1.4 / 600, uppercase, ink-muted. */
  title: string;
  /** Second line, for a count or a total the section wants in the corner. */
  subtitle?: string;
  /**
   * The ⟲ on the right. Absent on a section that has no past to show.
   *
   * Kept as its own prop rather than folded into `actions` because every section
   * has one and it is always last: a section that had to remember to put it at
   * the end of an array is a section that can put it in the middle.
   */
  onOpenHistory?: () => void;
  /** What the glyph opens, spoken. "Training history", "Task history". */
  historyLabel?: string;
  /** The ⟲'s caption. `History` unless a section has a better word. */
  historyCaption?: string;
  /** Everything to the LEFT of the ⟲, in declared order. */
  actions?: readonly TopBarAction[];
  /** Anything the corner cannot be — Settings' two letters. */
  trailing?: ReactNode;
}

export function SectionTopBar({
  title,
  subtitle,
  onOpenHistory,
  historyLabel = 'History',
  historyCaption,
  actions = [],
  trailing,
}: SectionTopBarProps) {
  const insets = useSafeAreaInsets();
  const t = useT();

  return (
    <View
      // `zIndex` rather than order in the tree: the bar is declared BEFORE the
      // scroll in every screen that has one, because that is the reading order
      // of the file, and without this the list would paint straight over it.
      style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}
    >
      <GlassBar>
        {/* The prototype's `padding: 34px 12px 8px 16px` around a 60 tall row,
            with its 34 of status bar being the real inset here. */}
        <View
          style={{ paddingTop: insets.top, paddingRight: 12, paddingBottom: 6, paddingLeft: 16 }}
        >
          <View style={{ height: ROW, flexDirection: 'row', alignItems: 'center', gap: GAP }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={{
                  fontSize: 13,
                  lineHeight: 16,
                  letterSpacing: 1.4,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  color: palette.inkMuted,
                }}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text className="mt-xs text-label font-medium tabular-nums text-ink-muted">
                  {subtitle}
                </Text>
              ) : null}
            </View>

            {trailing}

            {actions.map((action) => (
              <Captioned key={action.key} caption={action.caption}>
                {(action.ai ?? action.icon === 'sparkle') ? (
                  <AiButton action={action} />
                ) : (
                  <TopBarButton action={action} />
                )}
              </Captioned>
            ))}

            {onOpenHistory ? (
              <Captioned caption={historyCaption ?? t('History')}>
                <TopBarButton
                  action={{
                    key: 'history',
                    icon: 'history',
                    label: historyLabel,
                    onPress: onOpenHistory,
                  }}
                />
              </Captioned>
            ) : null}
          </View>
        </View>
      </GlassBar>
    </View>
  );
}

/**
 * A circle and its caption, stacked. The caption is NOT inside the pressable —
 * the circle is the 46 dp target and the caption names it — and it is hidden
 * from the screen reader, which already hears the circle's fuller `label`.
 */
function Captioned({ caption, children }: { caption?: string; children: ReactNode }) {
  if (!caption) return <>{children}</>;
  return (
    <View style={{ alignItems: 'center', minWidth: BUTTON }}>
      {children}
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={{ marginTop: 3, fontSize: 12.5, lineHeight: 16, fontWeight: '600' }}
        className="text-ink-muted"
      >
        {caption}
      </Text>
    </View>
  );
}

/**
 * One 46 dp circle. The size is fixed here rather than passed, because the whole
 * argument for the row is that they are the same size — see the file header.
 */
function TopBarButton({ action }: { action: TopBarAction }) {
  const press = usePressScale(0.94);
  return (
    <BubblePressable
      onPress={action.onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={4}
      radius="pill"
      accessibilityRole="button"
      accessibilityState={{ selected: action.active }}
      accessibilityLabel={action.label}
      style={{ height: BUTTON, width: BUTTON, borderRadius: radius.pill }}
    >
      <Animated.View
        style={[
          {
            height: BUTTON,
            width: BUTTON,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.pill,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: action.lit ? glass.greenEdge : 'rgba(236,241,238,0.07)',
            backgroundColor: action.lit ? tint(0.16) : 'rgba(236,241,238,0.055)',
          },
          press.style,
        ]}
      >
        {/* No `BlurView` inside these. Three of them sit on a bar that is already
            the heaviest blur in the app; blurring a small circle against a
            surface that is itself blurred buys nothing the tint does not, and it
            would be more native layers on the one bar that is always on screen. */}
        <SpecularEdge
          color={action.lit ? 'rgba(236,241,238,0.12)' : 'rgba(236,241,238,0.10)'}
          radius={radius.pill}
        />
        <Icon
          name={action.icon}
          size={GLYPH}
          color={action.active || action.lit ? palette.acc : GHOST_GLYPH}
        />
      </Animated.View>
    </BubblePressable>
  );
}

/**
 * The assistant's button: the same 46 dp and the same press, drawn as the
 * `AiOrb` with its sheen and stars. `lit` is not shown — the orb is always
 * alive, whether a key is connected or not, because the card under the hero is
 * where "not connected yet" is said in words.
 */
function AiButton({ action }: { action: TopBarAction }) {
  const press = usePressScale(0.94);
  return (
    <BubblePressable
      onPress={action.onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={4}
      radius="pill"
      bubbleColor={ai.glyph}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      // Not clipped: the stars sit a few dp outside the circle.
      style={{ height: BUTTON, width: BUTTON }}
    >
      <Animated.View style={press.style}>
        <AiOrb size={BUTTON} glyph={22} stars />
      </Animated.View>
    </BubblePressable>
  );
}

/**
 * The language switch: two letters, the one in force lit.
 *
 * A pair of buttons rather than a `Segmented`, because it has to fit in the same
 * band as the glyph row beside it. It is still the same idea — one of two, the
 * selected one on the theme's fill — so it reads as the app's vocabulary rather
 * than as a new control.
 *
 * The fill is ONE 46 wide gradient thumb (c1 → c2, glowing at c2 30 %) that
 * SLIDES between the letters (300 ms, `bezier(.34,1.3,.64,1)`) rather than each
 * letter lighting its own background: the change of language is a change of
 * position, and the pane says where it went. The letter on it is `onAcc`, since
 * ink on a light theme's gradient would disappear.
 */
export function LanguageToggle({
  options,
  active,
  onSelect,
}: {
  options: readonly { value: string; label: string; name: string }[];
  active: string;
  onSelect: (value: string) => void;
}) {
  const t = useT();
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === active),
  );
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('Application language')}
      style={{
        height: 38,
        padding: 3,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radius.pill,
        borderWidth: 1,
        backgroundColor: 'rgba(236,241,238,0.04)',
        borderColor: 'rgba(236,241,238,0.07)',
      }}
    >
      <SlidingThumb
        index={index}
        count={options.length}
        trackWidth={options.length * SEGMENT + 6}
        inset={3}
        duration={300}
        bezier={[0.34, 1.3, 0.64, 1]}
        style={{
          borderRadius: radius.pill,
        }}
      >
        <LinearGradient
          colors={[palette.c1, palette.c2]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: radius.pill,
          }}
        />
      </SlidingThumb>
      {options.map((option) => {
        const selected = option.value === active;
        return (
          <BubblePressable
            key={option.value}
            onPress={() => onSelect(option.value)}
            radius="pill"
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.name}
            style={{
              height: 30,
              width: SEGMENT,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.pill,
            }}
          >
            <Text
              maxFontSizeMultiplier={1.3}
              style={{
                fontSize: 14.5,
                lineHeight: 20,
                fontWeight: '600',
                color: selected ? palette.onAcc : palette.inkFaint,
              }}
            >
              {option.label}
            </Text>
          </BubblePressable>
        );
      })}
    </View>
  );
}

/** One letter's cell, and the width the thumb covers. */
const SEGMENT = 46;
