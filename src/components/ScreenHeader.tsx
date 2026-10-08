/**
 * ScreenHeader — the one header every screen uses.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹   PULL + SWIMMING                [ Finish ] │
 *   │     11 of 18 sets · 42 min                    │
 *   └──────────────────────────────────────────────┘
 *
 * Three slots and nothing else: back, a Micro kicker (plus an optional Label
 * subtitle), and at most one pill action. Every screen in the app fits that,
 * which is why there is no per-screen header component.
 *
 * The kicker can go accent to signal a transient mode — reordering a routine
 * says `MOVING · PULL TO STOMACH` — and the action can demote to `surface-alt`
 * when it isn't the thing to do right now. Those two switches cover every
 * header state in the design.
 *
 * ── THE v3 SIZES ──────────────────────────────────────────────────────────
 *
 * The prototype's pushed header: a 60 dp row, a 46 dp ghost-glass back circle
 * (the same circle as the section top bar's buttons, so leaving a screen and
 * opening one are the same size of target), a kicker at 13 / ls 1.4 in
 * ink-muted and a subline at 14.5 in ink. Both lines RUN rather than truncate —
 * a routine's name is exactly the kind of string that is longer than the row.
 */

import type { ReactNode } from 'react';
import { Animated, Pressable, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../hooks/useT';
import { palette, radius } from '../theme/tokens';
import { BubblePressable } from './bubbles';
import { Icon, type IconName } from './Icon';
import { usePressScale } from './motion';
import { FADE_ON, RunningText } from './RunningText';
import { SpecularEdge } from './glass';

/** Matches `SectionTopBar`'s buttons. */
const CIRCLE = 46;
const GHOST: ViewStyle = {
  height: CIRCLE,
  width: CIRCLE,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: radius.pill,
  overflow: 'hidden',
  borderWidth: 1,
  borderColor: 'rgba(236,241,238,0.07)',
  backgroundColor: 'rgba(236,241,238,0.055)',
};
const GHOST_GLYPH = '#AEB9B3';

export interface HeaderAction {
  label: string;
  onPress: () => void;
  /** `primary` = green fill. `muted` = surface-alt, for "not yet / not now". */
  tone?: 'primary' | 'muted';
}

/**
 * A 46 dp glyph LEFT of the pill action.
 *
 * One caller: the routine editor's die. It is a glyph rather than a second pill
 * because the pill is the commit — `Save` — and two pills in one corner is two
 * things that look equally like the way out of the screen. A circle the same
 * size as the ones in `SectionTopBar` reads as what it is: a thing that does
 * something to the screen you are on, not a thing that leaves it.
 */
export interface HeaderIconAction {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Held rather than tapped — the die's "ask me what to put in it". */
  onLongPress?: () => void;
  /** Lit, while it is doing something. */
  active?: boolean;
}

interface ScreenHeaderProps {
  /** Uppercase kicker, 13 / ls 1.4. Reads as a location, not a title. */
  kicker: string;
  /** Tinted kicker for a transient mode (reorder, moving, recording). */
  kickerTone?: 'faint' | 'green';
  /** Second line, 14.5 ink tabular — progress, counts, dates. */
  subtitle?: string;
  onBack?: () => void;
  action?: HeaderAction;
  /** A glyph button before the pill. See `HeaderIconAction`. */
  iconAction?: HeaderIconAction;
  /**
   * The hairline under the header. Absent where the content below is itself a
   * distinct surface (a search field), so the two rules don't stack.
   */
  bordered?: boolean;
  children?: ReactNode;
}

export function ScreenHeader({
  kicker,
  kickerTone = 'faint',
  subtitle,
  onBack,
  action,
  iconAction,
  bordered = true,
  children,
}: ScreenHeaderProps) {
  const t = useT();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: insets.top,
        paddingRight: 12,
        paddingBottom: 8,
        paddingLeft: onBack ? 10 : 16,
      }}
      className={['bg-bg', bordered ? 'border-b border-b-hairline' : ''].join(' ')}
    >
      <View style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {onBack ? (
          <GhostCircle onPress={onBack} label={t('Back')}>
            <Icon name="chevron-left" size={22} color={palette.ink} />
          </GhostCircle>
        ) : null}

        <View style={{ flex: 1, minWidth: 0 }}>
          <RunningText
            text={kicker}
            fadeColor={FADE_ON.page}
            maxFontSizeMultiplier={1.3}
            style={{
              fontSize: 13,
              lineHeight: 16,
              letterSpacing: 1.4,
              fontWeight: '600',
              textTransform: 'uppercase',
              color: kickerTone === 'green' ? palette.acc : palette.inkMuted,
            }}
          />
          {subtitle ? (
            <RunningText
              text={subtitle}
              fadeColor={FADE_ON.page}
              containerStyle={{ marginTop: 3 }}
              style={{ fontSize: 14.5, lineHeight: 19, color: palette.ink }}
              className="tabular-nums"
            />
          ) : null}
        </View>

        {iconAction ? (
          <GhostCircle
            onPress={iconAction.onPress}
            onLongPress={iconAction.onLongPress}
            label={iconAction.label}
            active={iconAction.active}
          >
            <Icon
              name={iconAction.icon}
              size={23}
              color={iconAction.active ? palette.acc : GHOST_GLYPH}
            />
          </GhostCircle>
        ) : null}

        {action ? (
          <Pressable
            onPress={action.onPress}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            className={[
              'h-[40px] items-center justify-center rounded-pill px-lg',
              action.tone === 'muted' ? 'border border-hairline bg-surface-alt' : 'bg-green',
            ].join(' ')}
          >
            <Text
              className={[
                'text-label font-semibold',
                action.tone === 'muted' ? 'text-ink-muted' : 'text-on-acc',
              ].join(' ')}
            >
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {children}
    </View>
  );
}

/** The 46 dp ghost-glass circle: back, and the one glyph action. */
function GhostCircle({
  onPress,
  onLongPress,
  label,
  active,
  children,
}: {
  onPress: () => void;
  onLongPress?: () => void;
  label: string;
  active?: boolean;
  children: ReactNode;
}) {
  const press = usePressScale(0.94);
  return (
    <BubblePressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={320}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={6}
      radius="pill"
      accessibilityRole="button"
      accessibilityState={active != null ? { selected: active } : undefined}
      accessibilityLabel={label}
      style={{ height: CIRCLE, width: CIRCLE, borderRadius: radius.pill }}
    >
      <Animated.View style={[GHOST, active ? { borderColor: palette.acc } : null, press.style]}>
        <SpecularEdge color="rgba(236,241,238,0.10)" radius={radius.pill} />
        {children}
      </Animated.View>
    </BubblePressable>
  );
}
