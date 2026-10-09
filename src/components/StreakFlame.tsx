/**
 * StreakFlame — how many days in a row, at one of three temperatures.
 *
 *   <7      ( 🜂 3 )    ink at 4%, muted text — a run, not yet a habit
 *   ≥7      ( 🜂 12 )   green at 12%, edged — a week is the first threshold
 *   ≥21     ( 🜂 34 )   green at 20%, a brighter edge
 *
 * Those are days. A run of weeks (a weekly task, drawn with `unit`) is warm
 * from 1 week and hot from 3 — the same spans of time; the decision and why
 * are in `lib/streakTemperature.ts`.
 *
 * ── WHY THREE STEPS AND NOT A GRADIENT ────────────────────────────────────
 *
 * A continuous ramp from day 1 to day 100 is a colour nobody can read a value
 * off. Three states are three sentences — "you have started", "this is a week",
 * "this is a habit" — and the thresholds are the ones people already use for
 * themselves. The count is written on it either way, so the temperature is
 * emphasis and never the only carrier of the number.
 *
 * The hot badge used to glow and breathe. Both went in 2.1.0: an infinite loop
 * in a list row is a list that is never at rest while it scrolls.
 *
 * ── IT IS ABSENT, NOT ZERO ────────────────────────────────────────────────
 *
 * At streak 0 nothing is drawn. A badge reading `0` on eleven rows is a column
 * of failure reports on a screen whose entire argument (`lib/tasks.ts`) is that
 * a habit list which can only report failure is one people stop answering.
 * Excused days are the same: the streak is KEPT, so the badge is simply not the
 * thing that day's row is about.
 *
 * ── THE SNOWFLAKE (E3, Wave 3) ────────────────────────────────────────────
 *
 * With the engagement switch on and a freeze held, `❄ n` follows the number,
 * and the chip becomes a button that opens the freeze sheet. Without
 * `freezes` (the switch off, a weekly task, none held) the chip is exactly the
 * chip it always was — not pressable, not a pixel wider.
 */

import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Icon } from './Icon';
import { RollingNumber } from './RollingNumber';
import { streakTemperature } from '../lib/streakTemperature';
import { palette, radius, tint } from '../theme/tokens';

export function StreakFlame({
  streak,
  unit,
  freezes = 0,
  onFreezes,
  freezesLabel,
}: {
  streak: number;
  /** A short unit after the number — `wk` for a run of weeks (T2). Absent: days. */
  unit?: string;
  /** E3: freezes held. 0 (the default) draws no snowflake. */
  freezes?: number;
  /** E3: open the freeze sheet. Only used while `freezes` > 0. */
  onFreezes?: () => void;
  /** E3: the chip's spoken label while it is a button. */
  freezesLabel?: string;
}) {
  // A unit is only ever passed for a run of weeks, so its presence is the
  // run's kind; the thresholds per kind are `lib/streakTemperature.ts`.
  const temperature = streakTemperature(streak, unit ? 'week' : 'day');
  const hot = temperature === 'hot';
  const warm = temperature !== 'cold';
  // Above the early return, for the rules of hooks: a fresh style object would
  // defeat RollingNumber's memo.
  const numberStyle = useMemo(
    () => ({ fontSize: 12.5, color: warm ? palette.greenBright : palette.inkMuted }),
    [warm],
  );

  if (streak < 1) return null;

  const frozen = freezes > 0;
  const chip = (
    <View
      style={{
        height: 26,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 7,
        paddingRight: 9,
        borderRadius: radius.pill,
        borderWidth: warm ? 1 : 0,
        borderColor: hot ? tint(0.42) : tint(0.24),
        backgroundColor: hot ? tint(0.2) : warm ? tint(0.12) : 'rgba(236,241,238,0.04)',
      }}
    >
      <View style={{ marginRight: 4 }}>
        <Icon name="flame" size={13} color={warm ? palette.greenBright : palette.inkMuted} />
      </View>
      {/* The number ROLLS when a mark moves it — a streak that grows is seen
          growing, on the row that grew it. */}
      <RollingNumber
        value={String(streak)}
        lineHeight={16}
        duration={450}
        style={numberStyle}
        className="font-semibold"
      />
      {unit ? (
        <Text maxFontSizeMultiplier={1.3} style={[numberStyle, { marginLeft: 3 }]}>
          {unit}
        </Text>
      ) : null}
      {frozen ? (
        <View style={{ marginLeft: 6, flexDirection: 'row', alignItems: 'center' }}>
          <Icon name="snowflake" size={12} color={palette.acc} />
          <Text maxFontSizeMultiplier={1.3} style={[numberStyle, { marginLeft: 2 }]}>
            {freezes}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (!frozen || !onFreezes) return chip;
  return (
    <Pressable
      onPress={onFreezes}
      accessibilityRole="button"
      accessibilityLabel={freezesLabel}
      // 26 drawn, 44 to the thumb.
      hitSlop={{ top: 9, bottom: 9, left: 4, right: 4 }}
    >
      {chip}
    </Pressable>
  );
}
