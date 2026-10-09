/**
 * HomeScreen — what do I train today.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ WORKOUT                   ✦    ≡   📖    ⟲   │  ← glass bar, content under
 *   │ ( SEQUENCE  3/4 · then Push              › ) │  ← folded; › opens it
 *   │ ╭──────────────────────────────────────────╮ │
 *   │ │ TODAY · PULL                  ( 1 nudge )│ │  ← the hero, `lit` glass
 *   │ │ Pull + swimming                          │ │
 *   │ │ back, biceps · 8 exercises · 25 sets     │ │
 *   │ │ ────────────────────────                 │ │
 *   │ │ EXERCISES   SETS        WORKOUT          │ │
 *   │ │ 8           25          #92              │ │
 *   │ ╰──────────────────────────────────────────╯ │
 *   │ OTHER ROUTINES                               │
 *   │ ╭ Push            Push · chest · 2 ex   ▶ ╮  │
 *   │ ╭ Boxing (cardio) Cardio · 2 ex          ▶ ╮  │
 *   │ RECENT                                       │
 *   │ │ #91  Pull + swimming     8 Aug · 74 min │  │
 *   │                                      ( ▶ )   │  ← the floating slot, icon only
 *   └──────────────────────────────────────────────┘
 *
 * THE USER PICKS THE WORKOUT. Every routine is on this screen and every one of
 * them is one tap from opening, because "the queue says pull but the pull-up bar
 * is taken" is a normal Tuesday. A tracker that can only start the workout it
 * planned for you is a tracker you stop using the first time you do something
 * else.
 *
 * The sequence — push → pull → push, in whatever order you actually train — is
 * OPTIONAL and off until it is built (see `TrainingSequence`). While it is off,
 * nothing about it appears here: the screen is the routine list and the recent
 * log, and no routine is privileged. While it is on it adds exactly one thing: a
 * hero naming the routine whose turn it is. It still only suggests.
 *
 * `Open`, not `Start`: opening a routine shows its exercises without timing or
 * dating anything. The workout starts on the `Start` inside it — see
 * `ActiveWorkoutScreen`.
 *
 * ── THE BUTTON LEFT THE CARD ──────────────────────────────────────────────
 *
 * `Open Pull + swimming` was a 56-high green slab inside the hero. Two things
 * were wrong with it and both are placement rules now: a full-width bar inside
 * the scroll flow competes with the container it is in, and it SCROLLS AWAY —
 * the one action the screen exists for stops existing the moment you look at the
 * routine list under it. It is the floating action at `right: 16, bottom: 102`
 * now, the same slot the other sections put their own commit action in, and it
 * is on screen at every scroll position. Since v3 it is a 64 dp ▶ with no word
 * on it: the routine's name is already the hero's headline right above, and
 * `Open Pull + swimming` spoken as its accessibility label still says it.
 *
 * "1 nudge waiting" is the only forward-looking number on the screen, and it is
 * a count of facts, not a nag: it tells you a weight has gone stale before you
 * are standing under the bar deciding what to load.
 *
 * ── THE MOTION PASS ───────────────────────────────────────────────────────
 *
 *   • A SKELETON, while the log has not been read (`workoutHistoryStore.ready`):
 *     a hero block, two rows and a well, each with a shimmer sweeping over it.
 *     An empty screen that fills itself in is a screen that looked, for a
 *     moment, like the app had forgotten your training.
 *   • THE HERO'S HALO BREATHES, 26 → 44 dp over six seconds, and it gained a
 *     fourth stat: `LAST · 6 Sep`, when this routine was last done. `#92` rolls
 *     when it changes.
 *   • The routine rows arrive one after another, 70 ms apart.
 *   • A workout in progress gets a ring — the share of its sets done — and its
 *     name runs rather than wrapping.
 *   • SAVING A WORKOUT comes back here, and the hero throws sparks while the new
 *     row grows into Recent.
 *   • THE BUBBLE. Scroll the hero away and it follows you as a capsule at the top:
 *     `#92`, the routine, its size, and a ▶ — or, mid-workout, the share done in a
 *     ring, the clock ticking and the sets counting as they are logged.
 *     `components/FloatingBubble.tsx` is the shell all three sections share.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';

import { AiEntryCard } from '../components/AiEntryCard';
import { DebriefCard } from '../components/DebriefSheet';
import { Icon } from '../components/Icon';
import { SectionTopBar } from '../components/SectionTopBar';
import { SparkBurst, SPARK_MS } from '../components/SparkBurst';
import { WeeklyGoalCard, WeeklyGoalSheet } from '../components/WeeklyGoal';
import { BubblePressable } from '../components/bubbles';
import { FloatingBubble, useHeroRecede } from '../components/FloatingBubble';
import {
  FloatingAction,
  GlassSurface,
  Lamps,
  SpecularEdge,
  useBarInsets,
} from '../components/glass';
import { GrowIn, Reveal, Stagger, pressedStyle, usePressScale } from '../components/motion';
import { Kicker, PrimaryButton } from '../components/primitives';
import { Pressable } from '../components/Pressable';
import { RollingNumber, RollingPhrase } from '../components/RollingNumber';
import { FADE_ON, RunningText } from '../components/RunningText';
import { useBubbleOnScroll } from '../hooks/useBubbleOnScroll';
import { useArrived } from '../hooks/useArrived';
import { useMotionScale } from '../hooks/useMotionScale';
import { useLanguage, usePlural, useT } from '../hooks/useT';
import { formatElapsed, formatShortDate, formatVolumeKg } from '../lib/units';
import { isResting, useActiveWorkout, useSessionProgress } from '../state/activeWorkoutStore';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import {
  curve,
  focalType,
  gradientFill,
  motion,
  palette,
  radius,
  stopTint,
  tint,
} from '../theme/tokens';
import type { ID, RecentSessionSummary } from '../types/models';

/**
 * The second line of a routine or a Recent row — a step below `ink-muted`,
 * because the muted one competes with the name above it. It was #6B766F, between
 * the old faint and muted; the raised `inkFaint` (U3) is that step now, and
 * legible on a bench where #6B766F (4.3:1) was not quite.
 */
const DETAIL_INK = palette.inkFaint;

/** One routine, described well enough to choose it without opening it. */
export interface RoutineChoice {
  routineId: ID;
  name: string;
  /**
   * "Pull · back, biceps" — which movement family it is, derived from the
   * exercises rather than from the routine's name. Null when nothing is filed.
   */
  focus: string | null;
  exerciseCount: number;
  setCount: number;
  /** When it was last trained, for the hero's `LAST` stat. Null if never. */
  lastTrainedAt: string | null;
  /** Made by the assistant and not opened yet — the row's `AI` pill. */
  isAi?: boolean;
}

export interface NextUpPlan extends RoutineChoice {
  /** Exercises with a stale weight the overload engine wants to report. */
  nudgeCount: number;
}

/** The sequence as this screen needs it. Absent whenever it is off or empty. */
export interface SequenceView {
  /** Every step in order, the current one marked. Repeats are normal. */
  steps: { key: string; name: string; isCurrent: boolean }[];
  /** The routine whose turn it is, or null if that step no longer resolves. */
  next: NextUpPlan | null;
}

/** A workout that has been started and not finished, if there is one. */
export interface WorkoutInProgress {
  title: string;
  /** When it started — the in-progress card and the bubble tick from it. */
  startedAt: string;
  done: number;
  total: number;
}

/**
 * What the shell hands down about the running workout: which one, and since when.
 *
 * NOT its set counts. Those move on every ✓, and the shell reading them meant
 * every set logged re-rendered the whole shell — every route, every memo check —
 * in the same frame as the tick's flash and the rest starting. This screen reads
 * them itself (`useSessionProgress`), so a ✓ repaints the card that shows them.
 */
export type RunningWorkout = Pick<WorkoutInProgress, 'title' | 'startedAt'>;

interface HomeScreenProps {
  /**
   * The workout already running, if any. It gets the top of the screen and the
   * floating slot, because while one exists every routine row leads back to IT
   * rather than to the routine that was tapped — a live session is never
   * clobbered, and the user has to be able to see why.
   */
  inProgress: RunningWorkout | null;
  sequence: SequenceView | null;
  /** Every routine, in list order. */
  choices: RoutineChoice[];
  recent: RecentSessionSummary[];
  /**
   * Workout ordinals, keyed by session id — the same numbers History shows, so
   * "workout 92" means one thing everywhere. See `workoutNumbers`.
   */
  numbers: Record<ID, number>;
  onOpen: (routineId: ID) => void;
  /** Back to the logging screen of the workout in progress. */
  onResume: () => void;
  /** Tapping a step in the opened sequence goes to the screen that edits it. */
  onOpenSequence: () => void;
  onOpenSession: (sessionId: string) => void;
  /** The ⟲ in the corner: the log, the graphs and the calendar. */
  onOpenHistory: () => void;
  /**
   * The screens the training log is set up from — the routines and the exercise
   * library, one destination since U23 (`Routines & exercises`, opening on the
   * routines; its own switch has the exercises).
   *
   * They had a tab of their own, then a lobby screen called `More`, then two rows
   * at the FOOT of this screen, then two glyphs in the corner that looked alike.
   * One glyph now, between the assistant and the ⟲: see
   * `components/SectionTopBar.tsx`.
   */
  onOpenRoutines: () => void;
  /**
   * Make an empty routine and open its editor — the empty screen's way forward
   * (U12), the same create the Routines list's `Add routine` does.
   */
  onNewRoutine: () => void;
  /** A key has passed its test: the sparkle is lit. See `components/AiEntryCard.tsx`. */
  aiReady: boolean;
  /** The training chat, asking `prompt` if a chip was tapped. */
  onOpenAi: (prompt?: string) => void;
  /**
   * The workout that was just saved, if this screen is what the save came back
   * to: the hero throws its sparks and the new row grows into Recent. Cleared
   * through `onCelebrated` once it has played.
   */
  justSaved?: { id: ID; at: number } | null;
  onCelebrated?: () => void;
}

export function HomeScreen({
  inProgress: running,
  sequence,
  choices,
  recent,
  numbers,
  onOpen,
  onResume,
  onOpenSequence,
  onOpenSession,
  onOpenHistory,
  onOpenRoutines,
  onNewRoutine,
  aiReady,
  onOpenAi,
  justSaved = null,
  onCelebrated,
}: HomeScreenProps) {
  const t = useT();
  const plural = usePlural();
  const progress = useSessionProgress();
  const inProgress = useMemo<WorkoutInProgress | null>(
    () => (running ? { ...running, done: progress.done, total: progress.total } : null),
    [progress.done, progress.total, running],
  );
  const bars = useBarInsets();
  const next = sequence?.next ?? null;
  /*
   * An empty routine has nothing to open — a ▶ that lands on an editor is a
   * button that lies. Empty ones live in the `Routines` tab, which is where they
   * get filled in. The hero routine already has the floating slot.
   */
  const others = useMemo(
    () =>
      choices.filter((choice) => choice.routineId !== next?.routineId && choice.exerciseCount > 0),
    [choices, next?.routineId],
  );

  /*
   * What the workout about to be logged will be numbered. Derived here rather
   * than passed, because `numbers` is already on this screen for the RECENT
   * rows and the next ordinal is one `max` away from it — a second prop carrying
   * the same fact is a second thing that can disagree with the history screen.
   */
  const ordinals = Object.values(numbers);
  const nextNumber = ordinals.length > 0 ? Math.max(...ordinals) + 1 : 1;

  /*
   * THE FLOATING SLOT IS NEVER EMPTY, and what fills it is the one thing this
   * screen is for. A live session outranks everything — it is the workout you
   * are actually in — then the routine whose turn it is, then simply the first
   * one that has exercises in it. A phone with no usable routine at all gets
   * `+ New routine` there (U12), beside an empty card that says so in words.
   */
  const openable = next ?? others[0] ?? null;

  /* The log has been read — until then, the skeleton. See the file header. */
  const ready = useWorkoutHistory((s) => s.ready);

  /* The bubble, and the hero stepping back while it is up. */
  /*
   * 300 up, 250 down: the hero is ~260 tall under a strip, so the pill arrives
   * as the card's last row leaves, and the 50 of hysteresis keeps a thumb
   * resting near the line from making it flicker.
   */
  const {
    visible: bubbleUp,
    fabHidden,
    onScroll,
    scrollRef,
    scrollToTop,
  } = useBubbleOnScroll(300, 250);
  const heroRecede = useHeroRecede(bubbleUp);

  /* The weekly goal's sheet (W8), opened from its ring. */
  const [goalOpen, setGoalOpen] = useState(false);

  /*
   * THE CELEBRATION, once, on the mount a save came back to. The id is held for
   * the Recent row that grows in; the sparks run for as long as they take.
   *
   * Read on ARRIVAL, which for a mount at arrival is the mount: a section built
   * ahead (`hooks/useArrived.ts`) would otherwise have read the save from before
   * it happened, or thrown the sparks where nobody could see them. `undefined`
   * is "not read yet".
   */
  const arrived = useArrived();
  const saveNow = () =>
    justSaved != null && Date.now() - justSaved.at < 4000 ? justSaved.id : null;
  const [celebrating, setCelebrating] = useState<ID | null | undefined>(() =>
    arrived ? saveNow() : undefined,
  );
  if (arrived && celebrating === undefined) setCelebrating(saveNow());
  const [sparksDone, setSparksDone] = useState(false);
  const sparks = celebrating != null && !sparksDone;
  useEffect(() => {
    if (celebrating == null) return undefined;
    onCelebrated?.();
    const timer = setTimeout(() => setSparksDone(true), SPARK_MS);
    return () => clearTimeout(timer);
    // Once: `celebrating` is set a single time, and this is about the save that
    // brought the screen here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrating]);

  /*
   * THE LIST, MEMOIZED ON EVERYTHING BUT THE BUBBLE. The bubble's flag is this
   * screen's own state and it flips mid-fling, twice per trip down the page; as
   * plain JSX, each flip re-rendered every row, marquee and card under the thumb
   * in the frame the bubble's entrance starts. Nothing in here reads it.
   */
  const list = useMemo(
    () =>
      !ready ? (
        <Skeleton />
      ) : (
        <>
          {inProgress ? (
            <Animated.View style={next ? undefined : heroRecede}>
              <InProgressCard progress={inProgress} onPress={onResume} />
            </Animated.View>
          ) : null}

          {sequence ? <SequenceStrip sequence={sequence} onPress={onOpenSequence} /> : null}

          {next ? (
            <Animated.View style={heroRecede}>
              <Hero plan={next} number={nextNumber} plural={plural} />
            </Animated.View>
          ) : null}

          {/* W8: off unless the Wave 3 switch is on — see `lib/weeklyGoal.ts`. */}
          <WeeklyGoalCard onPress={() => setGoalOpen(true)} />

          <DebriefCard />

          <AiEntryCard section="Workout" ready={aiReady} onOpen={onOpenAi} />

          {others.length > 0 ? (
            <>
              <Kicker className="mx-lg mb-kicker-gap mt-kicker">
                {next ? t('Other routines') : t('Start a workout')}
              </Kicker>
              <View className="mx-lg" style={{ gap: 8 }}>
                {others.map((choice, index) => (
                  <Stagger key={choice.routineId} delay={120 + index * 70}>
                    <ChoiceRow choice={choice} onPress={() => onOpen(choice.routineId)} />
                  </Stagger>
                ))}
              </View>
            </>
          ) : null}

          {others.length === 0 && !next ? (
            <Empty
              first={choices.length === 0}
              onNewRoutine={onNewRoutine}
              onOpenRoutines={onOpenRoutines}
            />
          ) : null}

          {recent.length > 0 ? (
            <>
              <Kicker className="mx-lg mb-kicker-gap mt-kicker">{t('Recent')}</Kicker>
              {/* One `well` holding all of them, and the only surface on this
                screen that is a container rather than a card: the past is
                context, and eight lit panes of it would out-shout the hero. */}
              <GlassSurface tier="well" radius={radius.row} flat className="mx-lg">
                {recent.map((session, index) => (
                  /* Keyed on the celebration too: `appear` is latched when a row
                     mounts, and in a section built ahead the saved row can mount
                     before the arrival that decides it is the one to grow. */
                  <GrowIn
                    key={`${session.id}:${session.id === celebrating}`}
                    appear={session.id === celebrating}
                    duration={500}
                  >
                    <RecentRow
                      session={session}
                      number={numbers[session.id]}
                      divided={index > 0}
                      onPress={() => onOpenSession(session.id)}
                    />
                  </GrowIn>
                ))}
              </GlassSurface>
            </>
          ) : null}
        </>
      ),
    [
      aiReady,
      celebrating,
      choices.length,
      heroRecede,
      inProgress,
      next,
      nextNumber,
      numbers,
      onNewRoutine,
      onOpen,
      onOpenAi,
      onOpenRoutines,
      onOpenSequence,
      onOpenSession,
      onResume,
      others,
      plural,
      ready,
      recent,
      sequence,
      t,
    ],
  );

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <Lamps section="Workout" />

      {/* Three destinations, one size, left to right: the assistant, routines
          & exercises, the past. See `components/SectionTopBar.tsx` on why they are up here
          and why a commit action never is. */}
      <SectionTopBar
        title={t('Workout')}
        actions={[
          {
            key: 'ai',
            icon: 'sparkle',
            label: t('Open the AI assistant'),
            lit: aiReady,
            onPress: () => onOpenAi(),
          },
          /* ONE door for both (U23): the routines and the exercise library
             were two glyphs that looked alike. It opens on the routines, and
             the screen's own switch has the exercises — see
             `lib/discoverability.ts` (`WORKOUT_CORNER`). */
          {
            key: 'library',
            icon: 'library',
            label: t('Routines & exercises'),
            onPress: onOpenRoutines,
          },
        ]}
        onOpenHistory={onOpenHistory}
        historyLabel={t('Training history')}
      />

      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        className="flex-1"
        contentContainerStyle={{ paddingTop: bars.top, paddingBottom: bars.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {list}
      </ScrollView>

      {/* The workout just saved, celebrated from the hero's band. */}
      {sparks ? <SparkBurst y={bars.top + 110} /> : null}

      {/* THE BUBBLE — the hero, carried along once it has scrolled away. */}
      {ready && (inProgress || openable) ? (
        <WorkoutBubble
          visible={bubbleUp}
          inProgress={inProgress}
          plan={openable}
          number={nextNumber}
          onTop={scrollToTop}
          onPlay={inProgress ? onResume : () => openable && onOpen(openable.routineId)}
        />
      ) : null}

      {/* THE ONE COMMIT ACTION, in the slot every section shares. */}
      {inProgress ? (
        <FloatingAction
          round
          hidden={fabHidden}
          label={t('Back to {name}', { name: inProgress.title })}
          icon="play"
          onPress={onResume}
        />
      ) : openable ? (
        <FloatingAction
          round
          hidden={fabHidden}
          label={t('Open {name}', { name: openable.name })}
          icon="play"
          onPress={() => onOpen(openable.routineId)}
        />
      ) : ready ? (
        /* Nothing to open, so the slot offers the step before opening (U12):
           `+` where every other section's `+` is. Waits for the log, like the
           empty card it goes with. */
        <FloatingAction
          round
          hidden={fabHidden}
          label={t('New routine')}
          icon="plus"
          onPress={onNewRoutine}
        />
      ) : null}

      {goalOpen ? <WeeklyGoalSheet onDismiss={() => setGoalOpen(false)} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The shape of the screen, before the log has been read: a hero block, a label,
 * two rows, a label and a well, each with a light sweeping over it. Nothing in it
 * is a number that could be mistaken for data.
 */
function Skeleton() {
  const t = useT();
  return (
    <View accessible accessibilityLabel={t('Loading your training log')}>
      <Shimmer height={196} radius={radius.hero} marginTop={10} delay={0} />
      <View
        style={{ marginTop: 22, marginHorizontal: 16, marginBottom: 10, width: 110, height: 10 }}
        className="rounded-[6px] bg-ink/5"
      />
      <Shimmer height={68} radius={radius.row} delay={100} />
      <Shimmer height={68} radius={radius.row} marginTop={8} delay={100} />
      <View
        style={{ marginTop: 22, marginHorizontal: 16, marginBottom: 10, width: 70, height: 10 }}
        className="rounded-[6px] bg-ink/5"
      />
      <Shimmer height={180} radius={radius.row} delay={200} faint />
    </View>
  );
}

/**
 * One skeleton block, and the light across it: a gradient strip translated from
 * off the left edge to off the right over 1.3 s, looped, native-driven. Still,
 * with reduced motion on — the block is the information; the sweep is not.
 */
function Shimmer({
  height,
  radius: corner,
  marginTop = 0,
  delay,
  faint = false,
}: {
  height: number;
  radius: number;
  marginTop?: number;
  delay: number;
  faint?: boolean;
}) {
  const { width } = useWindowDimensions();
  const scale = useMotionScale();
  const sweep = useRef(new Animated.Value(0)).current;
  const arrived = useArrived();
  useEffect(() => {
    if (scale === 0 || !arrived) return undefined;
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1300,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const start = setTimeout(() => loop.start(), delay);
    return () => {
      clearTimeout(start);
      loop.stop();
    };
  }, [arrived, delay, scale, sweep]);

  const strip = 300;
  const sweepX = useMemo(
    () => sweep.interpolate({ inputRange: [0, 1], outputRange: [-strip, width] }),
    [strip, sweep, width],
  );
  return (
    <View
      style={{
        marginTop,
        marginHorizontal: 16,
        height,
        borderRadius: corner,
        overflow: 'hidden',
        backgroundColor: faint ? 'rgba(236,241,238,0.025)' : 'rgba(236,241,238,0.035)',
      }}
    >
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: strip,
          transform: [
            {
              translateX: sweepX,
            },
          ],
        }}
      >
        <LinearGradient
          colors={[
            'rgba(236,241,238,0)',
            faint ? 'rgba(236,241,238,0.06)' : 'rgba(236,241,238,0.08)',
            'rgba(236,241,238,0)',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

/**
 * The workout already running: where it is up to, and one tap back to it.
 *
 *   ╭──────────────────────────────────────╮
 *   │ IN PROGRESS · 12:04          ╭──╮    │
 *   │ Pull + swimming (tension o░  │42│    │  ← the ring: the share of sets done
 *   │ 3 of 17 sets · resting       ╰──╯    │
 *   ╰──────────────────────────────────────╯
 *
 * The whole card resumes the session — it was a statement with the way back in
 * the floating slot, and a card that says "in progress" and does nothing when
 * pressed is a card people press anyway.
 */
function InProgressCard({
  progress,
  onPress,
}: {
  progress: WorkoutInProgress;
  onPress: () => void;
}) {
  const t = useT();
  const press = usePressScale(0.98);
  const resting = useActiveWorkout((s) => isResting(s.rest));
  const fraction = progress.total > 0 ? progress.done / progress.total : 0;

  return (
    <Animated.View
      style={{ marginHorizontal: 16, marginTop: 10, transform: press.style.transform }}
    >
      <GlassSurface tier="lit" radius={radius.hero} shadow="e2" flat>
        <Pressable
          onPress={onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          accessibilityRole="button"
          accessibilityLabel={`${t('In progress')}: ${progress.title}. ${t(
            '{done} of {total} sets',
            {
              done: progress.done,
              total: progress.total,
            },
          )}. ${t('Back to the workout')}`}
          className="flex-row items-center px-[20px] py-[18px]"
        >
          <View className="mr-[14px] flex-1" style={{ minWidth: 0 }}>
            <View className="flex-row items-center">
              <Kicker tone="green">{`${t('In progress')} · `}</Kicker>
              <TickingClock startedAt={progress.startedAt} className="text-green-bright" />
            </View>
            <RunningText
              text={progress.title}
              fadeColor={FADE_ON.lit}
              containerStyle={{ marginTop: 8 }}
              className="text-title font-medium text-ink"
            />
            <View className="mt-xs flex-row items-center">
              <RollingPhrase
                template={t('{done} of {total} sets', { total: progress.total })}
                values={{ done: progress.done }}
                lineHeight={18}
                className="text-label text-ink-muted"
              />
              {resting ? (
                <Text className="text-label text-ink-muted">{` · ${t('resting')}`}</Text>
              ) : null}
            </View>
          </View>
          <ProgressDial fraction={fraction} size={52} stroke={4}>
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ fontSize: 12.5 }}
              className="font-semibold tabular-nums text-green-bright"
            >
              {`${Math.round(fraction * 100)}%`}
            </Text>
          </ProgressDial>
        </Pressable>
      </GlassSurface>
    </Animated.View>
  );
}

/** A clock counting up from `startedAt`, ticking once a second and only itself. */
function TickingClock({ startedAt, className }: { startedAt: string; className?: string }) {
  const startMs = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <Text
      maxFontSizeMultiplier={1.3}
      className={['text-micro font-semibold uppercase tabular-nums', className ?? ''].join(' ')}
    >
      {formatElapsed(Number.isFinite(startMs) ? now - startMs : 0)}
    </Text>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * A progress ring whose arc TRAVELS to its share (`motion.ring`), for the
 * in-progress card and the bubble's badge. JS-driven: `strokeDashoffset` is an
 * SVG prop, not a transform.
 */
function ProgressDial({
  fraction,
  size,
  stroke,
  track = palette.greenDim,
  children,
}: {
  fraction: number;
  size: number;
  stroke: number;
  /** Null for no track at all — the bubble's badge draws only the arc. */
  track?: string | null;
  children?: ReactNode;
}) {
  const scale = useMotionScale();
  const clamped = Math.max(0, Math.min(1, fraction));
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const v = useRef(new Animated.Value(clamped)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: clamped,
      duration: motion.ring * scale,
      easing: curve(motion.ease),
      useNativeDriver: false,
    }).start();
  }, [clamped, scale, v]);
  const ringOffset = useMemo(
    () => v.interpolate({ inputRange: [0, 1], outputRange: [length, 0] }),
    [length, v],
  );
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg
        width={size}
        height={size}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        {track ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={track}
            strokeWidth={stroke}
          />
        ) : null}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={palette.greenBright}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={ringOffset}
        />
      </Svg>
      {children}
    </View>
  );
}

/**
 * THE WORKOUT BUBBLE — the hero at a tenth of its size.
 *
 *   ╭──────────────────────────────────────────╮
 *   │ ( #92 )  UP NEXT · WORKOUT          ( ▶ ) │
 *   │          Pull + swimming (tensi░          │
 *   │          5 exercises · 17 sets            │
 *   ╰──────────────────────────────────────────╯
 *
 * Mid-workout the same capsule changes on the fly: the badge becomes the share
 * done with a ring filling around it, the kicker ticks the elapsed clock, the
 * line counts sets as they are logged, and ▶ goes back to the session. The badge
 * and the text scroll back up to the hero they stand in for.
 */
function WorkoutBubble({
  visible,
  inProgress,
  plan,
  number,
  onTop,
  onPlay,
}: {
  visible: boolean;
  inProgress: WorkoutInProgress | null;
  plan: RoutineChoice | null;
  number: number;
  onTop: () => void;
  onPlay: () => void;
}) {
  const t = useT();
  const fraction = inProgress && inProgress.total > 0 ? inProgress.done / inProgress.total : 0;
  const name = inProgress ? inProgress.title : (plan?.name ?? '');
  const spoken = inProgress
    ? `${t('In progress')}: ${name}, ${t('{done} of {total} sets', {
        done: inProgress.done,
        total: inProgress.total,
      })}. ${t('Back to the workout')}.`
    : `${t('Workout {number}', { number })}, ${name}, ${t('{exercises} exercises · {sets} sets', {
        exercises: plan?.exerciseCount ?? 0,
        sets: plan?.setCount ?? 0,
      })}. ${t('Open')}.`;

  return (
    <FloatingBubble
      visible={visible}
      width={338}
      contentStyle={{ gap: 10 }}
      accessibilityLabel={spoken}
    >
      <Pressable
        onPress={onTop}
        accessibilityRole="button"
        accessibilityLabel={t('Back to the top')}
        style={{
          width: 50,
          height: 50,
          borderRadius: 9999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tint(0.2),
          borderWidth: 1,
          borderColor: tint(0.38),
        }}
      >
        {inProgress ? (
          <View style={{ position: 'absolute', top: -1, left: -1 }}>
            <ProgressDial fraction={fraction} size={50} stroke={2.5} track={null} />
          </View>
        ) : null}
        <RollingNumber
          value={inProgress ? `${Math.round(fraction * 100)}%` : `#${number}`}
          lineHeight={18}
          duration={inProgress ? 600 : 800}
          style={{ fontSize: 14 }}
          className="font-bold text-green-bright"
        />
      </Pressable>

      <Pressable
        onPress={onTop}
        accessibilityRole="button"
        accessibilityLabel={t('Back to the top')}
        style={{ width: 158 }}
      >
        <View className="flex-row items-center">
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            style={{ fontSize: 12.5, letterSpacing: 1.1 }}
            className="font-semibold uppercase text-acc"
          >
            {inProgress ? `${t('In progress')} · ` : `${t('Up next')} · ${t('Workout')}`}
          </Text>
          {inProgress ? <TickingClockSmall startedAt={inProgress.startedAt} /> : null}
        </View>
        <RunningText
          text={name}
          fadeColor="#171C1A"
          containerStyle={{ marginTop: 2 }}
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 16, lineHeight: 20 }}
          className="font-semibold text-ink"
        />
        {inProgress ? (
          <RollingPhrase
            template={t('{done} of {total} sets', { total: inProgress.total })}
            values={{ done: inProgress.done }}
            lineHeight={16}
            duration={500}
            containerStyle={{ marginTop: 1 }}
            style={{ fontSize: 12.5 }}
            className="text-ink-muted"
          />
        ) : (
          <RollingPhrase
            template={t('{exercises} exercises · {sets} sets')}
            values={{ exercises: plan?.exerciseCount ?? 0, sets: plan?.setCount ?? 0 }}
            lineHeight={16}
            duration={500}
            containerStyle={{ marginTop: 1 }}
            style={{ fontSize: 12.5 }}
            className="text-ink-muted"
          />
        )}
      </Pressable>

      <PlayButton
        onPress={onPlay}
        label={inProgress ? t('Back to the workout') : t('Open {name}', { name })}
      />
    </FloatingBubble>
  );
}

/** The bubble's kicker clock: 10.5 px, in the accent, ticking. */
function TickingClockSmall({ startedAt }: { startedAt: string }) {
  const startMs = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <Text
      maxFontSizeMultiplier={1.3}
      style={{ fontSize: 12.5, letterSpacing: 1.1 }}
      className="font-semibold tabular-nums text-acc"
    >
      {formatElapsed(Number.isFinite(startMs) ? now - startMs : 0)}
    </Text>
  );
}

/**
 * The bubble's ▶: 50 dp of the commit gradient. Sinks to 0.9. The glyph is
 * `onAcc` — ink on a light theme's gradient is the one pairing that vanishes.
 */
function PlayButton({ onPress, label }: { onPress: () => void; label: string }) {
  const press = usePressScale(0.9);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Animated.View
        style={{
          width: 50,
          height: 50,
          borderRadius: 9999,
          transform: press.style.transform,
        }}
      >
        <View
          style={{
            flex: 1,
            borderRadius: 9999,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LinearGradient
            {...gradientFill()}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <SpecularEdge color="rgba(255,255,255,0.3)" radius={9999} />
          <SolidPlay size={18} color={palette.onAcc} />
        </View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * The repo's ▶, FILLED, as the floating action draws it. `Icon` strokes only,
 * and an outlined triangle at 15–18 dp reads as a hollow glyph on a pill that
 * is otherwise solid. Nudged 2 dp right onto the circle's optical centre.
 */
function SolidPlay({ size, color }: { size: number; color: string }) {
  return (
    <View style={{ marginLeft: 2 }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M8 5.5l11 6.5-11 6.5z"
          fill={color}
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

/**
 * The routine whose turn it is, as the one hero on the screen.
 *
 * `lit` glass over the section's brightest lamp, which is what the depth stack
 * is for: the card does not carry its own highlight, it is a translucent pane
 * with the light already behind it. The name is the only thing on this screen at
 * `hero-name` — one hero per screen is the rule the focal steps exist to keep.
 *
 * The three stats are a fact each, in a row, and none of them is new data: the
 * exercise and set counts came with the plan, and the ordinal is one `max` off
 * the numbers the RECENT rows below are already drawn from. The third is green
 * because it is the only one of the three about the workout you are ABOUT to do
 * rather than about the routine as written.
 */
function Hero({
  plan,
  number,
  plural,
}: {
  plan: NextUpPlan;
  number: number;
  plural: ReturnType<typeof usePlural>;
}) {
  const t = useT();
  const lang = useLanguage();
  return (
    <View className="mx-lg mt-lg">
      <GlassSurface tier="lit" radius={radius.hero} shadow="e2">
        {/* The corner lamp: the theme's THIRD colour, so the hero carries the
            far end of the gradient the floating ▶ under the thumb starts from. */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: -80, right: -60, width: 220, height: 220 }}
        >
          <Svg width={220} height={220}>
            <Defs>
              <RadialGradient id="heroLamp" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={stopTint(3, 1)} stopOpacity={0.26} />
                <Stop offset="65%" stopColor={stopTint(3, 1)} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={110} cy={110} r={110} fill="url(#heroLamp)" />
          </Svg>
        </View>
        <View className="p-[20px]">
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <RunningText
              text={plan.focus ? `${t('Today')} · ${plan.focus}` : t('Today')}
              fadeColor={FADE_ON.lit}
              containerStyle={{ flex: 1 }}
              maxFontSizeMultiplier={1.3}
              style={{ letterSpacing: 1.1 }}
              className="text-micro font-semibold uppercase text-acc"
            />
            {plan.nudgeCount > 0 ? (
              <View
                style={{
                  height: 26,
                  paddingHorizontal: 10,
                  justifyContent: 'center',
                  borderRadius: radius.pill,
                  backgroundColor: tint(0.2),
                  borderWidth: 1,
                  borderColor: tint(0.34),
                }}
              >
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={{ fontSize: 12.5, letterSpacing: 0.9 }}
                  className="font-semibold uppercase tabular-nums text-acc"
                >
                  {`${plan.nudgeCount} ${plural(plan.nudgeCount, {
                    one: t('nudge'),
                    few: 'подсказки',
                    many: t('nudges'),
                  })}`}
                </Text>
              </View>
            ) : null}
          </View>

          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={1.3}
            style={focalType.heroName}
            className="mt-sm font-semibold text-ink"
          >
            {plan.name}
          </Text>

          <Text className="mt-xs text-label text-ink-muted">
            {t('{exercises} exercises · {sets} sets', {
              exercises: plan.exerciseCount,
              sets: plan.setCount,
            })}
          </Text>

          {/* The divider fades out rather than crossing the card: a full-width
              rule inside a pane reads as a seam between two panes. */}
          <View
            className="mt-lg h-hairline"
            style={{ backgroundColor: 'rgba(236,241,238,0.12)', width: '62%' }}
          />

          <View className="mt-lg flex-row flex-wrap" style={{ rowGap: 10 }}>
            <HeroStat label={t('Exercises')} value={String(plan.exerciseCount)} />
            <HeroStat label={t('Sets')} value={String(plan.setCount)} />
            <HeroStat label={t('Workout')} value={`#${number}`} tone="green" rolls />
            {plan.lastTrainedAt ? (
              <HeroStat
                label={t('Last')}
                value={formatShortDate(plan.lastTrainedAt, lang)}
                tone="muted"
              />
            ) : null}
          </View>
        </View>
      </GlassSurface>
    </View>
  );
}

function HeroStat({
  label,
  value,
  tone = 'plain',
  rolls = false,
}: {
  label: string;
  value: string;
  tone?: 'plain' | 'green' | 'muted';
  /** The workout number rolls when it changes — a workout was just saved. */
  rolls?: boolean;
}) {
  const color = tone === 'green' ? 'text-acc' : tone === 'muted' ? 'text-ink-muted' : 'text-ink';
  return (
    <View className="mr-[22px]">
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 12.5, letterSpacing: 1.1 }}
        className="font-semibold uppercase text-ink-faint"
      >
        {label}
      </Text>
      {rolls ? (
        <RollingNumber
          value={value}
          lineHeight={24}
          duration={900}
          containerStyle={{ marginTop: 2 }}
          style={{ fontSize: 22 }}
          className={['font-semibold', color].join(' ')}
        />
      ) : (
        <Text
          allowFontScaling={false}
          style={{ fontSize: 22, lineHeight: 24 }}
          className={['mt-[2px] font-semibold tabular-nums', color].join(' ')}
        >
          {value}
        </Text>
      )}
    </View>
  );
}

/**
 * The sequence, FOLDED by default to one line: `SEQUENCE · 11/12 · then Push ⌄`.
 *
 * It used to be the full wrapping line of chips, always — and a real sequence is
 * not four steps, it is twelve, with long names. That was twelve rows of chips
 * between the top bar and the hero, pushing the one card this screen exists for
 * below the fold. The folded line keeps what is worth a glance on every visit —
 * where in the order you are, and what comes AFTER today (today itself is the
 * hero right under it, so naming it here too would be saying it twice). The
 * chevron opens the full order; it closes again the same way.
 *
 * Open state is local and starts closed each time the screen mounts. The whole
 * order is a thing you look at occasionally, not every time, and a preference
 * persisted for one disclosure is more machinery than the question deserves.
 *
 * Open, it is the same wrapping line of chips as before, step whose turn it is on
 * a lit pane. WRAPPING and not a horizontal `ScrollView`, which it once was: a
 * sideways-scrolling row hides the steps past the edge, and wrapped chips are
 * all visible without a gesture. Tapping a chip opens the screen that edits the order — a chip
 * is a label, not a start button, and the thing you want after looking at your
 * order is usually to change it.
 */
function SequenceStrip({ sequence, onPress }: { sequence: SequenceView; onPress: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { steps } = sequence;
  const currentIndex = steps.findIndex((step) => step.isCurrent);
  // The cursor wraps (`advanceSequence`), so after the last step comes the first.
  const after =
    currentIndex >= 0 && steps.length > 1 ? steps[(currentIndex + 1) % steps.length] : null;
  const summary = [
    currentIndex >= 0 ? `${currentIndex + 1}/${steps.length}` : null,
    after ? t('then {name}', { name: after.name }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="mt-lg">
      <BubblePressable
        onPress={() => setOpen((was) => !was)}
        radius="pill"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${t('Sequence')}. ${summary}. ${open ? t('Hide the sequence') : t('Show the sequence')}`}
        style={(state) => [
          pressedStyle(state),
          {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 44,
            marginHorizontal: 16,
            paddingHorizontal: 14,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: 'rgba(236,241,238,0.045)',
            backgroundColor: 'rgba(236,241,238,0.028)',
          },
        ]}
      >
        <Kicker>{t('Sequence')}</Kicker>
        <RunningText
          text={summary}
          fadeColor={FADE_ON.page}
          containerStyle={{ flex: 1, marginLeft: 12 }}
          maxFontSizeMultiplier={1.3}
          className="text-label tabular-nums text-ink-faint"
        />
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={16} color={palette.inkFaint} />
      </BubblePressable>

      {open ? (
        <Reveal>
          <View className="mx-lg mt-md flex-row flex-wrap items-center" style={{ rowGap: 8 }}>
            {steps.map((step, index) => (
              <SequenceChip key={step.key} step={step} divided={index > 0} onPress={onPress} />
            ))}
          </View>
        </Reveal>
      ) : null}
    </View>
  );
}

function SequenceChip({
  step,
  divided,
  onPress,
}: {
  step: SequenceView['steps'][number];
  /** A `›` before it — every chip but the first. */
  divided: boolean;
  onPress: () => void;
}) {
  const t = useT();
  return (
    <BubblePressable
      onPress={onPress}
      radius="pill"
      accessibilityRole="button"
      accessibilityLabel={`${step.name}${step.isCurrent ? `, ${t('next up')}` : ''}. ${t('Edit the sequence.')}`}
      style={(state) => [pressedStyle(state), { flexDirection: 'row', alignItems: 'center' }]}
    >
      {divided ? (
        <Text className="mx-[3px] text-label text-ink-faint" maxFontSizeMultiplier={1.3}>
          ›
        </Text>
      ) : null}
      <View
        style={{
          height: 34,
          justifyContent: 'center',
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: step.isCurrent ? tint(0.3) : 'rgba(236,241,238,0.045)',
          backgroundColor: step.isCurrent ? tint(0.13) : 'rgba(236,241,238,0.028)',
        }}
      >
        <Text
          numberOfLines={1}
          className={[
            'text-label',
            step.isCurrent ? 'font-semibold text-acc' : 'text-ink-muted',
          ].join(' ')}
        >
          {step.name}
        </Text>
      </View>
    </BubblePressable>
  );
}

/**
 * One openable routine, as its own `card` pane with 8 of air under it.
 *
 * The whole row opens it — no chevron, because a chevron promises a screen and
 * this promises a workout. The ▶ is the same green glyph the set rows use for
 * "this one now", in a 40 dp circle that gives it an edge of its own.
 */
function ChoiceRow({ choice, onPress }: { choice: RoutineChoice; onPress: () => void }) {
  const t = useT();
  const press = usePressScale(0.97);
  const detail = [
    choice.focus,
    t('{exercises} exercises · {sets} sets', {
      exercises: choice.exerciseCount,
      sets: choice.setCount,
    }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Animated.View style={{ transform: press.style.transform }}>
      <GlassSurface tier="card" radius={radius.row} shadow="e1" flat>
        <BubblePressable
          onPress={onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          radius={radius.row}
          accessibilityRole="button"
          accessibilityLabel={`${t('Open {name}', { name: choice.name })}. ${detail}`}
          style={(state) => [
            pressedStyle(state),
            {
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 14,
              paddingHorizontal: 16,
            },
          ]}
        >
          {/* Both lines RUN rather than ellipsise — two routines whose names
              differ only at the end are two routines. */}
          <View className="flex-1 pr-md" style={{ minWidth: 0 }}>
            <View className="flex-row items-center">
              <RunningText
                text={choice.name}
                fadeColor={FADE_ON.card}
                containerStyle={{ flexShrink: 1 }}
                className="text-body font-medium text-ink"
              />
              {choice.isAi ? <AiPill /> : null}
            </View>
            <RunningText
              text={detail}
              fadeColor={FADE_ON.card}
              containerStyle={{ marginTop: 2 }}
              style={{ fontSize: 14, lineHeight: 19, color: DETAIL_INK }}
              className="tabular-nums"
            />
          </View>
          <View
            style={{
              height: 42,
              width: 42,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.pill,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: tint(0.26),
              backgroundColor: tint(0.14),
            }}
          >
            <SpecularEdge color="rgba(236,241,238,0.12)" radius={radius.pill} />
            <View style={{ marginLeft: 2 }}>
              <Icon name="play" size={15} color={palette.acc} />
            </View>
          </View>
        </BubblePressable>
      </GlassSurface>
    </Animated.View>
  );
}

/**
 * `AI`, beside a routine the assistant made, until it is first opened — a
 * statement of where the row came from. In the assistant's OWN fixed violet →
 * pink rather than the theme: it says who made the row, and the one colour pair
 * no theme can wear is the one that always means the assistant.
 */
function AiPill() {
  return (
    <View
      style={{
        marginLeft: 8,
        height: 20,
        paddingHorizontal: 7,
        justifyContent: 'center',
        borderRadius: radius.pill,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        colors={['#8B5CF6', '#EC4899']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 12.5, letterSpacing: 0.9, color: '#FFFFFF' }}
        className="font-bold uppercase"
      >
        AI
      </Text>
    </View>
  );
}

function RecentRow({
  session,
  number,
  divided,
  onPress,
}: {
  session: RecentSessionSummary;
  /** Its ordinal, when the numbering gives it one. */
  number?: number;
  /** A hairline above it — every row but the first. */
  divided: boolean;
  onPress: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const numbered = number != null && number >= 1;
  /*
   * Two lines rather than one, and the ordinal moved INLINE with the title.
   *
   * The single line ran out of room once the set count and the volume joined it
   * — and those two are the reason to look at a past session at all, since the
   * date and the duration only say that it happened. The `#91` keeps its green
   * and its tabular weight, but it is now a prefix on the title rather than a
   * column, because there is no second column left to align it against. The
   * title RUNS beside it.
   */
  const detail = [
    formatShortDate(session.performedAt, lang),
    t('{minutes} min', { minutes: session.durationMinutes }),
    t('{count} sets', { count: session.setCount }),
    // A volume built from sets that carried no weight is a floor, not a total,
    // so it is left off rather than stated wrongly.
    session.totalVolumeKg > 0 && !session.volumeIsPartial
      ? formatVolumeKg(session.totalVolumeKg, lang)
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View>
      {divided ? <View className="ml-lg h-hairline bg-hairline" /> : null}
      <BubblePressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={[
          numbered ? `${t('Workout {number}', { number })},` : '',
          session.title,
          detail,
        ]
          .filter(Boolean)
          .join(' ')}
        style={(state) => [pressedStyle(state), { paddingVertical: 13, paddingHorizontal: 16 }]}
      >
        <View className="flex-row items-center">
          {numbered ? (
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ fontSize: 13.5 }}
              className="mr-sm font-semibold tabular-nums text-acc"
            >
              {`#${number}`}
            </Text>
          ) : null}
          <RunningText
            text={session.title}
            fadeColor="#0B0E0D"
            containerStyle={{ flex: 1 }}
            className="text-task text-ink"
          />
        </View>
        <RunningText
          text={detail}
          fadeColor="#0B0E0D"
          containerStyle={{ marginTop: 2 }}
          style={{ fontSize: 14, lineHeight: 19, color: DETAIL_INK }}
          className="tabular-nums"
        />
      </BubblePressable>
    </View>
  );
}

/**
 * Nothing to open: there are no routines, or every one of them is empty.
 *
 * It used to be one card for both, pointing at "the list glyph in the corner" —
 * directions to a button instead of the button (U12). Now each case has its own
 * way forward IN the card, and the floating slot offers the same `+`:
 *   • no routines at all — `Make your first routine`, and `New routine` creates
 *     one and opens its editor;
 *   • routines that are all empty — `Nothing to open`, and `Open routines`, because
 *     the thing to do is fill one of those in, not make another.
 */
function Empty({
  first,
  onNewRoutine,
  onOpenRoutines,
}: {
  first: boolean;
  onNewRoutine: () => void;
  onOpenRoutines: () => void;
}) {
  const t = useT();
  return (
    <GlassSurface tier="card" radius={radius.card} shadow="e1" flat className="mx-lg mt-kicker">
      <View className="p-lg">
        <Kicker>{first ? t('No routines yet') : t('Nothing to open')}</Kicker>
        {first ? (
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ fontSize: 22, lineHeight: 28, letterSpacing: -0.4 }}
            className="mt-sm font-semibold text-ink"
          >
            {t('Make your first routine')}
          </Text>
        ) : null}
        <Text className="mt-sm text-body text-ink-muted">
          {first
            ? t('It appears here, one tap from starting.')
            : t('Put some exercises in one of your routines and it shows up here, ready to open.')}
        </Text>
        <View className="mt-lg self-start">
          {first ? (
            <PrimaryButton label={t('New routine')} onPress={onNewRoutine} />
          ) : (
            <PrimaryButton label={t('Open routines')} variant="ghost" onPress={onOpenRoutines} />
          )}
        </View>
      </View>
    </GlassSurface>
  );
}
