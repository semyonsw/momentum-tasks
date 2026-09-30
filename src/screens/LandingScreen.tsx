/**
 * Home — the landing above the four sections.
 *
 *   MONDAY · 28 SEP
 *   Good afternoon                       [mark]
 *   6 of 8 tasks done · Pull is up next
 *
 *   ╭──────────╮ ╭──────────╮
 *   │ 🏋    #92 │ │ ✓    ◔75%│
 *   │ Workout  │ │ Tasks    │
 *   ╰──────────╯ ╰──────────╯
 *   ╭──────────╮ ╭──────────╮
 *   │ ▣     AMD│ │ ⚙    ●●● │
 *   │ Finance  │ │ Settings │
 *   ╰──────────╯ ╰──────────╯
 *
 * The app opens here now. It used to open on the workout section, which made
 * the tasks and the money — the two logs you touch EVERY day — a swipe away
 * behind the one you touch three times a week. A landing that says where each
 * of the three stands, one tap from each, is the rename's reason for existing:
 * Momentum is the three logs, not a workout tracker with two extras.
 *
 * Each tile is a door, and the transition treats it as one: the tapped tile's
 * window is measured and handed up, and the section GROWS out of that rect
 * (`navigation/AppShell.tsx`). There is no nav bar here — the tiles are the nav.
 *
 * Composition only. The words are `lib/home.ts`; the numbers come from the
 * stores through the same pure functions each section already uses, so a tile
 * can never disagree with the screen it opens.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Animated, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppMark } from '../components/AppMark';
import { BubblePressable } from '../components/bubbles';
import { Lamps } from '../components/glass';
import { MaterialSymbol, type SymbolName } from '../components/MaterialSymbol';
import { usePressScale } from '../components/motion';
import { FADE_ON, RunningText } from '../components/RunningText';
import { useLanguage, useT } from '../hooks/useT';
import { useToday } from '../hooks/useToday';
import { describeBackupAge } from '../lib/autoBackup';
import { monthNames, parseDay, weekdayIndex, weekdayNames } from '../lib/days';
import { focusFamily, greetingFor, homeSubline } from '../lib/home';
import { balanceOfAccount, formatValue, inAccount, totalsIn } from '../lib/money';
import { type SectionTab } from '../lib/sectionNav';
import { dayProgress } from '../lib/tasks';
import { figureFontSize } from '../lib/stepperFont';
import { themeName } from '../lib/theme';
import { useMoney } from '../state/moneyStore';
import { useSettings } from '../state/settingsStore';
import { useTasks } from '../state/tasksStore';
import { curve, gradientBar, gradientFill, palette, stopTint, tint } from '../theme/tokens';

/** A tile's window, for the clip transition to grow out of. */
export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LandingScreenProps {
  /** `#92` — what the next workout will be saved as. */
  nextWorkoutNumber: number;
  /** The routine whose turn it is (or the workout running), and its focus line. */
  nextWorkout: { name: string; focus: string | null } | null;
  workoutInProgress: boolean;
  onOpen: (section: SectionTab, from: TileRect | null) => void;
}

const TILE_HEIGHT = 262;
const TILE_IN = curve([0.2, 0.8, 0.2, 1]);

export function LandingScreen({
  nextWorkoutNumber,
  nextWorkout,
  workoutInProgress,
  onOpen,
}: LandingScreenProps) {
  const t = useT();
  const lang = useLanguage();
  const insets = useSafeAreaInsets();
  const today = useToday();

  const tasks = useTasks((s) => s.tasks);
  const log = useTasks((s) => s.log);
  const progress = useMemo(() => dayProgress(tasks, log, today), [log, tasks, today]);

  const accounts = useMoney((s) => s.accounts);
  const amounts = useMoney((s) => s.amounts);
  const currency = useSettings((s) => s.currencyCode);
  const account = accounts[0] ?? null;
  const money = useMemo(() => {
    if (!account) return null;
    const own = inAccount(amounts, account.id);
    return {
      balance: balanceOfAccount(account, amounts),
      spent: totalsIn(own, 'month', today).expenses,
    };
  }, [account, amounts, today]);

  const themeId = useSettings((s) => s.themeId);
  const lastBackupAt = useSettings((s) => s.lastBackupAt);

  const date = parseDay(today) ?? new Date();
  const kicker = `${weekdayNames(lang)[weekdayIndex(date)]} · ${date.getDate()} ${monthNames(lang)[
    date.getMonth()
  ].slice(0, 3)}`;
  const subline = homeSubline({
    tasksDone: progress.done,
    tasksTotal: progress.total,
    nextWorkout: nextWorkout?.name ?? null,
    workoutInProgress,
  })
    .map((part) => t(part.key, part.vars))
    .join(' · ');

  const family = focusFamily(nextWorkout?.focus ?? null);
  const percent = Math.round(progress.fraction * 100);
  const monthName = monthNames(lang)[date.getMonth()];

  return (
    <View className="flex-1 bg-bg">
      <Lamps section="Home" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 28,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Rise>
          <View style={{ paddingHorizontal: 4 }}>
            <Text
              allowFontScaling={false}
              style={{
                fontSize: 12.5,
                lineHeight: 16,
                letterSpacing: 1.3,
                color: palette.acc,
                textTransform: 'uppercase',
              }}
              className="font-semibold"
            >
              {kicker}
            </Text>
            <View
              style={{
                marginTop: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text
                allowFontScaling={false}
                style={{ flex: 1, fontSize: 34, lineHeight: 38, letterSpacing: -1 }}
                className="font-semibold text-ink"
              >
                {t(greetingFor(new Date().getHours()))}
              </Text>
              <AppMark size={46} />
            </View>
            <Text
              allowFontScaling={false}
              style={{ marginTop: 6, fontSize: 15.5, lineHeight: 21 }}
              className="text-ink-muted"
            >
              {subline}
            </Text>
          </View>
        </Rise>

        <View style={{ marginTop: 26, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <Tile
            index={0}
            glyph="fitness_center"
            lamp={{ stop: 1, alpha: 0.45, corner: 'topLeft' }}
            extra={<Badge label={`#${nextWorkoutNumber}`} />}
            kicker={
              workoutInProgress
                ? t('In progress')
                : family
                  ? `${t('Today')} · ${family}`
                  : t('Today')
            }
            name={t('Workout')}
            detail={nextWorkout?.name ?? t('No routine yet')}
            onPress={(rect) => onOpen('Workout', rect)}
          />
          <Tile
            index={1}
            glyph="task_alt"
            lamp={{ stop: 2, alpha: 0.38, corner: 'topRight' }}
            extra={
              <MiniRing
                fraction={progress.total === 0 ? 0 : progress.fraction}
                label={`${percent}%`}
              />
            }
            kicker={t('Today')}
            name={t('Tasks')}
            detail={
              progress.total === 0
                ? t('Nothing asked for today')
                : t('{done} of {total} done', { done: progress.done, total: progress.total })
            }
            onPress={(rect) => onOpen('Tasks', rect)}
          />
          <Tile
            index={2}
            glyph="account_balance_wallet"
            lamp={{ stop: 3, alpha: 0.34, corner: 'bottomLeft' }}
            extra={
              <Text
                allowFontScaling={false}
                style={{ paddingTop: 6, fontSize: 12, letterSpacing: 1.1, color: palette.acc }}
                className="font-semibold"
              >
                {currency}
              </Text>
            }
            figure={money ? formatValue(money.balance) : undefined}
            name={t('Finance')}
            detail={
              account && money
                ? t('{account} · all time · {spent} spent in {month}', {
                    account: account.name,
                    spent: `${formatValue(money.spent)} ${currency}`,
                    month: monthName,
                  })
                : t('No accounts yet')
            }
            onPress={(rect) => onOpen('Expenses', rect)}
          />
          <Tile
            index={3}
            glyph="settings"
            plainBadge
            lamp={{ stop: 1, alpha: 0.34, corner: 'bottomRight' }}
            extra={
              <View style={{ flexDirection: 'row', gap: 4, paddingTop: 8 }}>
                {[palette.c1, palette.c2, palette.c3].map((color, i) => (
                  <View
                    key={i}
                    style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }}
                  />
                ))}
              </View>
            }
            bar
            name={t('Settings')}
            detail={`${t('Theme')} · ${t(themeName(themeId))} · ${t('last backup {age}', {
              age: describeBackupAge(lastBackupAt, undefined, lang).toLowerCase(),
            })}`}
            onPress={(rect) => onOpen('Settings', rect)}
          />
        </View>
      </ScrollView>
    </View>
  );
}

/** The header's arrival: 14 dp and a fade, 520 ms. */
function Rise({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 520,
      easing: TILE_IN,
      useNativeDriver: true,
    }).start();
  }, [v]);
  const riseY = useMemo(() => v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }), [v]);
  return (
    <Animated.View
      style={{
        opacity: v,
        transform: [{ translateY: riseY }],
      }}
    >
      {children}
    </Animated.View>
  );
}

type Corner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

function Tile({
  index,
  glyph,
  plainBadge = false,
  lamp,
  extra,
  kicker,
  figure,
  bar = false,
  name,
  detail,
  onPress,
}: {
  index: number;
  glyph: SymbolName;
  /** Settings' badge is glass rather than gradient: it is not a log. */
  plainBadge?: boolean;
  lamp: { stop: 1 | 2 | 3; alpha: number; corner: Corner };
  extra: React.ReactNode;
  kicker?: string;
  /** Finance's balance, where the other tiles have a kicker. */
  figure?: string;
  /** Settings' theme bar, in the same place. */
  bar?: boolean;
  name: string;
  detail: string;
  onPress: (rect: TileRect | null) => void;
}) {
  const { width } = useWindowDimensions();
  const tileWidth = (width - 32 - 12) / 2;
  const ref = useRef<View>(null);
  const press = usePressScale(0.94);
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 620,
      delay: 60 + index * 70,
      easing: TILE_IN,
      useNativeDriver: true,
    }).start();
  }, [enter, index]);

  const open = () => {
    const node = ref.current;
    if (!node) {
      onPress(null);
      return;
    }
    node.measureInWindow((x, y, w, h) => onPress(w > 0 ? { x, y, width: w, height: h } : null));
  };

  const lampAt: Record<Corner, object> = {
    topLeft: { top: -60, left: -60 },
    topRight: { top: -60, right: -60 },
    bottomLeft: { bottom: -70, left: -50 },
    bottomRight: { bottom: -70, right: -50 },
  };

  const enterY = useMemo(
    () => enter.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }),
    [enter],
  );
  const enterScale = useMemo(
    () => enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }),
    [enter],
  );
  return (
    <Animated.View
      style={{
        width: tileWidth,
        opacity: enter,
        transform: [{ translateY: enterY }, { scale: enterScale }, ...press.style.transform],
      }}
    >
      <View
        ref={ref}
        collapsable={false}
        style={{
          borderRadius: 28,
          boxShadow: [{ offsetX: 0, offsetY: 14, blurRadius: 34, color: 'rgba(0,0,0,0.45)' }],
        }}
      >
        <BubblePressable
          onPress={open}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          radius={28}
          accessibilityRole="button"
          accessibilityLabel={`${name}. ${detail}`}
          style={{
            height: TILE_HEIGHT,
            borderRadius: 28,
            overflow: 'hidden',
            padding: 18,
            backgroundColor: 'rgba(236,241,238,0.055)',
            borderWidth: 1,
            borderColor: 'rgba(236,241,238,0.07)',
          }}
        >
          <View
            pointerEvents="none"
            style={{ position: 'absolute', width: 220, height: 220, ...lampAt[lamp.corner] }}
          >
            <Svg width={220} height={220}>
              <Defs>
                <RadialGradient id={`tileLamp${index}`} cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor={stopTint(lamp.stop, 1)} stopOpacity={lamp.alpha} />
                  <Stop offset="65%" stopColor={stopTint(lamp.stop, 1)} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={110} cy={110} r={110} fill={`url(#tileLamp${index})`} />
            </Svg>
          </View>
          {/* The specular line along the top edge. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 20,
              right: 20,
              height: 1,
              backgroundColor: 'rgba(236,241,238,0.12)',
            }}
          />

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: 18,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                ...(plainBadge
                  ? {
                      backgroundColor: 'rgba(236,241,238,0.08)',
                      borderWidth: 1,
                      borderColor: 'rgba(236,241,238,0.12)',
                    }
                  : {
                      boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 22, color: tint(0.4) }],
                    }),
              }}
            >
              {plainBadge ? null : (
                <LinearGradient
                  {...gradientFill()}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
              )}
              <MaterialSymbol
                name={glyph}
                size={30}
                color={plainBadge ? palette.ink : palette.onAcc}
                filled
              />
            </View>
            {extra}
          </View>

          <View style={{ marginTop: 'auto', minWidth: 0 }}>
            {figure != null ? (
              <Text
                allowFontScaling={false}
                numberOfLines={1}
                /* Sized from the figure, not `adjustsFontSizeToFit`: on Android
                   the first fit runs before the row has a width, and the number
                   opened the size of a full stop. */
                style={{
                  fontSize: figureFontSize(figure, tileWidth - 36),
                  lineHeight: 30,
                  letterSpacing: -1,
                  fontVariant: ['tabular-nums'],
                  textShadowColor: tint(0.4),
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 30,
                }}
                className="font-semibold text-ink"
              >
                {figure}
              </Text>
            ) : bar ? (
              <LinearGradient {...gradientBar()} style={{ height: 8, borderRadius: 9999 }} />
            ) : kicker ? (
              <RunningText
                text={kicker}
                allowFontScaling={false}
                style={{ fontSize: 12, lineHeight: 16, letterSpacing: 1.1, color: palette.acc }}
                className="font-semibold uppercase"
                fadeColor={FADE_ON.card}
              />
            ) : null}
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              style={{ marginTop: bar ? 12 : 6, fontSize: 23, lineHeight: 28, letterSpacing: -0.5 }}
              className="font-semibold text-ink"
            >
              {name}
            </Text>
            <RunningText
              text={detail}
              allowFontScaling={false}
              containerStyle={{ marginTop: 4 }}
              style={{ fontSize: 14.5, lineHeight: 20 }}
              className="text-ink-muted"
              fadeColor={FADE_ON.card}
            />
          </View>
        </BubblePressable>
      </View>
    </Animated.View>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <View
      style={{
        height: 28,
        paddingHorizontal: 10,
        borderRadius: 9999,
        justifyContent: 'center',
        backgroundColor: tint(0.18),
        borderWidth: 1,
        borderColor: tint(0.34),
      }}
    >
      <Text
        allowFontScaling={false}
        style={{ fontSize: 13, color: palette.acc, fontVariant: ['tabular-nums'] }}
        className="font-bold"
      >
        {label}
      </Text>
    </View>
  );
}

/** The Tasks tile's 46 dp ring, filled to the day's fraction. */
function MiniRing({ fraction, label }: { fraction: number; label: string }) {
  const r = 19.5;
  const length = 2 * Math.PI * r;
  return (
    <View style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
      <Svg
        width={46}
        height={46}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle cx={23} cy={23} r={r} fill="none" stroke="rgba(236,241,238,0.08)" strokeWidth={4} />
        <Circle
          cx={23}
          cy={23}
          r={r}
          fill="none"
          stroke={palette.acc}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${length}`}
          strokeDashoffset={length * (1 - Math.min(1, Math.max(0, fraction)))}
        />
      </Svg>
      <Text allowFontScaling={false} style={{ fontSize: 12 }} className="font-bold text-ink">
        {label}
      </Text>
    </View>
  );
}
