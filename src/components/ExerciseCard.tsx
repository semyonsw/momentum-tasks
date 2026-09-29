/**
 * ExerciseCard — one exercise inside the active session.
 *
 * Collapsed (not the current exercise):
 *   ┌────────────────────────────────────────────┐
 *   │ Wide pull-ups machine               0/4  ● │  ← ● = a nudge is waiting
 *   │ 80 kg · 8 6 5 5                            │
 *   └────────────────────────────────────────────┘
 *
 * Expanded: ONE glass card (Momentum v3) holding the header, the overload line,
 * the set rows as pills 6 apart, and a footer of `+ Add set` / `− Remove set`
 * with `Rest` and `Focus` under them.
 *
 * At most one card is expanded at a time, and NONE is a legal answer — tapping the
 * open card's header shuts it. That is the whole navigation model of the logging
 * screen: no tabs, no per-exercise route, no back button. The user moves down the
 * list as they move through the gym, and can shut the list down to eight names when
 * what they want is the shape of the session rather than the numbers in it.
 *
 * ── OPEN IS NOT THE SAME AS UP NEXT ─────────────────────────────────────────
 *
 * `isExpanded` is "this card is showing its sets". `upNextSetId` is "the one set
 * of the whole session that should happen next is this one, and it is in here" —
 * a fact about the LOG, computed by `lib/upNext.ts` and handed down. They usually
 * agree, and the two moments they do not are exactly the two moments the
 * distinction earns itself: the user has shut the card they are on, and the user
 * is reading a card further down the list. Opening a card to read it does not move
 * the mark; only a ✓ does.
 *
 * THE CARD HOLDING THE NEXT SET IS MARKED IN THE ACCENT, in both states:
 *
 *   • Shut — the name goes `acc` and the card moves onto the `lit` glass tier. With
 *     everything closed this is the only thing on screen saying where you are.
 *   • Open — the ring is not repeated (the open card is obviously the subject);
 *     the mark moves INSIDE, onto the one set row that should happen next. See
 *     `SetRow`'s `isUpNext`.
 *
 * The collapsed signal for a waiting overload suggestion is a single 6px dot.
 * Not a badge, not a chip, not a count: the suggestion is not urgent, it just
 * needs to be findable.
 *
 * ── SUPERSETS READ AS A BRACKET ─────────────────────────────────────────────
 *
 * A member of a superset carries a 2 dp `green-dim` rule down its left edge, and
 * the members of one group carry it continuously, so a pair reads as one block.
 * The same vocabulary the routine editor's drop target uses, for the same reason:
 * `green-dim` means "these belong together", never "something is wrong". No second
 * hue, no label, no badge — the behaviour speaks for itself the first time a ✓
 * moves the cursor sideways instead of starting a rest.
 *
 * A group of ONE renders no rule. `supersetPosition` decides that, not this
 * component: a bracket around a single exercise says nothing, and one is easy to
 * produce by removing a partner mid-session.
 *
 * ── THE PLAN IS BEHIND THE ✎ ────────────────────────────────────────────────
 *
 * An open card used to carry every control that changes the PLAN — `Add set`,
 * `Remove set`, `Warm-up`, `Edit exercise`, `Remove exercise` — under its sets,
 * all the time, on every card, for the whole session. Those are decisions made
 * two or three times a workout, and they sat a thumb's width from the ✓ that is
 * pressed sixty times. So they moved behind a 36 dp ✎ beside the card's name.
 *
 *   • OUTSIDE EDIT MODE the footer is the design's `+ Add set` / `− Remove set`
 *     pair (Momentum v3 brought the commonest plan edit back out: "one more set"
 *     is decided mid-exercise, with chalk on your hands), and under it two chips,
 *     `⏸ Rest 1:30 | ▶ Focus`. `− Remove set` takes the LAST row and is not
 *     offered on a one-row exercise — removing that row is removing the
 *     exercise. That has its OWN control, a coral bin beside the ✎: taking an
 *     exercise out used to mean opening edit mode or pressing `−` once per set
 *     until the last one took the card with it, and "skip the leg press, it's
 *     taken" is decided in a second. It does not ask; the screen's Undo covers it.
 *   • IN EDIT MODE the ✎ becomes a green `Done` pill, `EDITING PLAN` appears over
 *     the name, every set row grows its own coral `−` (so you remove the set you
 *     mean, not the bottom one), and the footer becomes `+ Add set`, `+ Warm-up`
 *     (only before anything is logged), `✎ Rest, targets and cue`, and a coral
 *     `− Remove exercise`.
 *
 * Edit mode belongs to the SCREEN, not to the card (`editingExerciseId`): at most
 * one card is in it, and it ends only on `Done`. Shutting the card or logging a
 * set does not end it — a user in the middle of reshaping an exercise who logs a
 * set on the way has not said they are finished reshaping it.
 *
 * ── ROWS ARRIVE AND LEAVE ───────────────────────────────────────────────────
 *
 * A row added — `Add set`, a warm-up, an Undo — grows in from zero height; a row
 * removed slides right and closes, and only THEN leaves the store (`GrowIn`). The
 * last row of an exercise is not removed on its own: removing it is removing the
 * exercise, so it goes through the same path `Remove exercise` does, and gets the
 * same Undo.
 *
 * ── `REMOVE EXERCISE` NO LONGER ASKS ────────────────────────────────────────
 *
 * It animates out and the screen shows `Removed Barbell row · Undo` for 4.5 s.
 * Sets already logged come back with the Undo, which is what the old sheet was
 * protecting; a question on every removal was that protection charged to the
 * nine removals out of ten that were meant.
 *
 * A long press LIFTS the card for reordering. The gesture and the movement live in
 * the screen (it owns the geometry of the list); this component only reports the
 * press and renders the two states it puts a card into — `lifted`, which follows
 * the finger, and `dimmed`, which is every other card while one is in the air. Same
 * language as the routine editor's reorder, deliberately.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { DraftEntry, DraftSet } from '../lib/draft';
import { formatTarget, workingSetLabels } from '../lib/draft';
import { tap, undo } from '../lib/feedback';
import { isTimed as isTimedExercise } from '../lib/setTimer';
import { formatClock } from '../lib/units';
import type { ID, UnitSystem } from '../types/models';
import { curve, danger, elevation, glassTier, halo, motion, palette, tint } from '../theme/tokens';
import { SpecularEdge } from './glass';
import { Icon } from './Icon';
import { useLanguage, useT } from '../hooks/useT';
import { useMotionScale } from '../hooks/useMotionScale';
import { GrowIn, Pop, Stagger, usePressScale } from './motion';
import { OverloadNudge } from './OverloadNudge';
import { Pressable } from './Pressable';
import { QuickAdjust } from './QuickAdjust';
import { RollingNumber } from './RollingNumber';
import { FADE_ON, RunningText } from './RunningText';
import { SetRow, type SetField } from './SetRow';

interface ExerciseCardProps {
  entry: DraftEntry;
  /** This card is showing its sets. At most one card in the list is. */
  isExpanded: boolean;
  /**
   * THE session's next set, when it is one of this card's — otherwise null.
   *
   * Decided by `lib/upNext.ts` off what has been logged, not by which card is
   * open: reaching down the list to read an exercise must not move the mark off
   * the set you are about to do. Exactly one card in the list gets a non-null
   * value, and it is the card that glows. See the file header.
   */
  upNextSetId?: ID | null;
  unitSystem: UnitSystem;
  /**
   * Where this card sits in a superset run. Computed by the screen, which is the
   * only place that can see the cards either side of this one.
   */
  superset?: 'none' | 'start' | 'continue';
  /** The set in this card whose clock is running, if any. */
  timingSetId?: ID | null;
  /**
   * The gym's plates, from Settings — for the `20 + 2×10` line under a barbell
   * lift's weight cell. Passed straight through; only `SetRow` reads it, and only
   * for an exercise that declares a bar weight.
   */
  availablePlatesKg?: readonly number[];
  /** This card is being dragged: it follows the finger and marks itself. */
  isLifted?: boolean;
  /** Another card is being dragged, so this one is not the subject right now. */
  dimmed?: boolean;
  /**
   * Open focus mode on the session's next set.
   *
   * Only handed to the card that HOLDS that set (see `upNextSetId`), because focus
   * mode always shows the work: a `Focus` row on a card you opened to read would
   * take you somewhere else in the session, which is the same confusion the glow
   * was moved off the cursor to avoid.
   */
  onOpenFocus?: () => void;
  /** Tap: open this card, or shut it when it is already the open one. */
  onToggleExpanded: () => void;
  /** Long press — the screen turns this into a drag. Absent = not reorderable. */
  onLift?: () => void;
  onToggleSet: (setId: ID) => void;
  onPatchSet: (setId: ID, patch: Partial<DraftSet>) => void;
  onAddSet: () => void;
  /**
   * Take one row out of the STORE. Called after the row's exit animation, never
   * before — and never for the last row, which goes through `onRemoveExercise`.
   */
  onRemoveSet: (setId: ID) => void;
  /**
   * Session edit mode is on for THIS card — see the file header. The screen owns
   * it, so at most one card is ever in it.
   */
  isEditing?: boolean;
  /** The ✎ and the `Done` pill. Absent = no edit mode on this card. */
  onToggleEditing?: () => void;
  onAcceptOverload: () => void;
  onDismissOverload: () => void;
  /**
   * Put generated warm-up rows on top of this exercise.
   *
   * Absent = no control, which is what an exercise with nothing to warm up for
   * should get rather than a row that does nothing: unweighted work, a session
   * already under way, or a working weight the plates cannot make a fraction of.
   * The SCREEN decides that, because deciding it needs the gym's plates and
   * `lib/warmup.ts`; the card only renders the offer and names what it will add.
   */
  onAddWarmup?: () => void;
  /** "40 × 5 · 60 × 5 · 80 × 3" — what `onAddWarmup` is about to do. */
  warmupSummary?: string | null;
  /**
   * A best this exercise has broken IN THIS SESSION, already logged: "85 kg × 5".
   *
   * The screen computes it, because comparing a row against the standing bests
   * needs the bodyweight of today and `lib/records.ts`, and a card is composition.
   * Null — the normal case — renders nothing at all.
   */
  bestLine?: string | null;
  /**
   * "3 sessions at 80 kg without a rep. One session at 67.5 kg resets it."
   *
   * Computed by the screen — it needs the gym's plates and `lib/deload.ts` — and
   * null on all but a genuinely stalled movement, which is most of them most of
   * the time.
   */
  deloadMessage?: string | null;
  /** Start the clock for a set, or stop the one already running on it. */
  onPressTimer: (setId: ID) => void;
  /**
   * The user's between-sets rest, in seconds — what the `Rest` button will run.
   * Read live from Settings by the screen, so the button's label and the timer it
   * starts are the same number.
   */
  restSeconds?: number;
  /**
   * Start a rest by hand. Only the expanded card gets it, and it is the answer to
   * "auto-rest is off, so how do I run a rest at all" — plus the way back from a
   * `Skip` you didn't mean.
   */
  onStartRest?: () => void;
  /**
   * Drop this exercise, sets and all — edit mode's `Remove exercise`, and the `−`
   * on its last row. The screen animates the card out and offers the Undo.
   */
  onRemoveExercise?: () => void;
  /**
   * Open the exercise editor on THIS movement, mid-workout.
   *
   * The rest between its sets, the weight and count it starts at, how many sets it
   * plans, its ladder, its clock — every one of those is a fact you discover while
   * doing the exercise, and every one of them lived behind three screens: leave the
   * session, find the Library tab, open the tree, find the row. Nobody does that
   * between sets, so the numbers stayed wrong.
   *
   * The edit lands on this card immediately — `activeWorkoutStore.syncExercise`,
   * called by the shell — because an edit made on the open card that only took
   * effect next Tuesday would be the same "I changed it and nothing happened" that
   * `lib/rest.ts` is about.
   */
  onEditExercise?: () => void;
}

function ExerciseCardComponent({
  entry,
  isExpanded,
  upNextSetId = null,
  unitSystem,
  superset = 'none',
  availablePlatesKg,
  timingSetId = null,
  isLifted = false,
  dimmed = false,
  onOpenFocus,
  onToggleExpanded,
  onLift,
  onToggleSet,
  onPatchSet,
  onAddSet,
  onRemoveSet,
  isEditing = false,
  onToggleEditing,
  onAcceptOverload,
  onDismissOverload,
  onAddWarmup,
  warmupSummary,
  bestLine,
  deloadMessage,
  onPressTimer,
  restSeconds = 0,
  onStartRest,
  onRemoveExercise,
  onEditExercise,
}: ExerciseCardProps) {
  /** Which set row has the editor open, and on which field. Card-local state. */
  const t = useT();
  const lang = useLanguage();
  const [focus, setFocus] = useState<{ setId: ID; field: SetField } | null>(null);
  /** Rows on their way out — still drawn, closing, and not yet out of the store. */
  const [leaving, setLeaving] = useState<ReadonlySet<ID>>(() => new Set());
  /**
   * The rows this card has already drawn, so a row it has NOT is one that just
   * arrived and grows in. Seeded with what was there at mount: opening a card is
   * not four rows arriving.
   */
  const known = useRef<Set<ID>>(new Set(entry.sets.map((s) => s.localId)));
  useEffect(() => {
    for (const set of entry.sets) known.current.add(set.localId);
  }, [entry.sets]);

  const completed = entry.sets.filter((s) => s.isCompleted).length;
  const total = entry.sets.length;
  const allDone = completed === total && total > 0;
  /*
   * W, 1, 2, 3 — warm-ups are not numbered as working sets, and the working sets
   * number around them. Derived in `lib/draft.ts`: it is arithmetic over the list,
   * and a component subtracting a running count from an index is a component with
   * a state machine in it.
   */
  const setLabels = workingSetLabels(entry.sets);
  const nudgeWaiting = entry.overload.shouldNudge && !entry.overloadAccepted;
  const isRounds = entry.exercise.countUnit === 'rounds';
  const isTimed = isTimedExercise(entry.exercise);
  const unit = isRounds ? t('round') : t('set');

  /**
   * The `−` on a row. The LAST row is the exercise — see the file header — so it
   * is handed to the screen's removal, Undo and all, rather than to the store.
   */
  const removeRow = (setId: ID) => {
    undo();
    setFocus(null);
    const remaining = entry.sets.filter((s) => !leaving.has(s.localId)).length;
    if (remaining <= 1) {
      onRemoveExercise?.();
      return;
    }
    setLeaving((current) => new Set(current).add(setId));
  };

  /*
   * Each row's handlers, made once per set and reading the card's latest state
   * through `live` when pressed. `SetRow` is memoized, and four fresh closures
   * per row per render meant every row of the open card repainted on every ✓
   * and every ± chip, plate line and all.
   */
  const live = useRef({ removeRow, onPressTimer, onToggleSet });
  live.current = { removeRow, onPressTimer, onToggleSet };
  const rowHandlers = useRef(new Map<ID, RowHandlers>()).current;
  const handlersFor = (setId: ID): RowHandlers => {
    const known = rowHandlers.get(setId);
    if (known) return known;
    const handlers: RowHandlers = {
      onRemove: () => live.current.removeRow(setId),
      onPressTimer: () => {
        setFocus(null); // the clock and the editor never share the row
        live.current.onPressTimer(setId);
      },
      onFocusField: (field) =>
        setFocus((current) =>
          // Tapping the open field again closes the panel.
          current?.setId === setId && current.field === field ? null : { setId, field },
        ),
      onToggleComplete: () => {
        setFocus(null); // committing a set always closes the editor
        live.current.onToggleSet(setId);
      },
    };
    rowHandlers.set(setId, handlers);
    return handlers;
  };

  /* ---------------------------------------------------------------- */
  /* Collapsed                                                         */
  /* ---------------------------------------------------------------- */
  if (!isExpanded) {
    /*
     * The glow. Only on the card holding the session's next set — which already
     * means it has a set left — and only while nothing is being dragged: a green
     * ring on a dimmed card in a list where another card is in the air is two
     * signals fighting.
     *
     * `boxShadow` is the app's one deliberate exception to "exactly one shadow"
     * (`theme/tokens.ts`), and it is spent here because this mark has to be
     * findable at arm's length on a bench. It is decoration on top of the border,
     * never instead of it: on a renderer that ignores it the green ring and the
     * green name still say everything.
     */
    const glowing = upNextSetId != null && !isLifted && !dimmed;
    return (
      <Pressable
        onPress={onToggleExpanded}
        onLongPress={onLift}
        delayLongPress={280}
        accessibilityRole="button"
        accessibilityState={{ expanded: false }}
        accessibilityLabel={`${t('{name}, {done} of {total} sets done', {
          name: entry.exercise.name,
          done: completed,
          total,
        })}${glowing ? `, ${t('your next set is in here')}` : ''}${
          nudgeWaiting ? `, ${t('suggestion waiting')}` : ''
        }${superset === 'none' ? '' : `, ${t('part of a superset')}`}`}
        accessibilityHint={onLift ? t('Long press, then slide to reorder') : undefined}
        style={[
          /* Momentum v3: a flat `card`-tier pane, radius 20 — or the `lit` tier
             when it holds the next set. Flat, never blurred: it repeats. */
          {
            borderRadius: COLLAPSED_RADIUS,
            borderWidth: 1,
            padding: 16,
            backgroundColor: glowing || isLifted ? glassTier.lit.tint : glassTier.card.tint,
            borderColor: glowing || isLifted ? glassTier.lit.border : glassTier.card.border,
            boxShadow: [...(glowing ? halo.repeating : []), ...elevation.e1],
          },
          /*
           * The bracket, as a left border rather than an extra View: a collapsed
           * card is one Pressable and threading a sibling through it would mean
           * wrapping every card in a row just to draw 2 px.
           */
          superset === 'none' ? null : { borderLeftWidth: 2, borderLeftColor: palette.greenDim },
          dimmed ? { opacity: 0.4 } : null,
        ]}
        className="mx-lg mb-sm"
      >
        <View className="flex-row items-center">
          {/* The name RUNS rather than ellipsising: two machines whose names
              differ only at the end are two exercises. See `RunningText`. */}
          <RunningText
            text={entry.exercise.name}
            containerStyle={{ flex: 1 }}
            fadeColor={isLifted || glowing ? FADE_ON.lit : FADE_ON.card}
            className={[
              'text-task',
              glowing ? 'font-semibold text-acc' : allDone ? 'text-ink-faint' : 'text-ink',
            ].join(' ')}
          />

          {/* The waiting suggestion: one 6 px dot, never a badge. */}
          {nudgeWaiting ? (
            <View
              className="ml-md h-[6px] w-[6px] rounded-pill bg-green-bright"
              style={{
                boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 8, color: tint(0.8) }],
              }}
            />
          ) : null}

          {/* Progress as text, rolled when a set lands, and as a ring beside it:
              the text for reading, the ring for the shape of the list at a glance. */}
          <RollingNumber
            value={`${completed}/${total}`}
            lineHeight={20}
            duration={450}
            containerStyle={COUNTER_STYLE}
            className="text-label font-semibold text-ink-muted"
          />
          <View className="ml-sm">
            <MiniRing fraction={total > 0 ? completed / total : 0} done={allDone} />
          </View>
        </View>

        {/* One line of context: what happened last time. */}
        {entry.lastSessionSummary ? (
          <Text
            style={{ fontSize: 13.5, lineHeight: 18 }}
            className="mt-[2px] tabular-nums text-ink-faint"
          >
            {entry.lastSessionSummary}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Expanded                                                          */
  /* ---------------------------------------------------------------- */
  const showRest = onStartRest != null && restSeconds > 0;
  const showFocus = onOpenFocus != null;

  /*
   * `− Remove set` outside edit mode takes the LAST row, the design's pair with
   * `+ Add set`. It is offered only while there are two rows or more: removing
   * the last one is removing the exercise, and that goes through edit mode's
   * `Remove exercise` and its Undo rather than through a button labelled "set".
   */
  const liveRows = entry.sets.filter((s) => !leaving.has(s.localId));
  const lastRow = liveRows.length > 1 ? liveRows[liveRows.length - 1] : null;

  return (
    <View
      className="mx-lg mb-sm mt-xs"
      style={[
        { borderRadius: EXPANDED_RADIUS, boxShadow: [...elevation.e1] },
        dimmed ? { opacity: 0.4 } : null,
      ]}
    >
      {/* Momentum v3: ONE card for the whole exercise — name, plan, nudge, rows
          and footer — on the flat `card` tier. It repeats down the list, so it
          is never blurred; the rest card above is the lit one. */}
      <View
        style={[
          {
            borderRadius: EXPANDED_RADIUS,
            overflow: 'hidden',
            borderWidth: 1,
            padding: 16,
            backgroundColor: glassTier.card.tint,
            borderColor: isLifted ? glassTier.lit.border : glassTier.card.border,
          },
          superset === 'none' ? null : { borderLeftWidth: 2, borderLeftColor: palette.greenDim },
        ]}
      >
        <SpecularEdge color="rgba(236,241,238,0.10)" radius={EXPANDED_RADIUS} />

        {/* Header — name, then the target, then what it was last time. It is
            also the expanded card's grab handle: long-pressing a set row would
            fight the row's own controls, and this is the one part of the card
            that isn't one. */}
        <View className="flex-row items-start">
          <Pressable
            onPress={onToggleExpanded}
            onLongPress={onLift}
            delayLongPress={280}
            accessibilityRole="button"
            accessibilityState={{ expanded: true }}
            accessibilityLabel={entry.exercise.name}
            accessibilityHint={
              onLift
                ? t('Tap to close its sets. Long press, then slide to reorder')
                : t('Tap to close its sets')
            }
            className="flex-1"
          >
            {/* The mode, said in words over the name, for as long as it lasts. */}
            {isEditing ? (
              <Stagger rise={6} duration={240}>
                <Text className="mb-xs text-micro font-semibold uppercase text-acc">
                  {t('Editing plan')}
                </Text>
              </Stagger>
            ) : null}
            <Text
              style={{ fontSize: 19, lineHeight: 24 }}
              className={['font-semibold', isLifted ? 'text-acc' : 'text-ink'].join(' ')}
            >
              {entry.exercise.name}
            </Text>
            <Text
              style={{ fontSize: 14, lineHeight: 19 }}
              className="mt-xs tabular-nums text-ink-muted"
            >
              {formatTarget(entry, lang)}
              {entry.exercise.isUnilateral ? ` · ${t('each side')}` : ''}
              {entry.lastSessionShort
                ? ` · ${t('last: {what}', { what: entry.lastSessionShort })}`
                : ''}
            </Text>

            {/*
              A BEST, ONCE IT HAS HAPPENED — and only once it has. `acc` is the
              app's one accent doing the job it does everywhere else — this is
              new — but there is no medal, no banner and no sound. `lib/records.ts`
              has the argument.
            */}
            {bestLine ? (
              <Text className="mt-xs text-label tabular-nums text-acc">
                {t('New best')} · {bestLine}
              </Text>
            ) : null}

            {/* THE CUE. Only on the OPEN card, faint and single-line: reference
                that must never compete with the numbers below it. */}
            {entry.exercise.cue ? (
              <Text numberOfLines={1} className="mt-xs text-label text-ink-faint">
                {entry.exercise.cue}
              </Text>
            ) : null}
          </Pressable>

          {/* THE WAY OUT OF AN EXERCISE, in one tap and without edit mode — see
              the file header. Edit mode has its own `Remove exercise` row. */}
          {onRemoveExercise && !isEditing ? (
            <RemoveCircle onPress={onRemoveExercise} name={entry.exercise.name} />
          ) : null}

          {/* THE DOOR INTO EDIT MODE, and the way out of it. */}
          {onToggleEditing ? (
            isEditing ? (
              <DonePill onPress={onToggleEditing} />
            ) : (
              <EditCircle onPress={onToggleEditing} name={entry.exercise.name} />
            )
          ) : null}

          {/* The affordance for shutting it. */}
          <Pressable
            onPress={onToggleExpanded}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('Tap to close its sets')}
            className="ml-xs h-[36px] w-[36px] items-center justify-center"
          >
            <Icon name="chevron-down" size={18} color={palette.inkFaint} />
          </Pressable>
        </View>

        {/* The overload offer, in `acc` under the plan — see `OverloadNudge`. */}
        <OverloadNudge
          verdict={entry.overload}
          unitSystem={unitSystem}
          loadMode={entry.exercise.loadMode}
          countUnit={entry.exercise.countUnit}
          resolved={entry.overloadAccepted}
          onAccept={onAcceptOverload}
          onDismiss={onDismissOverload}
        />

        {/*
          A STALL, stated and nothing else — no `Use` button beside it. Cutting a
          session's weight is a decision about a training block, and an app that
          took it on one tap would be rewriting a plan off three data points. So
          this is a sentence in muted ink rather than the accent the overload
          offer gets. It renders only when the nudge does not — the screen decides.
        */}
        {deloadMessage ? (
          <View className="mt-sm flex-row items-start" style={{ gap: 6 }}>
            <Icon name="trending-down" size={16} color={palette.inkMuted} />
            <Text className="flex-1 text-label tabular-nums text-ink-muted">{deloadMessage}</Text>
          </View>
        ) : null}

        <View className="mt-md">
          {entry.sets.map((set, index) => (
            <GrowIn
              key={set.localId}
              appear={!known.current.has(set.localId)}
              leaving={leaving.has(set.localId)}
              onLeft={() => {
                setLeaving((current) => {
                  const next = new Set(current);
                  next.delete(set.localId);
                  return next;
                });
                onRemoveSet(set.localId);
              }}
            >
              {/* 6 between rows, inside the GrowIn so a leaving row takes its
                  gap with it. */}
              <View style={index > 0 ? { marginTop: 6 } : undefined}>
                <SetRow
                  set={set}
                  workingNumber={setLabels[index]}
                  exercise={entry.exercise}
                  unitSystem={unitSystem}
                  /* The mark for "do this one". Every card has a next row; only
                     one row in the session is THE next row, and lighting all of
                     them would mark nothing. `upNextSetId` is that row. */
                  isUpNext={set.localId === upNextSetId}
                  /* The two gestures on the up-next row — see `SetRow`. */
                  onOpenFocus={set.localId === upNextSetId ? onOpenFocus : undefined}
                  focusedField={focus?.setId === set.localId ? focus.field : null}
                  isTimed={isTimed}
                  isTiming={timingSetId === set.localId}
                  availablePlatesKg={availablePlatesKg}
                  /* Edit mode's `−`, on every row — see the file header. */
                  onRemove={isEditing ? handlersFor(set.localId).onRemove : undefined}
                  onPressTimer={handlersFor(set.localId).onPressTimer}
                  onFocusField={handlersFor(set.localId).onFocusField}
                  onToggleComplete={handlersFor(set.localId).onToggleComplete}
                />
              </View>

              {focus?.setId === set.localId ? (
                /* The inline editor opens by growing its own height, so the rows
                   under it are pushed rather than jumped. */
                <GrowIn duration={260}>
                  <QuickAdjust
                    field={focus.field}
                    set={set}
                    exercise={entry.exercise}
                    unitSystem={unitSystem}
                    onChange={(patch) => onPatchSet(set.localId, patch)}
                    onClose={() => setFocus(null)}
                    onRemoveSet={() => removeRow(set.localId)}
                  />
                </GrowIn>
              ) : null}
            </GrowIn>
          ))}
        </View>

        {isEditing ? (
          <GrowIn key="editing" duration={motion.row}>
            <View
              className="mt-md overflow-hidden"
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: 'rgba(236,241,238,0.06)',
              }}
            >
              <View className="flex-row">
                <FooterButton
                  icon="plus"
                  label={t('Add {unit}', { unit })}
                  tone="green"
                  onPress={() => {
                    tap();
                    onAddSet();
                  }}
                />
                {/* WARM-UP, and it states the numbers it is about to add — a
                    button that silently inserts three rows is one the user has to
                    undo to find out about. Only before anything is logged:
                    `warmupSets` decides. */}
                {onAddWarmup && warmupSummary ? (
                  <>
                    <View className="w-hairline bg-hairline" />
                    <Pressable
                      onPress={() => {
                        tap();
                        onAddWarmup();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('Add warm-up sets: {what}', { what: warmupSummary })}
                      style={({ pressed }) =>
                        pressed ? { backgroundColor: tint(0.08) } : undefined
                      }
                      className="h-row flex-1 items-center justify-center px-sm"
                    >
                      <Text className="text-label font-medium text-acc">{`+ ${t('Warm-up')}`}</Text>
                      <Text
                        numberOfLines={1}
                        className="text-[11px] tabular-nums text-ink-faint"
                        allowFontScaling={false}
                      >
                        {warmupSummary}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </View>

              {/* The plan's own numbers — rest, defaults, targets, the cue — in
                  the exercise editor, mid-workout. Muted: it changes the plan, it
                  does not advance it. */}
              {onEditExercise ? (
                <>
                  <View className="h-hairline bg-hairline" />
                  <FooterButton
                    icon="edit"
                    label={t('Rest, targets and cue')}
                    tone="muted"
                    accessibilityLabel={t('Edit {name}: rest, defaults and targets', {
                      name: entry.exercise.name,
                    })}
                    onPress={() => {
                      tap();
                      onEditExercise();
                    }}
                  />
                </>
              ) : null}

              {/* The way out of an exercise in one tap, in the one hue that means
                  "this deletes plan". It does not ask: the screen offers the Undo. */}
              {onRemoveExercise ? (
                <>
                  <View className="h-hairline bg-hairline" />
                  <FooterButton
                    icon="minus"
                    label={t('Remove exercise')}
                    tone="danger"
                    accessibilityLabel={t('Remove {name} from this workout', {
                      name: entry.exercise.name,
                    })}
                    onPress={() => {
                      undo();
                      onRemoveExercise();
                    }}
                  />
                </>
              ) : null}
            </View>
          </GrowIn>
        ) : (
          <>
            {/* `+ Add set` / `− Remove set` — the design's pair under the rows. */}
            <View className="mt-md flex-row items-center justify-between">
              <TextAction
                label={`+ ${t('Add {unit}', { unit })}`}
                tone="acc"
                onPress={() => {
                  tap();
                  onAddSet();
                }}
              />
              {lastRow ? (
                <TextAction
                  label={`− ${t('Remove {unit}', { unit })}`}
                  tone="muted"
                  onPress={() => removeRow(lastRow.localId)}
                />
              ) : null}
            </View>

            {/* Rest on demand — the answer to "auto-rest is off, so how do I run
                a rest at all", and the way back from a `Skip` you didn't mean —
                and the named door into focus mode on the card holding the next
                set. Glass chips, so they read as controls and not as sets. */}
            {showRest || showFocus ? (
              <View className="mt-sm flex-row" style={{ gap: 8 }}>
                {showRest ? (
                  <FooterChip
                    icon="pause"
                    label={t('Rest {clock}', { clock: formatClock(restSeconds) })}
                    tone="muted"
                    accessibilityLabel={t('Start a {clock} rest', {
                      clock: formatClock(restSeconds),
                    })}
                    onPress={() => onStartRest?.()}
                  />
                ) : null}
                {showFocus ? (
                  <FooterChip
                    icon="play"
                    label={t('Focus')}
                    tone="acc"
                    accessibilityLabel={t('Open focus mode on your next set')}
                    onPress={() => {
                      tap();
                      onOpenFocus?.();
                    }}
                  />
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */

/** A row's handlers, bound to its set once — see `handlersFor`. */
interface RowHandlers {
  onRemove: () => void;
  onPressTimer: () => void;
  onFocusField: (field: SetField) => void;
  onToggleComplete: () => void;
}

/** Hoisted: `RollingNumber` is memoized, and an inline object is a new prop. */
const COUNTER_STYLE = { marginLeft: 10 };

/** The expanded card's corner — the design's 22. */
const EXPANDED_RADIUS = 22;
/** A collapsed card's corner — the design's 20, `radius.card`. */
const COLLAPSED_RADIUS = 20;

/**
 * `+ Add set` / `− Remove set`: 40 tall, text only, 15 / 500. The accent one
 * adds; the muted one takes away.
 */
function TextAction({
  label,
  tone,
  onPress,
}: {
  label: string;
  tone: 'acc' | 'muted';
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        { height: 40, paddingHorizontal: 10, borderRadius: 12, justifyContent: 'center' },
        pressed
          ? { backgroundColor: tone === 'acc' ? tint(0.08) : 'rgba(236,241,238,0.04)' }
          : null,
      ]}
    >
      <Text
        numberOfLines={1}
        style={{ fontSize: 15, color: tone === 'acc' ? palette.acc : palette.inkMuted }}
        className="font-medium"
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** `⏸ Rest 1:30` / `▶ Focus` — two 44 dp glass chips sharing the row. */
function FooterChip({
  icon,
  label,
  tone,
  onPress,
  accessibilityLabel,
}: {
  icon: 'pause' | 'play';
  label: string;
  tone: 'acc' | 'muted';
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const color = tone === 'acc' ? palette.acc : palette.inkMuted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        flex: 1,
        height: 44,
        borderRadius: 9999,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
        backgroundColor: pressed ? 'rgba(236,241,238,0.09)' : 'rgba(236,241,238,0.05)',
        borderWidth: 1,
        borderColor: tone === 'acc' ? tint(0.3) : 'rgba(236,241,238,0.08)',
      })}
    >
      <Icon name={icon} size={13} color={color} />
      <Text
        numberOfLines={1}
        style={{ color, marginLeft: 8 }}
        className="text-label font-medium tabular-nums"
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One cell of the footer: an icon and a label, 56 high, centred. Every row and
 * half-row of both footers is one of these, so the two modes are the same shape.
 */
function FooterButton({
  icon,
  label,
  tone,
  onPress,
  accessibilityLabel,
}: {
  icon: 'plus' | 'minus' | 'edit' | 'pause' | 'play';
  label: string;
  tone: 'green' | 'muted' | 'danger';
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const color = tone === 'green' ? palette.acc : tone === 'danger' ? danger : palette.inkMuted;
  const glyph = tone === 'muted' ? palette.inkFaint : color;
  const wash =
    tone === 'danger'
      ? 'rgba(224,115,95,0.08)'
      : tone === 'green'
        ? tint(0.08)
        : 'rgba(236,241,238,0.04)';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => (pressed ? { backgroundColor: wash } : undefined)}
      className="h-row flex-1 flex-row items-center justify-center px-sm"
    >
      <Icon name={icon} size={13} color={glyph} />
      <Text
        numberOfLines={1}
        style={{ color }}
        className={['ml-sm text-label tabular-nums', tone === 'muted' ? '' : 'font-medium'].join(
          ' ',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The ✎: a 36 dp glass circle beside the name. It sinks and tilts −12° under the
 * finger — a pencil being picked up — which is the only flourish in the card.
 */
function EditCircle({ onPress, name }: { onPress: () => void; name: string }) {
  const t = useT();
  const press = usePressScale(0.88, -12);
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t('Edit the plan of {name}', { name })}
      className="ml-sm"
    >
      <Animated.View
        style={{
          width: 36,
          height: 36,
          borderRadius: 9999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(236,241,238,0.055)',
          borderWidth: 1,
          borderColor: 'rgba(236,241,238,0.07)',
          transform: press.style.transform,
        }}
      >
        <Icon name="edit" size={16} color={palette.inkMuted} />
      </Animated.View>
    </Pressable>
  );
}

/**
 * The bin beside the ✎: the same 36 dp glass circle, coral glyph. It does not
 * ask — the screen slides the card out and offers the Undo, logged sets and all.
 */
function RemoveCircle({ onPress, name }: { onPress: () => void; name: string }) {
  const t = useT();
  const press = usePressScale(0.88);
  return (
    <Pressable
      onPress={() => {
        undo();
        onPress();
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t('Remove {name} from this workout', { name })}
      className="ml-sm"
    >
      <Animated.View
        style={{
          width: 36,
          height: 36,
          borderRadius: 9999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(224,115,95,0.06)',
          borderWidth: 1,
          borderColor: 'rgba(224,115,95,0.16)',
          transform: press.style.transform,
        }}
      >
        <Icon name="trash" size={16} color={danger} />
      </Animated.View>
    </Pressable>
  );
}

/** `✓ Done` — the only way out of edit mode, and it arrives with a pop. */
function DonePill({ onPress }: { onPress: () => void }) {
  const t = useT();
  return (
    <Pop duration={300} style={{ marginLeft: 8 }}>
      <Pressable
        onPress={() => {
          tap();
          onPress();
        }}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={t('Done editing the plan')}
        style={{
          height: 36,
          paddingHorizontal: 14,
          borderRadius: 9999,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: palette.green,
          borderWidth: 1,
          borderColor: tint(0.5),
          boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 14, color: tint(0.3) }],
        }}
      >
        <Icon name="check" size={14} color={palette.onAcc} />
        <Text
          allowFontScaling={false}
          style={{ fontSize: 13, marginLeft: 6, color: palette.onAcc }}
          className="font-semibold"
        >
          {t('Done')}
        </Text>
      </Pressable>
    </Pop>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_SIZE = 22;
const RING_STROKE = 2.5;
const RING_R = (RING_SIZE - RING_STROKE * 2) / 2 + RING_STROKE / 2;
const RING_LENGTH = 2 * Math.PI * RING_R;

/**
 * The collapsed card's progress ring: 22 dp, a hairline track, `green-bright`
 * fill — `ink-faint` once the exercise is done, because done is history — and
 * the arc travels to its new share over 600 ms when a set lands.
 */
function MiniRing({ fraction, done }: { fraction: number; done: boolean }) {
  const scale = useMotionScale();
  const clamped = Math.max(0, Math.min(1, fraction));
  const v = useRef(new Animated.Value(clamped)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: clamped,
      duration: 600 * scale,
      easing: curve(motion.ease),
      // strokeDashoffset is an SVG prop, not a transform: JS driver.
      useNativeDriver: false,
    }).start();
  }, [clamped, scale, v]);
  const offset = useMemo(
    () => v.interpolate({ inputRange: [0, 1], outputRange: [RING_LENGTH, 0] }),
    [v],
  );
  return (
    <Svg
      width={RING_SIZE}
      height={RING_SIZE}
      style={{ transform: [{ rotate: '-90deg' }] }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_R}
        fill="none"
        stroke={palette.hairline}
        strokeWidth={RING_STROKE}
      />
      <AnimatedCircle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_R}
        fill="none"
        stroke={done ? palette.inkFaint : palette.acc}
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={offset}
      />
    </Svg>
  );
}

export const ExerciseCard = memo(ExerciseCardComponent);
