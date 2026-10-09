/**
 * Home — the landing above the four sections.
 *
 *   MONDAY · 5 OCT
 *   Good afternoon                       [mark]
 *   4 of 9 tasks done · Pull is up next
 *   (+ Expense) (○ 10 000 steps) (▶ Resume workout · 42:10)
 *
 *   ╭──────────╮ ╭──────────╮
 *   │ 🏋   #100 │ │ ✓    ◔44%│      150 dp
 *   │ Workout  │ │ Tasks    │
 *   ╰──────────╯ ╰──────────╯
 *   ╭───────────────────────╮
 *   │ ▣  284,600 AMD      › │      Finance, wide, with the balance
 *   ╰───────────────────────╯
 *   ╭───────────────────────╮
 *   │ LAST WEEK · 28 SEP  ✕ │      the weekly review (X3): Monday until ✕,
 *   │ 3      84%     52,300 │      one sentence a log (lib/weeklyReview.ts)
 *   │ (✦ Ask the coach…)    │      X4: only with the engagement switch and a
 *   ╰───────────────────────╯      tested key, and only on a tap (state/weeklySummary.ts)
 *   ╭───────────────────────╮
 *   │ 📖 September, wrapped › │      Wrapped (X1): the first 7 days of a month,
 *   ╰───────────────────────╯      and the year's through Dec–Jan (lib/wrapped.ts)
 *   ⚙ Settings     Lime · backup today ●●● ›     a 56 dp row
 *
 * The app opens here now. It used to open on the workout section, which made
 * the tasks and the money — the two logs you touch EVERY day — a swipe away
 * behind the one you touch three times a week. A landing that says where each
 * of the three stands, one tap from each, is the rename's reason for existing:
 * Momentum is the three logs, not a workout tracker with two extras.
 *
 * ── IT ALSO DOES THINGS (U10) ─────────────────────────────────────────────
 *
 * It used to only point: the greeting was the largest thing on it, Settings
 * was a full 262 dp tile, and an expense took tile → FAB → digits → Save. The
 * row of 48 dp chips under the greeting is the landing's own verbs — `+ Expense`
 * opens the keypad the money FAB opens, on the same account and category; the
 * next unanswered task ticks with its ✓ (an Undo toast, because the chip moves
 * on to the next task and the tick would otherwise be out of reach); `Resume
 * workout` exists only while a session runs. Which task and which chips is
 * `lib/landing.ts`. The tiles came down to 150 dp to pay for the row, Finance
 * became a wide row because a balance is the one figure that wants width, and
 * Settings — not a log — became a slim row at the foot. Rejected: a FAB here
 * (one verb, and the landing has three) and a horizontally scrolling chip strip
 * (the task's name is the chip, and a strip clips it at the screen's edge).
 *
 * Each tile is a door, and the transition treats it as one: the tapped door's
 * window is measured and handed up, and the section GROWS out of that rect
 * (`navigation/AppShell.tsx`) — the wide Finance row and the Settings row
 * included. There is no nav bar here — the tiles are the nav.
 *
 * With Wave 3's switch on (and only then — `lib/engagement.ts`), a small level
 * chip sits under the greeting and opens `LevelSheet`. Off, nothing on this
 * screen moves by a pixel.
 *
 * Composition only. The words are `lib/home.ts`; the numbers come from the
 * stores through the same pure functions each section already uses, so a tile
 * can never disagree with the screen it opens.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppMark } from '../components/AppMark';
import { LevelChip, LevelSheet } from '../components/LevelSheet';
import { useEngagementView, useLevel } from '../hooks/useEngagement';
import { WrappedOffers } from '../components/WrappedEntry';
import type { WrappedPeriod } from '../lib/wrapped';
import { BubblePressable } from '../components/bubbles';
import { Lamps, type ToastAction } from '../components/glass';
import { Icon } from '../components/Icon';
import { MaterialSymbol, type SymbolName } from '../components/MaterialSymbol';
import { pressedStyle, usePressScale } from '../components/motion';
import { FADE_ON, RunningText } from '../components/RunningText';
import { useLanguage, useT } from '../hooks/useT';
import { useToday } from '../hooks/useToday';
import { describeBackupAge } from '../lib/autoBackup';
import { monthNames, parseDay, weekdayIndex, weekdayNames } from '../lib/days';
import { engagementOn } from '../lib/engagement';
import { focusFamily, greetingFor, homeSubline } from '../lib/home';
import { landingAccount, nextUnansweredTask, quickActions } from '../lib/landing';
import { balanceOfAccount, categoriesFor, formatValue, inAccount, totalsIn } from '../lib/money';
import { quickCategoryId } from '../lib/quickCategory';
import { type SectionTab } from '../lib/sectionNav';
import { dayProgress } from '../lib/tasks';
import { figureFontSize } from '../lib/stepperFont';
import { themeName } from '../lib/theme';
import { formatElapsed } from '../lib/units';
import {
  describeWeeklyReview,
  reviewKicker,
  weeklyReview,
  weeklyReviewShown,
  type ReviewColumn,
  type WeeklyReview,
} from '../lib/weeklyReview';
import { weeklySummaryOffered } from '../lib/ai/weeklySummaryPrompt';
import { useAi } from '../state/aiStore';
import { askWeeklySummary } from '../state/weeklySummary';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import { useMoney } from '../state/moneyStore';
import { useSettings } from '../state/settingsStore';
import { useMoneyScale } from '../hooks/useMoneyScale';
import { useTasks } from '../state/tasksStore';
import { curve, glass, gradientFill, palette, radius, stopTint, tint } from '../theme/tokens';

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
  /** When the running session was STARTED, or null: the Resume chip's clock. */
  runningSince: string | null;
  /** The account the money section last read, if one was chosen this session. */
  moneyAccountId: string | null;
  onOpen: (section: SectionTab, from: TileRect | null) => void;
  /** `+ Expense`: the keypad, as the money FAB opens it. */
  onAddExpense: (accountId: string, categoryId: string | null) => void;
  onResume: () => void;
  /** X1: open a Wrapped from its offer card. */
  onOpenWrapped: (period: WrappedPeriod) => void;
  onToast: (text: string, action?: ToastAction) => void;
  /** E1: the badge gallery, from the level sheet (Wave 3 switch on only). */
  onOpenAchievements: () => void;
}

/** The two half tiles (the design's 150, down from 262). */
const TILE_HEIGHT = 150;
/** Finance, full width: the balance and one line. */
const WIDE_HEIGHT = 104;
/** Settings, at the foot: a row, not a tile. */
const ROW_HEIGHT = 56;
/** Every chip in the quick-action row — the mid-workout size, because Resume is one. */
const CHIP_HEIGHT = 48;
const GLYPH = 44;
const TILE_IN = curve([0.2, 0.8, 0.2, 1]);

export function LandingScreen({
  nextWorkoutNumber,
  nextWorkout,
  runningSince,
  moneyAccountId,
  onOpen,
  onAddExpense,
  onResume,
  onOpenWrapped,
  onToast,
  onOpenAchievements,
}: LandingScreenProps) {
  const t = useT();
  const lang = useLanguage();
  const insets = useSafeAreaInsets();
  const today = useToday();
  const { width } = useWindowDimensions();

  const tasks = useTasks((s) => s.tasks);
  const log = useTasks((s) => s.log);
  const toggleMark = useTasks((s) => s.toggleMark);
  const setMark = useTasks((s) => s.setMark);
  const autoTick = useSettings((s) => s.autoTickTasks);
  const progress = useMemo(() => dayProgress(tasks, log, today), [log, tasks, today]);
  const nextTask = useMemo(
    () => nextUnansweredTask(tasks, log, today, { autoTick }),
    [autoTick, log, tasks, today],
  );

  const accounts = useMoney((s) => s.accounts);
  const amounts = useMoney((s) => s.amounts);
  const categories = useMoney((s) => s.categories);
  const currency = useSettings((s) => s.currencyCode);
  const scale = useMoneyScale();
  // U9: never an archived account — the one the money section would open on.
  const account = useMemo(
    () => landingAccount(accounts, moneyAccountId),
    [accounts, moneyAccountId],
  );
  const money = useMemo(() => {
    if (!account) return null;
    const own = inAccount(amounts, account.id);
    return {
      balance: balanceOfAccount(account, amounts),
      spent: totalsIn(own, 'month', today).expenses,
    };
  }, [account, amounts, today]);

  /* X3: last week across the three logs, from Monday until ✕ (lib/weeklyReview). */
  const workouts = useWorkoutHistory((s) => s.workouts);
  const reviewDismissed = useSettings((s) => s.weeklyReviewDismissed);
  const dismissReview = useSettings((s) => s.dismissWeeklyReview);
  const review = useMemo(
    () =>
      weeklyReviewShown(today, reviewDismissed)
        ? weeklyReview({ today, workouts, tasks, log, amounts, categories })
        : null,
    [amounts, categories, log, reviewDismissed, tasks, today, workouts],
  );

  /* E2: the level chip, only with Wave 3's switch on (`lib/engagement.ts`). */
  const view = useEngagementView();
  const level = useLevel();
  const [levelOpen, setLevelOpen] = useState(false);
  /* X4: the coach's few sentences about that week — on a tap, never on its own
     (state/weeklySummary). Held here, not persisted, and tied to the week it was
     asked about, so next Monday's card starts with the button again. */
  const engagement = useSettings(engagementOn);
  const aiStatus = useAi((s) => s.status);
  const coachOffered = weeklySummaryOffered({ engagement, aiStatus });
  const [coach, setCoach] = useState<CoachState | null>(null);
  const coachRun = useRef(0);
  const askCoach = (shown: WeeklyReview) => {
    coachRun.current += 1;
    const run = coachRun.current;
    const week = shown.week.from;
    setCoach({ week, phase: 'asking', text: '' });
    void askWeeklySummary({ review: shown, money: { currency, scale }, engagement }).then(
      (result) => {
        if (run !== coachRun.current) return;
        setCoach(
          result.kind === 'refused' ? null : { week, phase: result.kind, text: result.text },
        );
      },
    );
  };
  const coachNow = coach && review && coach.week === review.week.from ? coach : null;

  const themeId = useSettings((s) => s.themeId);
  const lastBackupAt = useSettings((s) => s.lastBackupAt);

  const workoutInProgress = runningSince != null;
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
  const chips = quickActions({
    hasAccount: account != null,
    hasNextTask: nextTask != null,
    sessionLive: workoutInProgress,
  });

  const addExpense = () => {
    if (!account) return;
    onAddExpense(
      account.id,
      quickCategoryId(categoriesFor(categories, 'expense', { pickable: true })),
    );
  };
  /* The chip moves on to the next task as soon as this one is answered, so the
     tick has to be undoable from somewhere else: the toast. */
  const tickNext = () => {
    if (!nextTask) return;
    const { id, name } = nextTask;
    const before = toggleMark(id, today);
    // A habit to avoid (T7) is "avoided", not "done", here as on its row.
    onToast(t(nextTask.avoid ? 'Avoided: {name}' : 'Done: {name}', { name }), {
      label: t('Undo'),
      onPress: () => setMark(id, today, before),
    });
  };

  const half = (width - 32 - 12) / 2;
  const wide = width - 32;

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
              maxFontSizeMultiplier={1.3}
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
                maxFontSizeMultiplier={1.3}
                style={{ flex: 1, fontSize: 34, lineHeight: 38, letterSpacing: -1 }}
                className="font-semibold text-ink"
              >
                {t(greetingFor(new Date().getHours()))}
              </Text>
              <AppMark size={46} />
            </View>
            {view.level && level ? (
              <View style={{ marginTop: 8 }}>
                <LevelChip progress={level.progress} onPress={() => setLevelOpen(true)} />
              </View>
            ) : null}
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ marginTop: 6, fontSize: 15.5, lineHeight: 21 }}
              className="text-ink-muted"
            >
              {subline}
            </Text>
          </View>

          {chips.length > 0 ? (
            <View style={{ marginTop: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {chips.map((chip) =>
                chip === 'expense' ? (
                  <QuickChip
                    key={chip}
                    lit
                    onPress={addExpense}
                    accessibilityLabel={t('Add expense')}
                    lead={<Icon name="plus" size={18} color={palette.acc} />}
                    label={t('Expense')}
                    labelColor={palette.acc}
                  />
                ) : chip === 'task' && nextTask ? (
                  <QuickChip
                    key={chip}
                    onPress={tickNext}
                    accessibilityLabel={t(
                      nextTask.avoid ? 'Mark {name} avoided' : 'Mark {name} done',
                      { name: nextTask.name },
                    )}
                    lead={
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: radius.pill,
                          borderWidth: 2,
                          borderColor: palette.inkFaint,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon
                          name={nextTask.avoid ? 'ban' : 'check'}
                          size={15}
                          color={palette.inkMuted}
                        />
                      </View>
                    }
                    label={nextTask.name}
                    labelColor={palette.ink}
                    regular
                  />
                ) : chip === 'resume' && runningSince ? (
                  <ResumeChip key={chip} startedAt={runningSince} onPress={onResume} />
                ) : null,
              )}
            </View>
          ) : null}
        </Rise>

        <View style={{ marginTop: 14, flexDirection: 'row', gap: 12 }}>
          <Door
            index={0}
            width={half}
            height={TILE_HEIGHT}
            label={`${t('Workout')}. ${nextWorkout?.name ?? t('No routine yet')}`}
            onPress={(rect) => onOpen('Workout', rect)}
          >
            <Lamp index={0} stop={1} alpha={0.45} at={{ top: -60, left: -60 }} />
            <TileBody
              glyph="fitness_center"
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
            />
          </Door>
          <Door
            index={1}
            width={half}
            height={TILE_HEIGHT}
            label={`${t('Tasks')}. ${
              progress.total === 0
                ? t('Nothing asked for today')
                : t('{done} of {total} done', { done: progress.done, total: progress.total })
            }`}
            onPress={(rect) => onOpen('Tasks', rect)}
          >
            <Lamp index={1} stop={2} alpha={0.38} at={{ top: -60, right: -60 }} />
            <TileBody
              glyph="task_alt"
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
            />
          </Door>
        </View>

        <FinanceRow
          width={wide}
          figure={money ? formatValue(money.balance, scale) : null}
          currency={currency}
          detail={
            account && money
              ? t('Finance · {account} · {spent} spent in {month}', {
                  account: account.name,
                  spent: `${formatValue(money.spent, scale)} ${currency}`,
                  month: monthName,
                })
              : `${t('Finance')} · ${t('No accounts yet')}`
          }
          label={t('Finance')}
          onPress={(rect) => onOpen('Expenses', rect)}
        />

        {/* The weekly review and the Wrapped entry (X1) take their place HERE,
            between the logs and Settings: above the fold at 360 × 800 once the
            tiles are 150 dp, which is what the shorter tiles were for. */}
        {review ? (
          <WeeklyReviewCard
            kicker={reviewKicker(review, lang)}
            columns={describeWeeklyReview(review, { currency, scale }, lang)}
            dismissLabel={t('Dismiss weekly review')}
            onDismiss={() => dismissReview(today)}
            coach={
              coachOffered
                ? {
                    state: coachNow,
                    onAsk: () => askCoach(review),
                    askLabel: t('Ask the coach for a summary'),
                    askingLabel: t('Asking the coach…'),
                    retryLabel: t('Try again'),
                    caption: t('Coach · from these figures only'),
                  }
                : undefined
            }
          />
        ) : null}
        {/* X1: last month's Wrapped in the first week of a month, the year's in
            December and January — see `lib/wrapped.ts` for the windows. */}
        <WrappedOffers onOpen={onOpenWrapped} />

        <SettingsRow
          width={wide}
          name={t('Settings')}
          detail={`${t(themeName(themeId))} · ${t('last backup {age}', {
            age: describeBackupAge(lastBackupAt, undefined, lang).toLowerCase(),
          })}`}
          onPress={(rect) => onOpen('Settings', rect)}
        />
      </ScrollView>
      {levelOpen && view.level && level ? (
        <LevelSheet
          progress={level.progress}
          lines={level.lines}
          onOpenBadges={() => {
            setLevelOpen(false);
            onOpenAchievements();
          }}
          onDismiss={() => setLevelOpen(false)}
        />
      ) : null}
    </View>
  );
}

/** The coach's summary (X4) as the card holds it: asked, answered, or failed. */
interface CoachState {
  /** The Monday of the reviewed week it was asked about. */
  week: string;
  phase: 'asking' | 'answer' | 'error';
  text: string;
}

interface CoachProps {
  /** Null until asked: the button. */
  state: CoachState | null;
  onAsk: () => void;
  askLabel: string;
  askingLabel: string;
  retryLabel: string;
  caption: string;
}

/**
 * The weekly review: a kicker with its ✕, then one column per log that had
 * something last week — a label, the figure, and the sentence under it. Not a
 * door: it is read here and has nowhere better to go, so the only targets on it
 * are the ✕ (44 dp) and, when X4 is offered, the coach's pill. Columns share the
 * width equally, so two columns read wider rather than leaving a hole where the
 * empty log would have been.
 */
function WeeklyReviewCard({
  kicker,
  columns,
  dismissLabel,
  onDismiss,
  coach,
}: {
  kicker: string;
  columns: ReviewColumn[];
  dismissLabel: string;
  onDismiss: () => void;
  /** X4, only with the engagement switch on and a tested key; absent, the card is X3. */
  coach?: CoachProps;
}) {
  return (
    <View
      style={{
        marginTop: 12,
        borderRadius: radius.sheet,
        borderWidth: 1,
        borderColor: glass.raisedEdge,
        backgroundColor: glass.raised,
        paddingTop: 14,
        paddingBottom: 16,
        paddingLeft: 16,
        paddingRight: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          style={{ flex: 1, fontSize: 12.5, letterSpacing: 1.1, textTransform: 'uppercase' }}
          className="font-semibold text-ink-faint"
        >
          {kicker}
        </Text>
        {/* 44 square, pulled into the card's padding (as the design does) so the
            kicker row stays a line tall; the press area is the whole square. */}
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
          style={({ pressed }) => [
            {
              width: 44,
              height: 44,
              marginVertical: -12,
              alignItems: 'center',
              justifyContent: 'center',
            },
            pressedStyle({ pressed }),
          ]}
        >
          <Icon name="x" size={16} color={palette.inkMuted} />
        </Pressable>
      </View>
      <View style={{ marginTop: 10, flexDirection: 'row', gap: 10, paddingRight: 8 }}>
        {columns.map((column) => (
          <View key={column.key} style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 12.5 }} className="text-ink-muted">
              {column.label}
            </Text>
            <Text
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                fontSize: column.key === 'spent' ? 20 : 26,
                lineHeight: 32,
                letterSpacing: column.key === 'spent' ? -0.4 : -0.6,
              }}
              className="font-semibold text-ink"
            >
              {column.figure}
            </Text>
            {column.line !== '' ? (
              <Text
                maxFontSizeMultiplier={1.3}
                style={{ fontSize: 13, lineHeight: 17 }}
                className="text-ink-muted"
              >
                {column.line}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      {coach ? <CoachSummary {...coach} /> : null}
    </View>
  );
}

/**
 * Under the columns: a lit 44 dp pill until tapped, then a quiet line while
 * Gemini reads, then the paragraph with a micro caption saying where it came
 * from — or the failure's sentence with Try again. No spinner and no sweep: the
 * summary is a paragraph, and it arrives like one.
 */
function CoachSummary({ state, onAsk, askLabel, askingLabel, retryLabel, caption }: CoachProps) {
  if (state === null) {
    return (
      <Pressable
        onPress={onAsk}
        accessibilityRole="button"
        style={({ pressed }) => [
          {
            marginTop: 14,
            marginRight: 8,
            minHeight: 44,
            paddingHorizontal: 14,
            borderRadius: 9999,
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: 8,
            backgroundColor: tint(0.13),
            borderWidth: 1,
            borderColor: tint(0.3),
          },
          pressedStyle({ pressed }),
        ]}
      >
        <Icon name="sparkle" size={16} color={palette.acc} />
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 14 }}
          className="font-semibold text-ink"
        >
          {askLabel}
        </Text>
      </Pressable>
    );
  }
  if (state.phase === 'asking') {
    return (
      <View style={{ marginTop: 14, minHeight: 44, justifyContent: 'center' }}>
        <Text
          maxFontSizeMultiplier={1.3}
          accessibilityLiveRegion="polite"
          style={{ fontSize: 13 }}
          className="text-ink-muted"
        >
          {askingLabel}
        </Text>
      </View>
    );
  }
  if (state.phase === 'error') {
    return (
      <View style={{ marginTop: 14, marginRight: 8, gap: 2 }}>
        <Text
          maxFontSizeMultiplier={1.3}
          accessibilityLiveRegion="polite"
          style={{ fontSize: 13, lineHeight: 17 }}
          className="text-ink-muted"
        >
          {state.text}
        </Text>
        <Pressable
          onPress={onAsk}
          accessibilityRole="button"
          style={({ pressed }) => [
            { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
            pressedStyle({ pressed }),
          ]}
        >
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ fontSize: 14, color: palette.acc }}
            className="font-semibold"
          >
            {retryLabel}
          </Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={{ marginTop: 14, marginRight: 8, gap: 4 }}>
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 12.5, letterSpacing: 0.8, textTransform: 'uppercase' }}
        className="font-semibold text-ink-faint"
      >
        {caption}
      </Text>
      <Text
        maxFontSizeMultiplier={1.3}
        accessibilityLiveRegion="polite"
        style={{ fontSize: 14, lineHeight: 20 }}
        className="text-ink"
      >
        {state.text}
      </Text>
    </View>
  );
}

/**
 * A chip in the quick-action row: 48 dp, a pill, a glyph and a word. `lit` for
 * the two that start something (the keypad, the session), glass for the task,
 * which is a row's worth of answer rather than a destination. The label is one
 * line and clamps — a task's name is the user's, and it can be a sentence.
 */
function QuickChip({
  lit = false,
  regular = false,
  lead,
  label,
  labelColor,
  accessibilityLabel,
  onPress,
}: {
  lit?: boolean;
  /** The task's name is read, not pressed: regular weight, as on its row. */
  regular?: boolean;
  lead: React.ReactNode;
  label: string;
  labelColor: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const press = usePressScale(0.96);
  return (
    <Animated.View style={{ maxWidth: '100%', transform: press.style.transform }}>
      <BubblePressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        radius={CHIP_HEIGHT / 2}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={{
          height: CHIP_HEIGHT,
          maxWidth: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingLeft: lit ? 14 : 9,
          paddingRight: 16,
          borderRadius: radius.pill,
          overflow: 'hidden',
          borderWidth: 1,
          backgroundColor: lit ? glass.green : glass.raised,
          borderColor: lit ? glass.greenEdge : glass.raisedEdge,
        }}
      >
        {lead}
        <Text
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          style={{ flexShrink: 1, fontSize: 15, color: labelColor }}
          className={regular ? undefined : 'font-semibold'}
        >
          {label}
        </Text>
      </BubblePressable>
    </Animated.View>
  );
}

/** `▶ Resume workout · 42:10` — its own component, so only it ticks each second. */
function ResumeChip({ startedAt, onPress }: { startedAt: string; onPress: () => void }) {
  const t = useT();
  const startMs = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const time = formatElapsed(Number.isFinite(startMs) ? now - startMs : 0);
  return (
    <QuickChip
      lit
      onPress={onPress}
      accessibilityLabel={t('Resume workout · {time}', { time })}
      lead={<Icon name="play" size={16} color={palette.acc} />}
      label={t('Resume workout · {time}', { time })}
      labelColor={palette.ink}
    />
  );
}

/**
 * A door into a section: the entrance, the press, and the MEASURE — the
 * section grows out of this rect, so every door, whatever its shape, hands up
 * its own window rather than a guess.
 */
function Door({
  index,
  width,
  height,
  rounded = radius.hero,
  surface = glass.raised,
  label,
  onPress,
  children,
}: {
  index: number;
  width: number;
  height: number;
  rounded?: number;
  surface?: string;
  label: string;
  onPress: (rect: TileRect | null) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<View>(null);
  const press = usePressScale(0.96);
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
        width,
        opacity: enter,
        transform: [{ translateY: enterY }, { scale: enterScale }, ...press.style.transform],
      }}
    >
      <View ref={ref} collapsable={false} style={{ borderRadius: rounded }}>
        <BubblePressable
          onPress={open}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          radius={rounded}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={{
            minHeight: height,
            borderRadius: rounded,
            overflow: 'hidden',
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: glass.raisedEdge,
          }}
        >
          {children}
        </BubblePressable>
      </View>
    </Animated.View>
  );
}

/** A corner lamp: one stop of the theme, fading out from a 220 dp disc. */
function Lamp({
  index,
  stop,
  alpha,
  at,
}: {
  index: number;
  stop: 1 | 2 | 3;
  alpha: number;
  at: object;
}) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: 220, height: 220, ...at }}>
      <Svg width={220} height={220}>
        <Defs>
          <RadialGradient id={`tileLamp${index}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={stopTint(stop, 1)} stopOpacity={alpha} />
            <Stop offset="65%" stopColor={stopTint(stop, 1)} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={110} cy={110} r={110} fill={`url(#tileLamp${index})`} />
      </Svg>
    </View>
  );
}

/** The specular line along a pane's top edge. */
function Specular() {
  return (
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
  );
}

/** The section's glyph on the commit gradient. */
function GlyphBadge({ glyph }: { glyph: SymbolName }) {
  return (
    <View
      style={{
        width: GLYPH,
        height: GLYPH,
        borderRadius: 15,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <LinearGradient
        {...gradientFill()}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <MaterialSymbol name={glyph} size={26} color={palette.onAcc} filled />
    </View>
  );
}

/** A half tile's contents: glyph and extra on top, kicker, name and detail at the foot. */
function TileBody({
  glyph,
  extra,
  kicker,
  name,
  detail,
}: {
  glyph: SymbolName;
  extra: React.ReactNode;
  kicker: string;
  name: string;
  detail: string;
}) {
  return (
    <View style={{ flex: 1, minHeight: TILE_HEIGHT - 2, padding: 16 }}>
      <Specular />
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <GlyphBadge glyph={glyph} />
        {extra}
      </View>
      <View style={{ marginTop: 'auto', paddingTop: 8, minWidth: 0 }}>
        <RunningText
          text={kicker}
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 12.5, lineHeight: 16, letterSpacing: 1.1, color: palette.acc }}
          className="font-semibold uppercase"
          fadeColor={FADE_ON.card}
        />
        <Text
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          style={{ marginTop: 2, fontSize: 21, lineHeight: 26, letterSpacing: -0.5 }}
          className="font-semibold text-ink"
        >
          {name}
        </Text>
        <RunningText
          text={detail}
          maxFontSizeMultiplier={1.3}
          containerStyle={{ marginTop: 2 }}
          style={{ fontSize: 14, lineHeight: 19 }}
          className="text-ink-muted"
          fadeColor={FADE_ON.card}
        />
      </View>
    </View>
  );
}

/**
 * Finance, full width: the balance is the one figure on the landing that wants
 * room, and a half tile sized it down to 16 dp past seven digits.
 */
function FinanceRow({
  width,
  figure,
  currency,
  detail,
  label,
  onPress,
}: {
  width: number;
  figure: string | null;
  currency: string;
  detail: string;
  label: string;
  onPress: (rect: TileRect | null) => void;
}) {
  /* The figure's room: the row less its padding, glyph, gaps, chevron and code. */
  const room = width - 32 - GLYPH - 14 - 14 - 22 - (currency.length * 9 + 6);
  return (
    <View style={{ marginTop: 12 }}>
      <Door
        index={2}
        width={width}
        height={WIDE_HEIGHT}
        label={figure ? `${label}. ${figure} ${currency}. ${detail}` : `${label}. ${detail}`}
        onPress={onPress}
      >
        <Lamp index={2} stop={3} alpha={0.34} at={{ bottom: -90, left: -50 }} />
        <Specular />
        <View
          style={{
            flex: 1,
            minHeight: WIDE_HEIGHT - 2,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingLeft: 16,
            paddingRight: 14,
            paddingVertical: 16,
          }}
        >
          <GlyphBadge glyph="account_balance_wallet" />
          <View style={{ flex: 1, minWidth: 0 }}>
            {figure != null ? (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text
                  allowFontScaling={false}
                  numberOfLines={1}
                  /* Sized from the figure, not `adjustsFontSizeToFit`: on Android
                     the first fit runs before the row has a width, and the number
                     opened the size of a full stop. */
                  style={{
                    flexShrink: 1,
                    fontSize: figureFontSize(figure, room, 30),
                    lineHeight: 34,
                    letterSpacing: -1,
                    fontVariant: ['tabular-nums'],
                  }}
                  className="font-semibold text-ink"
                >
                  {figure}
                </Text>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={{ fontSize: 12.5, letterSpacing: 1.1, color: palette.acc }}
                  className="font-semibold"
                >
                  {currency}
                </Text>
              </View>
            ) : null}
            <RunningText
              text={detail}
              maxFontSizeMultiplier={1.3}
              containerStyle={{ marginTop: figure != null ? 2 : 0 }}
              style={{ fontSize: 14, lineHeight: 19 }}
              className="text-ink-muted"
              fadeColor={FADE_ON.card}
            />
          </View>
          <Icon name="chevron-right" size={18} color={palette.inkFaint} />
        </View>
      </Door>
    </View>
  );
}

/** Settings at the foot: 56 dp, the theme's three colours, and where the backup stands. */
function SettingsRow({
  width,
  name,
  detail,
  onPress,
}: {
  width: number;
  name: string;
  detail: string;
  onPress: (rect: TileRect | null) => void;
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Door
        index={3}
        width={width}
        height={ROW_HEIGHT}
        rounded={radius.row}
        surface={glass.sunken}
        label={`${name}. ${detail}`}
        onPress={onPress}
      >
        <View
          style={{
            flex: 1,
            minHeight: ROW_HEIGHT,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingLeft: 16,
            paddingRight: 12,
          }}
        >
          <MaterialSymbol name="settings" size={22} color={palette.inkMuted} />
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            style={{ fontSize: 16.5 }}
            className="text-ink"
          >
            {name}
          </Text>
          <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
            <Text
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              style={{ fontSize: 13 }}
              className="text-ink-muted"
            >
              {detail}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {[palette.c1, palette.c2, palette.c3].map((color, i) => (
              <View
                key={i}
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }}
              />
            ))}
          </View>
          <Icon name="chevron-right" size={18} color={palette.inkFaint} />
        </View>
      </Door>
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
        maxFontSizeMultiplier={1.3}
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
      <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 12.5 }} className="font-bold text-ink">
        {label}
      </Text>
    </View>
  );
}
