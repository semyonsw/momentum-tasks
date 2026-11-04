/**
 * LaunchScreen — the three seconds between the native splash and the app,
 * spent saying what is actually being loaded.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │                  ◌  ◌                        │  ← two rings pulse out (c2, c3)
 *   │                ╭──────╮                      │  ← r 78: a third per store
 *   │                │ ◠ 🏋 │                      │  ← r 70: a gradient arc, spinning
 *   │                ╰──────╯                      │  ← the mark: squeezes, morphs
 *   │                  Workout                     │  ← the app's name, letter by letter
 *   │            TRAIN · LOG · PROGRESS            │
 *   │                                              │
 *   │                (✓ 92 workouts)               │  ← ticks when ITS store has
 *   └──────────────────────────────────────────────┘
 *
 * ── THE MARK IS THE APP, IN ONE BEAT ──────────────────────────────────────
 *
 * An 86 dp gradient circle in the theme's three colours, and inside it the
 * app's own glyph (`lib/launchReady.launchBrand`). Until 3.0.0 it held all three
 * logs taking turns — `fitness_center` → `payments` → `task_alt`, each spinning
 * in, holding and spinning out on a 2.7 s loop — because Momentum WAS the three
 * logs. Each app is one log now, so its mark holds one glyph and keeps it; the
 * morph machinery stays for a list of one, which simply never hands over. The
 * circle squeezes on a 0.9 s beat. Every loop is transform or opacity on the
 * native driver: this runs while the JS thread is busiest, hydrating the stores,
 * and a JS-driven animation would stutter exactly then. The keyframes are CSS in
 * the handoff; each is rebuilt as an `Animated.sequence` of its segments, with
 * the handoff's easing on each.
 *
 * It starts on a page-coloured frame with the mark at rest and every glyph at
 * opacity 0, which is the closest this screen can come to the native splash's
 * own picture: `expo-splash-screen`'s `preventAutoHideAsync` is not in this
 * build, so Android dismisses its splash on the first frame drawn here.
 *
 * ── THE CHIPS ARE THE TRUTH ───────────────────────────────────────────────
 *
 * One chip per store this app is built on (`launchReady.launchStores`): the
 * workout log (SQLite) in Workout, the tasks in Tasks, the money in Expenses.
 * It spins until THAT store has really finished, then ticks and counts up to
 * what it holds, and the ring round the mark fills as it does. The Workout app's
 * old tasks and money are still on disk and still hydrate, but its screens never
 * read them, so they get no chip and the launch does not wait for them.
 * `lib/launchReady.ts` paces the ticks and decides when the screen may leave:
 * every store ready and 2.3 s gone, or 6 s gone whatever happened. A store that
 * never reports ready ends the launch at the ceiling and the screen behind it
 * shows its own error state.
 *
 * It shows on a COLD START only. It is mounted once, by `App`, for the life of the
 * JS process; coming back to the app from the background resumes that process,
 * and this screen has long since unmounted. With reduced motion on, everything is
 * drawn at its end state and it leaves the moment the stores are ready.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

import { useMotionScale } from '../hooks/useMotionScale';
import { usePlural, useT } from '../hooks/useT';
import { APP_VARIANT, BUILD_MARK } from '../lib/appVariant';
import {
  LAUNCH_CEILING_MS,
  launchBrand,
  launchReady,
  launchStores,
  launchTicks,
  type LaunchStore,
} from '../lib/launchReady';
import { mixSrgb } from '../lib/theme';
import { useMoney } from '../state/moneyStore';
import { useTasks } from '../state/tasksStore';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import { curve, gradientFill, motion, palette, radius, stopTint, tint } from '../theme/tokens';
import { Lamps } from './glass';
import { Icon } from './Icon';
import { MaterialSymbol, type SymbolName } from './MaterialSymbol';
import { Pop } from './motion';
import { RollingNumber } from './RollingNumber';

const EASE = curve(motion.ease);
/** The glyph morph's curve, and the squeeze's — both from the handoff. */
const MORPH_EASE = Easing.bezier(0.34, 1.3, 0.64, 1);
const SQUEEZE_EASE = curve(motion.pop);
/** This app's name, glyph and line — a name, not a sentence, in both languages. */
const BRAND = launchBrand(APP_VARIANT);
const WORDMARK = BRAND.wordmark;
/** The stores this app waits for, in chip order. */
const STORES = launchStores(APP_VARIANT);

/** The mark, and the box the waves and both rings sit in. */
const MARK = 86;
const BOX = 180;
const RING_BOX = 164;
const PROGRESS_R = 78;
const PROGRESS_STROKE = 3;
const PROGRESS_LENGTH = 2 * Math.PI * PROGRESS_R;
const SPIN_R = 70;

/** One morph loop, and the glyphs it deals out evenly across it — one, since 3.0. */
const MORPH_MS = 2700;
const GLYPHS: readonly SymbolName[] = [BRAND.glyph];
/** A single glyph holds still: there is nothing to hand over to. */
const MORPHS = GLYPHS.length > 1;
const SQUEEZE_MS = 900;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function LaunchScreen({ onDone }: { onDone: () => void }) {
  const t = useT();
  const plural = usePlural();
  const scale = useMotionScale();
  const reduced = scale === 0;

  /* --- the stores, and when each became ready ------------------------- */
  const started = useRef(Date.now()).current;
  const historyReady = useWorkoutHistory((s) => s.ready);
  const workoutCount = useWorkoutHistory((s) => s.workouts.length);
  const taskCount = useTasks((s) => s.tasks.filter((task) => task.archivedAt === null).length);
  const accountCount = useMoney(
    (s) => s.accounts.filter((account) => account.archivedAt === null).length,
  );
  const [tasksReady, setTasksReady] = useState(() => useTasks.persist.hasHydrated());
  const [moneyReady, setMoneyReady] = useState(() => useMoney.persist.hasHydrated());
  useEffect(() => {
    // Both, deliberately — the listener catches a hydration still in flight, the
    // re-check one that finished between render and effect (`useHydrated.ts`).
    const offTasks = useTasks.persist.onFinishHydration(() => setTasksReady(true));
    const offMoney = useMoney.persist.onFinishHydration(() => setMoneyReady(true));
    if (useTasks.persist.hasHydrated()) setTasksReady(true);
    if (useMoney.persist.hasHydrated()) setMoneyReady(true);
    return () => {
      offTasks();
      offMoney();
    };
  }, []);

  const readyAt = useRef<Record<LaunchStore, number | null>>({
    history: null,
    tasks: null,
    money: null,
  });
  const stamp = (store: LaunchStore, ready: boolean) => {
    if (ready && readyAt.current[store] == null) readyAt.current[store] = Date.now() - started;
  };
  stamp('history', historyReady);
  stamp('tasks', tasksReady);
  stamp('money', moneyReady);

  /* A tenth-of-a-second clock, for as long as this screen lives — at most 6 s. */
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - started), 100);
    return () => clearInterval(interval);
  }, [started]);

  const ticked = reduced
    ? {
        history: readyAt.current.history != null,
        tasks: readyAt.current.tasks != null,
        money: readyAt.current.money != null,
      }
    : launchTicks(readyAt.current, elapsed, STORES);
  const state = launchReady({ stores: STORES, ready: ticked, elapsedMs: elapsed });
  /*
   * A TAP SKIPS THE WAIT, once the data is actually in. The floor is there for the
   * choreography, and the choreography is for the first look, not the fortieth
   * launch of the week. Before every store has reported, a tap does nothing: the
   * splash would be leaving onto screens with nothing in them yet.
   */
  const [skipped, setSkipped] = useState(false);
  const loaded: Record<LaunchStore, boolean> = {
    history: historyReady,
    tasks: tasksReady,
    money: moneyReady,
  };
  const allLoaded = STORES.every((store) => loaded[store]);
  /* Reduced motion has no choreography to wait for: leave once the data is in. */
  const exit =
    state.exit ||
    (skipped && allLoaded) ||
    (reduced && (state.stage === STORES.length || elapsed >= LAUNCH_CEILING_MS));

  /* --- the exit ------------------------------------------------------- */
  const leave = useRef(new Animated.Value(0)).current;
  const left = useRef(false);
  useEffect(() => {
    if (!exit || left.current) return;
    left.current = true;
    Animated.timing(leave, {
      toValue: 1,
      duration: 600 * scale,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start(() => onDone());
  }, [exit, leave, onDone, scale]);

  /* --- the choreography, all of it from mount ------------------------- */
  const lamps = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  /* The squeeze beat: 0 rest → 1 pinched → 2 overshoot → 3 rest again. */
  const beat = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const wave1 = useRef(new Animated.Value(0)).current;
  const wave2 = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  /* Each glyph has an IN and an OUT value, so both halves get the overshoot. */
  const glyphs = useRef(
    GLYPHS.map(() => ({
      /* A lone glyph with reduced motion is simply drawn: no spin-in will run. */
      enter: new Animated.Value(!MORPHS && reduced ? 1 : 0),
      exit: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    if (reduced) return undefined;
    const loops: Animated.CompositeAnimation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const run = (loop: Animated.CompositeAnimation, delay = 0) => {
      loops.push(loop);
      if (delay === 0) loop.start();
      else timers.push(setTimeout(() => loop.start(), delay));
    };
    const step = (v: Animated.Value, toValue: number, duration: number, easing = EASE) =>
      Animated.timing(v, { toValue, duration, easing, useNativeDriver: true });

    // The room lighting up.
    step(lamps, 1, 1600).start();

    // `squeeze`: rest 0–72 %, 84 % pinched, 94 % overshoot, 100 % rest.
    run(
      Animated.loop(
        Animated.sequence([
          Animated.delay(SQUEEZE_MS * 0.72),
          step(beat, 1, SQUEEZE_MS * 0.12, SQUEEZE_EASE),
          step(beat, 2, SQUEEZE_MS * 0.1, SQUEEZE_EASE),
          step(beat, 3, SQUEEZE_MS * 0.06, SQUEEZE_EASE),
        ]),
      ),
    );

    run(Animated.loop(step(spin, 1, 1100, Easing.linear)));

    // `morph`: 0–10 % in, hold to 27 %, out by 35 %, gone for the rest. A lone
    // glyph spins in once, from the splash-matching empty mark, and stays — on
    // the loop it would be gone two thirds of the time.
    if (!MORPHS) {
      timers.push(
        setTimeout(() => step(glyphs[0].enter, 1, MORPH_MS * 0.1, MORPH_EASE).start(), 240),
      );
    } else
      glyphs.forEach((glyph, index) =>
        run(
          Animated.loop(
            Animated.sequence([
              step(glyph.enter, 1, MORPH_MS * 0.1, MORPH_EASE),
              Animated.delay(MORPH_MS * 0.17),
              step(glyph.exit, 1, MORPH_MS * 0.08, MORPH_EASE),
              Animated.delay(MORPH_MS * 0.65),
            ]),
          ),
          (index * MORPH_MS) / GLYPHS.length,
        ),
      );

    const wave = (v: Animated.Value, delay: number) => run(Animated.loop(step(v, 1, 2400)), delay);
    wave(wave1, 700);
    wave(wave2, 1500);

    Animated.timing(tagline, {
      toValue: 1,
      duration: 500,
      delay: 1100,
      easing: EASE,
      useNativeDriver: true,
    }).start();
    return () => {
      timers.forEach(clearTimeout);
      loops.forEach((loop) => loop.stop());
    };
    // Mount only: this runs once, for a screen that is only ever mounted once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* The ring round the mark: its share per ticked store, 700 ms a step. */
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: state.fraction,
      duration: 700 * scale,
      easing: EASE,
      useNativeDriver: false,
    }).start();
  }, [progress, scale, state.fraction]);

  /*
   * Every interpolation built once. The 100 ms clock re-renders this whole tree
   * ten times a second, and a fresh node per render makes each Animated.View
   * detach and re-attach its native animation graph every time — which is also
   * why the children below are memoised on their (primitive) props.
   */
  const nodes = useMemo(
    () => ({
      leaveOpacity: leave.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
      leaveScale: leave.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }),
      lampsScale: lamps.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }),
      dashOffset: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [PROGRESS_LENGTH, 0],
      }),
      spinRotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
      beatScale: beat.interpolate({
        inputRange: [0, 1, 2, 3],
        outputRange: [1, 0.86, 1.06, 1],
      }),
      beatRotate: beat.interpolate({
        inputRange: [0, 1, 2, 3],
        outputRange: ['0deg', '-8deg', '4deg', '0deg'],
      }),
      taglineY: tagline.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
    }),
    [beat, lamps, leave, progress, spin, tagline],
  );

  const allChips: { store: LaunchStore; count: number; label: string }[] = [
    {
      store: 'history',
      count: workoutCount,
      label: plural(workoutCount, { one: t('workout'), few: 'тренировки', many: t('workouts') }),
    },
    {
      store: 'tasks',
      count: taskCount,
      label: plural(taskCount, { one: t('task'), few: 'задачи', many: t('tasks') }),
    },
    {
      store: 'money',
      count: accountCount,
      label: plural(accountCount, { one: t('account'), few: 'счёта', many: t('accounts') }),
    },
  ];
  const chips = allChips.filter((chip) => STORES.includes(chip.store));

  return (
    <Animated.View
      accessibilityLabel={t('Loading')}
      testID={BUILD_MARK || undefined}
      onTouchEnd={() => {
        if (allLoaded) setSkipped(true);
      }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        backgroundColor: palette.bg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        opacity: nodes.leaveOpacity,
        transform: [{ scale: nodes.leaveScale }],
      }}
    >
      {/* The room lighting up: the theme's three stops, scaling in. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: lamps,
          transform: [{ scale: nodes.lampsScale }],
        }}
      >
        <Lamps section="Launch" />
      </Animated.View>

      {/* The mark and everything around it, 40 dp above true centre because the
          wordmark sits under it. */}
      <View
        style={{
          width: BOX,
          height: BOX,
          marginTop: -40,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Wave value={wave1} color={tint(0.5)} />
        <Wave value={wave2} color={stopTint(3, 0.5)} />

        {/* The progress ring: its share per ticked store. */}
        <Svg
          width={RING_BOX}
          height={RING_BOX}
          style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
        >
          <Circle
            cx={RING_BOX / 2}
            cy={RING_BOX / 2}
            r={PROGRESS_R}
            fill="none"
            stroke={mixSrgb(palette.c1, '#08110C', 0.4)}
            strokeWidth={PROGRESS_STROKE}
          />
          <AnimatedCircle
            cx={RING_BOX / 2}
            cy={RING_BOX / 2}
            r={PROGRESS_R}
            fill="none"
            stroke={palette.acc}
            strokeWidth={PROGRESS_STROKE}
            strokeLinecap="round"
            strokeDasharray={PROGRESS_LENGTH}
            strokeDashoffset={nodes.dashOffset}
          />
        </Svg>

        {/* The second ring: a gradient arc going round, so the screen is never
            still between two stores reporting in. */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: RING_BOX,
            height: RING_BOX,
            transform: [{ rotate: nodes.spinRotate }],
          }}
        >
          <Svg width={RING_BOX} height={RING_BOX}>
            <Defs>
              <SvgGradient id="launchSpin" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor={palette.c1} />
                <Stop offset="50%" stopColor={palette.c2} />
                <Stop offset="100%" stopColor={palette.c3} />
              </SvgGradient>
            </Defs>
            <Circle
              cx={RING_BOX / 2}
              cy={RING_BOX / 2}
              r={SPIN_R}
              fill="none"
              stroke="url(#launchSpin)"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeDasharray="110 330"
            />
          </Svg>
        </Animated.View>

        <Animated.View
          style={[
            MARK_BOX,
            {
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: nodes.beatScale }, { rotate: nodes.beatRotate }],
            },
          ]}
        >
          <LinearGradient
            {...gradientFill()}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          {GLYPHS.map((name, index) => (
            <MorphGlyph key={name} name={name} {...glyphs[index]} />
          ))}
        </Animated.View>
      </View>

      {/* The name, one letter at a time. */}
      <View style={{ marginTop: 26, flexDirection: 'row' }} accessibilityLabel={WORDMARK}>
        {Array.from(WORDMARK).map((letter, index) => (
          <Letter key={index} letter={letter} delay={480 + index * 28} reduced={reduced} />
        ))}
      </View>
      <Animated.Text
        maxFontSizeMultiplier={1.3}
        style={{
          marginTop: 8,
          fontSize: 12.5,
          letterSpacing: 1.4,
          fontWeight: '600',
          color: palette.inkFaint,
          textTransform: 'uppercase',
          opacity: tagline,
          transform: [{ translateY: nodes.taglineY }],
        }}
      >
        {t(BRAND.tagline)}
      </Animated.Text>

      {/* What is actually loading, and what each store holds once it has. */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 72,
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {chips.map((chip, index) => (
          <StatusChip
            key={chip.store}
            done={ticked[chip.store]}
            count={chip.count}
            label={chip.label}
            delay={900 + index * 90}
            reduced={reduced}
          />
        ))}
      </View>
    </Animated.View>
  );
}

const MARK_BOX = {
  position: 'absolute',
  width: MARK,
  height: MARK,
  borderRadius: radius.pill,
} as const;

/**
 * One glyph of the mark: spins in from −200° at a quarter size, holds, spins
 * out to +200°. `enter` and `exit` are separate values so each half overshoots
 * on its own curve; opacity is their product, rotation their sum.
 */
function MorphGlyph({
  name,
  enter,
  exit,
}: {
  name: SymbolName;
  enter: Animated.Value;
  exit: Animated.Value;
}) {
  const style = useMemo(
    () => ({
      position: 'absolute' as const,
      opacity: Animated.multiply(
        enter.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
        exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' }),
      ),
      transform: [
        {
          rotate: Animated.add(
            enter.interpolate({ inputRange: [0, 1], outputRange: [-200, 0] }),
            exit.interpolate({ inputRange: [0, 1], outputRange: [0, 200] }),
          ).interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }),
        },
        {
          scale: Animated.multiply(
            enter.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
            exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] }),
          ),
        },
      ],
    }),
    [enter, exit],
  );
  return (
    <Animated.View pointerEvents="none" style={style}>
      <MaterialSymbol name={name} size={44} color={palette.onAcc} filled />
    </Animated.View>
  );
}

/** One 120 dp ring pulsing out from the mark: scale 1 → 2.2, fading. */
const Wave = memo(function Wave({ value, color }: { value: Animated.Value; color: string }) {
  const style = useMemo(
    () => ({
      position: 'absolute' as const,
      width: 120,
      height: 120,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: color,
      opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
      transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
    }),
    [color, value],
  );
  return <Animated.View pointerEvents="none" style={style} />;
});

/** One letter of the wordmark arriving: opacity and a 14 dp rise, 520 ms. */
const Letter = memo(function Letter({
  letter,
  delay,
  reduced,
}: {
  letter: string;
  delay: number;
  reduced: boolean;
}) {
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.timing(v, {
      toValue: 1,
      duration: 520,
      delay,
      easing: EASE,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const translateY = useMemo(
    () => v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
    [v],
  );
  return (
    <Animated.Text
      maxFontSizeMultiplier={1.3}
      style={{
        fontSize: 26,
        letterSpacing: -0.5,
        fontWeight: '600',
        color: palette.ink,
        opacity: v,
        transform: [{ translateY }],
      }}
    >
      {letter}
    </Animated.Text>
  );
});

/**
 * One status chip: a spinner until its store is ready, then a popped ✓ in a
 * gradient dot, and the count rolling up from zero at the same moment.
 */
function StatusChip({
  done,
  count,
  label,
  delay,
  reduced,
}: {
  done: boolean;
  count: number;
  label: string;
  delay: number;
  reduced: boolean;
}) {
  const arrive = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.timing(arrive, {
      toValue: 1,
      duration: 420,
      delay,
      easing: EASE,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const translateY = useMemo(
    () => arrive.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
    [arrive],
  );
  /* RollingNumber is memoised; an inline style object would defeat it. Keyed on
     the accent itself: this screen is outside the tree a new theme remounts. */
  const accent = palette.acc;
  const numberStyle = useMemo(
    () => ({ fontSize: 13, color: done ? accent : palette.inkFaint }),
    [accent, done],
  );

  return (
    <Animated.View
      style={{
        height: 34,
        paddingLeft: 8,
        paddingRight: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: radius.pill,
        borderWidth: 1,
        backgroundColor: done ? tint(0.14) : 'rgba(236,241,238,0.035)',
        borderColor: done ? tint(0.3) : 'rgba(236,241,238,0.06)',
        opacity: arrive,
        transform: [{ translateY }],
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: radius.pill,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {done ? (
          <>
            <LinearGradient
              colors={[palette.c1, palette.c2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <Pop duration={320}>
              <Icon name="check" size={12} color={palette.onAcc} />
            </Pop>
          </>
        ) : (
          <Spinner reduced={reduced} />
        )}
      </View>
      <RollingNumber
        value={done ? String(count) : '0'}
        lineHeight={17}
        duration={600}
        style={numberStyle}
        className="font-semibold"
      />
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 13, color: done ? palette.inkMuted : palette.inkFaint }}
        className="font-medium"
      >
        {label}
      </Text>
    </Animated.View>
  );
}

/** An 11 dp ring with a lit top segment, turning once every 700 ms. */
function Spinner({ reduced }: { reduced: boolean }) {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return undefined;
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: 700,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, turn]);
  const rotate = useMemo(
    () => turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
    [turn],
  );
  return (
    <Animated.View
      style={{
        width: 11,
        height: 11,
        borderRadius: radius.pill,
        borderWidth: 2,
        borderColor: tint(0.3),
        borderTopColor: palette.acc,
        transform: [{ rotate }],
      }}
    />
  );
}
