/**
 * The shared vocabulary every screen outside the session is assembled from.
 *
 *   Kicker      an uppercase Micro section label
 *   ListCard    a `surface` card that clips its children's hairlines
 *   GlassCard   the same card as translucent ink over the page
 *   StatTile    a 96-high fact: kicker, one number, what it is out of
 *   DashedAdd   a dashed slot that adds one of whatever the list holds
 *   Separator   a 1px rule, inset past whatever column it must clear
 *   SettingRow  56 high: label left, value right
 *   SwitchRow   label, optional hint, and the app's one switch
 *   FieldWell   a 56-high text field with a green caret
 *   NumericWell a 96-high labelled number
 *   Segmented   a 52-high track of equal segments under one sliding lit pane
 *   SelectChip  a 36-high pill that is on or off, for sets of options
 *   Toggle      52 × 32, the only switch in the app
 *   PrimaryButton — 56 high, full width: gradient, ghost, or danger
 *
 * These exist so a new screen is a composition rather than a new set of
 * spacing decisions. Every value here is from the design; none of them are
 * parameterised beyond what the design actually varies.
 *
 * ── EVERY TAPPABLE THING HERE IS A `BubblePressable` ──────────────────────
 *
 * Which is what makes the app's press feedback one decision rather than forty.
 * A ring opens from the point of contact and leaves; `pressedStyle` still does
 * the dim-and-shrink underneath, because the two say different things — one is
 * "under your finger now", the other is "that landed". `components/bubbles.tsx`
 * has the whole argument and the reason it costs nothing at rest.
 *
 * The `radius` each one passes is its own corner, so a ring cannot escape a pill
 * button with square corners. That is the one thing to remember when adding a
 * control here.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable } from './Pressable';
import { useRevealOnFocus } from './KeyboardAware';

import { useT } from '../hooks/useT';
import { tap } from '../lib/feedback';
import { segmentFontSize } from '../lib/stepperFont';
import { TOUCH_MIN_WORKOUT, slopInsets } from '../lib/hitTarget';
import { useMotionScale } from '../hooks/useMotionScale';
import {
  curve,
  danger,
  dangerTint,
  glass,
  gradientFill,
  motion,
  palette,
  tint,
} from '../theme/tokens';
import { BubblePressable } from './bubbles';
import { Icon } from './Icon';
import { pressedStyle } from './motion';
import { FADE_ON, RunningText } from './RunningText';
import { SlidingThumb } from './SlidingThumb';

/* ------------------------------------------------------------------ */
/* Structure                                                           */
/* ------------------------------------------------------------------ */

/**
 * Section label. Uppercase, wide-tracked, faint.
 *
 * `green` marks a section whose contents just changed under the user (the set
 * inputs a toggle added). `dim` is for a label on a target rather than on
 * content — the "DROP HERE" in a reorder gap.
 */
export function Kicker({
  children,
  tone = 'faint',
  className = '',
}: {
  children: ReactNode;
  tone?: 'faint' | 'green' | 'dim';
  className?: string;
}) {
  // v3 drew the kicker in #6B766F, one step above the old `ink-faint` (#57615C),
  // which was below what reads over the lamps at 12.5 dp. U3 raised `ink-faint`
  // past both (#7D8882, 5.5:1), so the kicker is the token again. Margins stay
  // the caller's — the section rhythm is `mt-kicker mb-kicker-gap` (22 / 10).
  const toneClass =
    tone === 'green' ? 'text-acc' : tone === 'dim' ? 'text-green-dim' : 'text-ink-faint';
  return (
    <Text
      className={['text-micro font-semibold uppercase tabular-nums', toneClass, className].join(
        ' ',
      )}
    >
      {children}
    </Text>
  );
}

/**
 * A card of rows. `overflow-hidden` is load-bearing: it is what lets a row's
 * own background and its hairlines stop cleanly at the 14px corner.
 */
export function ListCard({
  children,
  className = '',
  clip = true,
}: {
  children: ReactNode;
  className?: string;
  /**
   * Clip children to the card's rounded box. On by default, and off for exactly one
   * reason: a row lifted out of the list for reordering is translated past the
   * card's own edges, and a clipped card cuts it in half on the way. Nothing else
   * here overflows, so turning it off costs nothing while a drag is in flight.
   */
  clip?: boolean;
}) {
  return (
    <View
      className={[
        clip ? 'overflow-hidden' : 'overflow-visible',
        'rounded-surface border border-hairline bg-surface',
        className,
      ].join(' ')}
    >
      {children}
    </View>
  );
}

/**
 * A raised GLASS surface: a few percent of ink over the page, held by the same
 * hairline every other edge in the app is drawn with.
 *
 * `ListCard` is the opaque one and still owns the training section. This is what
 * the redesigned sections are built from, and the difference is not decoration:
 * both tasks and expenses carry a green glow behind their content, and an opaque
 * card sitting on one punches a black hole in it. Glass lets the glow through.
 *
 * `tone` is which of the three steps in `glass` it is — `raised` for a card,
 * `sunken` for a well inside one, `green` for a surface that is currently the
 * answer (the day's balance, a done task). `radius` is the card's own corner,
 * which is also what a `BubblePressable` inside it has to clip its ring to.
 */
export function GlassCard({
  children,
  tone = 'raised',
  radius = 'surface',
  className = '',
}: {
  children: ReactNode;
  tone?: 'raised' | 'sunken' | 'green';
  radius?: 'surface' | 'card' | 'sheet';
  className?: string;
}) {
  const green = tone === 'green';
  return (
    <View
      style={{
        backgroundColor: green ? glass.green : tone === 'sunken' ? glass.sunken : glass.raised,
        borderColor: green
          ? glass.greenEdge
          : tone === 'raised'
            ? glass.raisedEdge
            : palette.hairline,
      }}
      className={[
        'overflow-hidden border',
        radius === 'sheet'
          ? 'rounded-sheet'
          : radius === 'card'
            ? 'rounded-card'
            : 'rounded-surface',
        className,
      ].join(' ')}
    >
      {children}
    </View>
  );
}

/**
 * A 96-high fact: a kicker pinned to the top, one number pinned to the bottom,
 * and the unit it is out of beside it.
 *
 * Two of these side by side are how every section states its summary — done and
 * full days, streak and this month. `green` marks the one that is the ANSWER
 * rather than the context: a streak is the fact the task detail screen is about,
 * and the month beside it is what makes the streak mean something.
 *
 * It is `NumericWell`'s geometry with a second line and no affordance. The wells
 * are inputs; these are never tappable, which is why they do not share a
 * component — a well that can be pressed and one that cannot look identical, and
 * that was already one bug.
 */
export function StatTile({
  label,
  value,
  unit,
  tone = 'plain',
}: {
  label: string;
  value: string;
  /** What the value is out of — "of 112", "days". */
  unit?: string;
  tone?: 'plain' | 'green';
}) {
  const green = tone === 'green';
  return (
    <GlassCard tone={green ? 'green' : 'raised'} className="h-well flex-1 justify-between p-lg">
      <Kicker tone={green ? 'green' : 'faint'}>{label}</Kicker>
      <View className="flex-row items-baseline">
        <Text
          className={[
            'text-title-lg font-semibold tabular-nums',
            green ? 'text-green-bright' : 'text-ink',
          ].join(' ')}
        >
          {value}
        </Text>
        {unit ? <Text className="ml-xs text-label text-ink-muted">{unit}</Text> : null}
      </View>
    </GlassCard>
  );
}

/**
 * A 1px rule. `inset` is how far past the left edge it starts — 16 to clear the
 * gutter, 40 to clear a drag handle, 0 to full-bleed under a footer row.
 */
export function Separator({ inset = 16 }: { inset?: 0 | 16 | 40 }) {
  const insetClass = inset === 40 ? 'ml-[40px]' : inset === 16 ? 'ml-lg' : '';
  return <View className={`h-hairline bg-hairline ${insetClass}`} />;
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

/** 56 high: label left in ink, value right in ink-muted. A fact, or a link to one. */
export function SettingRow({
  label,
  value,
  valueTone = 'muted',
  onPress,
}: {
  label: string;
  value?: string;
  /** `faint` states a value the user cannot change and shouldn't chase. */
  valueTone?: 'muted' | 'faint';
  onPress?: () => void;
}) {
  const body =
    (
      /*
       * `min-h` rather than a fixed 56, and both halves clamped.
       *
       * `Back up automatically` against `Every 7 days · Downloads` is the worst
       * case and it used to break the label mid-word and then clip it: the label
       * had `flex-1` and the value had nothing, so a long value took whatever it
       * wanted and the label wrapped into a box that could not grow. The value is
       * the one that should give way — it is a fact, and the label is what the
       * row IS — so it ellipsises at half the row and the row grows if the label
       * still needs two lines.
       */
      <View className="min-h-[56px] flex-row items-center px-lg py-sm">
        <Text numberOfLines={2} className="flex-1 pr-md text-body font-medium text-ink">
          {label}
        </Text>
        {value ? (
          /* The value RUNS inside its half of the row rather than ellipsising:
             `Every 7 days · Downloads/Backups` is two facts, and the second one is
             the half that gets cut. */
          <RunningText
            text={value}
            fadeColor={FADE_ON.card}
            containerStyle={{ maxWidth: '52%' }}
            className={[
              'text-body font-medium tabular-nums',
              valueTone === 'faint' ? 'text-ink-faint' : 'text-ink-muted',
            ].join(' ')}
          />
        ) : null}
      </View>
    );

  if (!onPress) return body;
  return (
    <BubblePressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={pressedStyle}
    >
      {body}
    </BubblePressable>
  );
}

/** Label, optional hint, and the app's one switch. */
export function SwitchRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View className="min-h-[56px] flex-row items-center px-lg py-md">
      <View className="flex-1 pr-md">
        <Text className="text-body font-medium text-ink">{label}</Text>
        {hint ? <Text className="mt-[2px] text-label text-ink-faint">{hint}</Text> : null}
      </View>
      <Toggle
        value={value}
        onChange={(next) => {
          tap();
          onChange(next);
        }}
        accessibilityLabel={label}
      />
    </View>
  );
}

/**
 * A number with a `−` and a `+`.
 *
 * The value sits between the label and the chips rather than next to them, so a
 * column of these rows has its numbers in one vertical line — you can see what
 * every duration is set to without reading a single label twice.
 */
export function StepperRow({
  label,
  hint,
  value,
  onDecrease,
  onIncrease,
}: {
  label: string;
  hint?: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  const t = useT();
  return (
    <View className="min-h-[56px] flex-row items-center py-md pl-lg pr-sm">
      <View className="flex-1 pr-md">
        <Text className="text-body font-medium text-ink">{label}</Text>
        {hint ? <Text className="mt-[2px] text-label text-ink-faint">{hint}</Text> : null}
      </View>

      <Text className="mr-sm text-body font-semibold tabular-nums text-ink-muted">{value}</Text>

      <StepButton icon="minus" label={t('Decrease {label}', { label })} onPress={onDecrease} />
      <View className="w-xs" />
      <StepButton icon="plus" label={t('Increase {label}', { label })} onPress={onIncrease} />
    </View>
  );
}

/**
 * The `−` and the `+` of a `StepperRow`, and nothing else in the app draws one.
 *
 * Not exported: a 36 dp circle with a glyph in it is a shape three other
 * controls could plausibly want, and every one of them would want it at a
 * different size. It stays the stepper's own part until a second caller exists.
 *
 * Its slop reaches 48 (U28; History's steppers edit a workout's day and time
 * with the session still in your hands), except on the side facing the other
 * button: they are `w-xs` apart, so each gives the other half of that gap and
 * a press aimed at `+` can never land on `−`. See `lib/hitTarget`.
 */
const MINUS_SLOP = slopInsets(36, TOUCH_MIN_WORKOUT, { right: 2 });
const PLUS_SLOP = slopInsets(36, TOUCH_MIN_WORKOUT, { left: 2 });

function StepButton({
  icon,
  label,
  onPress,
}: {
  icon: 'plus' | 'minus';
  label: string;
  onPress: () => void;
}) {
  return (
    <BubblePressable
      onPress={onPress}
      hitSlop={icon === 'minus' ? MINUS_SLOP : PLUS_SLOP}
      radius="pill"
      accessibilityRole="button"
      accessibilityLabel={label}
      style={pressedStyle}
      className="h-[36px] w-[36px] items-center justify-center rounded-pill border border-hairline bg-surface-alt"
    >
      <Icon name={icon} size={14} color={palette.ink} />
    </BubblePressable>
  );
}

/**
 * The footer row of a card: a plus and a verb. Green when it adds something the
 * user chose to add, faint when it is just the next slot in a list.
 */
export function AddRow({
  label,
  tone = 'green',
  onPress,
}: {
  label: string;
  tone?: 'green' | 'faint';
  onPress: () => void;
}) {
  const green = tone === 'green';
  return (
    <BubblePressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={pressedStyle}
      className="h-row flex-row items-center justify-center"
    >
      <Icon name="plus" size={14} color={green ? palette.greenBright : palette.inkFaint} />
      <Text
        className={`ml-sm text-label font-medium ${green ? 'text-green-bright' : 'text-ink-muted'}`}
      >
        {label}
      </Text>
    </BubblePressable>
  );
}

/**
 * The same verb as `AddRow`, as a target of its own rather than the last row of
 * a card.
 *
 * The redesigned lists are separate cards with 8px of air between them, so there
 * is no card footer left to put `AddRow` in. A dashed outline is what says "a
 * slot, not a thing" without inventing a colour: it is the hairline, drawn as a
 * line you can see through.
 */
export function DashedAdd({
  label,
  onPress,
  height = 52,
  radius = 'surface',
}: {
  label: string;
  onPress: () => void;
  /** 52 for a row at the foot of a list, 150 for a tile in a grid. */
  height?: number;
  /** The corner of whatever it is an empty slot FOR. */
  radius?: 'surface' | 'card';
}) {
  return (
    <BubblePressable
      onPress={onPress}
      radius={radius === 'card' ? 18 : 14}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(state) => [pressedStyle(state), { height, backgroundColor: glass.ghost }]}
      className={[
        'flex-row items-center justify-center border border-dashed border-hairline',
        radius === 'card' ? 'rounded-card' : 'rounded-surface',
      ].join(' ')}
    >
      <Icon name="plus" size={14} color={palette.inkFaint} />
      <Text className="ml-sm text-label font-medium text-ink-muted">{label}</Text>
    </BubblePressable>
  );
}

/* ------------------------------------------------------------------ */
/* Fields                                                              */
/* ------------------------------------------------------------------ */

/**
 * A text field. Plain — nothing clever.
 *
 * With `onChangeText` it is a real `TextInput` whose caret is tinted
 * `green-bright`, which is exactly what the design draws: a 2px green bar after
 * the value. With no `onChangeText` it renders the same thing statically and
 * draws that bar itself, for the read-only case.
 *
 * Both paths are the same 56-high box so a field never changes size or position
 * when it gains focus.
 *
 * Focus asks the scroll it sits in to bring it above the keyboard
 * (`useRevealOnFocus`) — what matters when the keyboard is already up and the
 * thumb moves to the next field, since nothing else would scroll for it. Whatever
 * must clear the keyboard WITH the field (a sheet's Save) is the sheet's job now,
 * by rising, not the field's: the padding trick that used to stretch this field's
 * rect down over the button only ever existed to steer Android's `pan`.
 */
export function FieldWell({
  value,
  size = 'title',
  shape = 'surface',
  placeholder,
  onChangeText,
  onPress,
  autoFocus = false,
  selectAllOnFocus = false,
  keyboardType = 'default',
  onBlur,
  onSubmitEditing,
  lit = false,
  accessibilityLabel,
}: {
  value: string;
  /** `title` for names, `body` for a search query. */
  size?: 'title' | 'body';
  /** `pill` for search, `surface` for form fields. */
  shape?: 'surface' | 'pill';
  placeholder?: string;
  /** Present = editable. Absent = a drawn, read-only field. */
  onChangeText?: (value: string) => void;
  onPress?: () => void;
  /** Open the keyboard on mount. For a field that exists to be filled in. */
  autoFocus?: boolean;
  /**
   * Select the whole value on focus, so the first keystroke replaces a
   * placeholder name instead of appending to it.
   */
  selectAllOnFocus?: boolean;
  /** `number-pad` for a field that only ever holds digits. */
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  /**
   * Fired when the field loses focus — the moment to COMMIT a value whose write is
   * expensive.
   *
   * `onChangeText` fires per keystroke, which is right for a search query and wrong
   * for anything that rebuilds a list: renaming a finished workout recomputes the
   * record and re-sorts the log, and doing that eleven times while somebody types
   * `Pull, short` would rebuild the screen under the keyboard. See `HistoryScreen`.
   */
  onBlur?: () => void;
  /**
   * The keyboard's ✓ ("done"). Present = return SAVES, under the same rule as
   * the sheet's button (`lib/sheetSubmit.ts`); the field keeps focus, so an
   * unsavable value leaves the keyboard up instead of closing it for nothing.
   * Absent = return just closes the keyboard, as before.
   */
  onSubmitEditing?: () => void;
  /**
   * The v3 sheet field: an 18 corner, a c2 edge and a 4 dp glow ring round it,
   * 17 / 500 text. For the one field a sheet exists to fill — a new task's name.
   */
  lit?: boolean;
  accessibilityLabel: string;
}) {
  const reveal = useRevealOnFocus();
  const box = lit
    ? 'h-row flex-row items-center rounded-[18px] border px-lg'
    : [
        'h-row flex-row items-center border border-hairline bg-surface-alt',
        shape === 'pill' ? 'rounded-pill px-[20px]' : 'rounded-surface px-lg',
      ].join(' ');
  const litStyle = lit
    ? {
        borderColor: tint(0.34),
        backgroundColor: 'rgba(236,241,238,0.04)',
        boxShadow: [
          { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 4, color: tint(0.09) },
        ],
      }
    : undefined;
  const textClass = lit
    ? 'text-[17px] font-medium text-ink'
    : size === 'title'
      ? 'text-title font-medium text-ink'
      : 'text-body text-ink';

  if (onChangeText) {
    return (
      <View className={box} style={litStyle}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.inkFaint}
          // The caret IS the green bar in the design. Android honours
          // `cursorColor`, iOS `selectionColor`; both are set so the field looks
          // the same either way.
          cursorColor={palette.greenBright}
          selectionColor={palette.greenBright}
          autoFocus={autoFocus}
          selectTextOnFocus={selectAllOnFocus}
          keyboardType={keyboardType}
          onFocus={reveal}
          onBlur={onBlur}
          onSubmitEditing={onSubmitEditing}
          submitBehavior={onSubmitEditing ? 'submit' : 'blurAndSubmit'}
          accessibilityLabel={accessibilityLabel}
          returnKeyType="done"
          className={`flex-1 ${textClass}`}
        />
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={pressedStyle}
      className={box}
    >
      <Text className={textClass}>{value}</Text>
      <View
        className="ml-[2px] w-[2px] bg-green-bright"
        style={{ height: size === 'title' ? 26 : 20 }}
      />
    </Pressable>
  );
}

/**
 * A 96-high well: micro label pinned top, the number pinned bottom at Display
 * size. Two of these side by side ARE the set-input preview — which is why they
 * are this big. You should be able to see what the exercise will ask you for.
 *
 * A well with an `onPress` says so, with a `±` beside its label. It used to look
 * exactly like one without: the create screen's two wells were tappable-looking
 * and inert, which is the worst of both — the affordance is the promise, so it only
 * appears when there is something behind it. `selected` marks the one an open
 * editor is pointing at, in the same green the rest of the app uses for "this is
 * the live thing".
 */
export function NumericWell({
  label,
  value,
  unit,
  onPress,
  selected = false,
}: {
  label: string;
  value: string;
  unit?: string;
  onPress?: () => void;
  selected?: boolean;
}) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={
        onPress
          ? `${label} ${value} ${unit ?? ''}, ${t('adjust')}`.replace(/\s+/g, ' ').trim()
          : `${label} ${value} ${unit ?? ''}`.replace(/\s+/g, ' ').trim()
      }
      style={onPress ? pressedStyle : undefined}
      className={[
        'h-well flex-1 justify-between rounded-surface border bg-surface-alt px-lg py-md',
        selected ? 'border-green-bright' : 'border-hairline',
      ].join(' ')}
    >
      <View className="flex-row items-center justify-between">
        <Kicker tone={selected ? 'green' : 'faint'}>{label}</Kicker>
        {onPress ? (
          <Text
            className={[
              'text-micro font-semibold',
              selected ? 'text-green-bright' : 'text-ink-faint',
            ].join(' ')}
          >
            ±
          </Text>
        ) : null}
      </View>
      <View className="flex-row items-baseline">
        <Text className="text-display font-semibold tabular-nums text-ink">{value}</Text>
        {unit ? (
          <Text className="ml-xs text-micro font-semibold uppercase text-ink-faint">{unit}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

/**
 * Segmented control. Two to four options, equal width, and ONE lit pane under
 * the chosen one that slides between them (`SlidingThumb`) — the v3 "Repeats"
 * control, which every segmented choice in the app now is.
 *
 * Lit rather than filled: a `c2` fill with text on it needs `onAcc`, and on the
 * light themes (Aurora, Fintech Lime) that is near-black text on a bright slab
 * sitting in a dark sheet — the loudest thing on the screen for what is only a
 * setting. A tinted pane with the label in `acc` says "this one" at the same
 * volume as every other lit surface.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  const [width, setWidth] = useState(0);
  const index = options.findIndex((option) => option.value === value);
  /* The track's padding (4 each side) and each cell's own `px-xs`. */
  const cellWidth = width > 0 ? (width - 8) / options.length - 8 : 0;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width - 2)}
      style={{
        flexDirection: 'row',
        padding: 4,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(236,241,238,0.05)',
        backgroundColor: glass.sunken,
      }}
    >
      <SlidingThumb
        index={index < 0 ? null : index}
        count={options.length}
        trackWidth={width}
        duration={380}
        bezier={SEGMENT_CURVE}
        style={{
          borderRadius: 14,
          borderWidth: 1,
          backgroundColor: tint(0.16),
          borderColor: tint(0.34),
        }}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <BubblePressable
            key={option.value}
            onPress={() => onChange(option.value)}
            radius={14}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={pressedStyle}
            className="h-[42px] flex-1 items-center justify-center rounded-[14px] px-xs"
          >
            <Text
              /* A segment is a fixed-height cell in a fixed-width row, and the
                 labels are translated — `Выбрать дни` is half again the width
                 of `Pick days`. Wrapping would push the control past 42 and
                 break the row it sits in, so it shrinks a little, then clips.
                 The size comes from the label, not `adjustsFontSizeToFit` —
                 see `lib/stepperFont.segmentFontSize`. */
              numberOfLines={1}
              style={{
                fontSize: segmentFontSize(option.label, cellWidth),
                fontWeight: '600',
                color: selected ? palette.acc : palette.inkMuted,
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

/** `(.34,1.3,.64,1)` — the thumb's landing, from the design's `schedThumb`. */
const SEGMENT_CURVE = [0.34, 1.3, 0.64, 1] as const;

/**
 * A chip that is on or off.
 *
 * `Segmented` is for two to four mutually-exclusive options that must ALL be
 * visible without a tap. Chips are for the other shape: a SET of options — the
 * fourteen muscle groups, the five movement clusters — too many to sit in one
 * fixed-width control, and often more than one selected at a time. "On" is the
 * same lit tint as the segmented thumb so the two controls read as one system,
 * and for the same reason: a solid `c2` chip is unreadable on the light themes.
 *
 * 36 high inside a 44 row (the parent supplies the padding), which keeps the
 * thumb target legal while letting a row of chips stay one line tall.
 */
export function SelectChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <BubblePressable
      onPress={onPress}
      hitSlop={6}
      radius="pill"
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={(state) => [
        pressedStyle(state),
        selected
          ? { backgroundColor: tint(0.16), borderColor: tint(0.3) }
          : { backgroundColor: glass.sunken, borderColor: 'rgba(236,241,238,0.06)' },
      ]}
      className="mb-sm mr-sm h-[36px] items-center justify-center rounded-pill border px-lg"
    >
      <Text
        className={[
          'text-label',
          selected ? 'font-semibold text-acc' : 'font-medium text-ink-muted',
        ].join(' ')}
      >
        {label}
      </Text>
    </BubblePressable>
  );
}

/** `(.34,1.56,.64,1)` over 320 ms — the design's `remKnob`. */
const KNOB_MS = 320;

/**
 * The only switch in the app, and it earns it: `Requires weight` visibly adds
 * or removes the inputs below it, so the control needs to read as a hard on/off
 * rather than a preference.
 */
export function Toggle({
  value,
  onChange,
  accessibilityLabel,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  accessibilityLabel: string;
}) {
  /*
   * THE KNOB SLIDES, 20 dp on the overshoot curve over 320 ms, while the track
   * cross-fades from the off wash to the theme's c1 → c2 gradient. The write
   * happens on the press; the slide follows it — the switch is never the thing
   * holding up the setting it controls.
   *
   * The gradient is a stacked layer whose OPACITY animates, because a colour
   * cannot animate on the native driver and an opacity can; the whole switch
   * stays off the JS thread.
   */
  const scale = useMotionScale();
  const on = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(on, {
      toValue: value ? 1 : 0,
      duration: KNOB_MS * scale,
      easing: curve(motion.pop),
      useNativeDriver: true,
    }).start();
  }, [on, scale, value]);
  // Built once: a fresh interpolation node per render makes each Animated.View
  // detach and re-attach its native animation graph.
  const fade = useMemo(
    () => on.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    [on],
  );
  const knobX = useMemo(() => on.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }), [on]);
  const fill = gradientFill();

  return (
    <Pressable
      onPress={() => {
        tap();
        onChange(!value);
      }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={pressedStyle}
      className="h-[32px] w-[52px] justify-center overflow-hidden rounded-pill"
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 9999,
          backgroundColor: 'rgba(236,241,238,0.1)',
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 9999,
          overflow: 'hidden',
          opacity: fade,
        }}
      >
        <LinearGradient
          colors={[fill.colors[0], fill.colors[1]]}
          start={fill.start}
          end={fill.end}
          style={{ flex: 1 }}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={{
          width: 26,
          height: 26,
          marginLeft: 3,
          borderRadius: 9999,
          backgroundColor: palette.ink,
          transform: [{ translateX: knobX }],
        }}
      />
    </Pressable>
  );
}

/** The design's ghost pill: a wash of ink on a slightly stronger edge. */
const GHOST_FILL = 'rgba(236,241,238,0.07)';
const GHOST_EDGE = 'rgba(236,241,238,0.10)';

/**
 * 56-high full-width pill.
 *
 *   primary  the theme gradient (135deg c1 → c2 55% → c3), text in `onAcc`
 *   ghost    ink wash on a 10% edge, ink text
 *   danger   a coral OUTLINE on a coral wash, coral text — the destructive
 *            answer of a danger confirm, and nothing else. Outlined, not
 *            filled: the safe answer beside it is the filled one (U19)
 *
 * `onAcc` rather than ink on the gradient is load-bearing: the light themes
 * put a near-white c2 under the label, and ink on it vanished.
 */
export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
}) {
  const primary = variant === 'primary';
  const isDanger = variant === 'danger';
  const textColor = primary ? palette.onAcc : isDanger ? danger : palette.ink;
  return (
    <BubblePressable
      onPress={onPress}
      radius="pill"
      // On a filled pill the accent ring is invisible; the fill's own text
      // colour is the one that can be seen leaving.
      bubbleColor={primary || isDanger ? textColor : palette.greenBright}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(state) => [
        pressedStyle(state),
        primary
          ? null
          : isDanger
            ? { backgroundColor: dangerTint.wash, borderColor: dangerTint.outline, borderWidth: 1 }
            : { backgroundColor: GHOST_FILL, borderColor: GHOST_EDGE, borderWidth: 1 },
      ]}
      className="h-row items-center justify-center rounded-pill px-lg"
    >
      {primary ? <GradientFill /> : null}
      <Text
        // Same reason as `Segmented`: the label carries a routine name and a
        // translation, and this button is a fixed 56 high.
        numberOfLines={1}
        style={{ color: textColor, fontSize: 16, fontWeight: '600' }}
      >
        {label}
      </Text>
    </BubblePressable>
  );
}

/**
 * The theme gradient as the background of a pill. Absolutely positioned — the
 * first child of whatever it fills.
 */
export function GradientFill({ radius = 9999 }: { radius?: number }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: radius,
        overflow: 'hidden',
      }}
    >
      <LinearGradient {...gradientFill()} style={{ flex: 1 }} />
    </View>
  );
}

/**
 * A 56-high borderless text action. Used for `Delete routine` — no red, no fuss.
 *
 * `green` marks a row that DOES something for you rather than undoing something:
 * `Export data` and `Delete all workout history` sit in the same card at the bottom
 * of Settings, and only one of them should look like the thing to reach for. Same
 * green every other primary action in the app uses; the quiet rows stay ink-muted.
 */
export function TextButton({
  label,
  tone = 'muted',
  onPress,
}: {
  label: string;
  tone?: 'muted' | 'green';
  onPress: () => void;
}) {
  return (
    <BubblePressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={pressedStyle}
      className="h-row items-center justify-center"
    >
      <Text
        className={[
          'text-label font-medium',
          tone === 'green' ? 'text-green-bright' : 'text-ink-muted',
        ].join(' ')}
      >
        {label}
      </Text>
    </BubblePressable>
  );
}

/**
 * THE ONE WAY INTO A DESTRUCTIVE CONFIRM (U19): muted text at the foot of the
 * screen — `Archive this task…`, `Reset every setting…`, `Delete this workout…`.
 *
 * Muted and not coral, because the colour belongs to the confirm it opens
 * (`ConfirmSheet tone="danger"`), where it means "last chance"; on the control
 * it only meant "scary word", and three screens had three versions of it (coral
 * text, a dashed box, a centred muted row). Left-aligned at 48 dp so it reads as
 * a sentence at the end of the page and not as a button competing with the
 * floating commit. The `…` is added here: it is the promise that a question
 * comes next, so every caller makes it, and the spoken label leaves it out.
 */
export function DangerFootAction({
  label,
  onPress,
  hint,
  accessibilityLabel,
  accessibilityHint,
  className = '',
}: {
  label: string;
  onPress: () => void;
  /** A faint line under the label — what the action leaves alone. */
  hint?: string;
  /** Defaults to `label` — for one that names its subject out loud. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  className?: string;
}) {
  return (
    <BubblePressable
      onPress={onPress}
      radius={14}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint ?? hint}
      style={(state) => [
        pressedStyle(state),
        { alignSelf: 'flex-start', minHeight: 48, paddingHorizontal: 4, justifyContent: 'center' },
      ]}
      className={className}
    >
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 14.5 }}
        className="font-medium text-ink-muted"
      >
        {`${label}…`}
      </Text>
      {hint ? (
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 13.5, lineHeight: 18 }}
          className="text-ink-faint"
        >
          {hint}
        </Text>
      ) : null}
    </BubblePressable>
  );
}
