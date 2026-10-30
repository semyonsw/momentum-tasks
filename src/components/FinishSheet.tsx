/**
 * FinishSheet — the end of a workout, stated, and the one question worth asking
 * on the way out.
 *
 *   ╭────────────────────────────────────────────╮
 *   │                   ▬▬▬▬                     │
 *   │ SESSION COMPLETE                           │
 *   │ Workout 92                                 │
 *   │ ╭ TIME    ╮ ╭ SETS    ╮ ╭ VOLUME   ╮       │  ← roll up from 0
 *   │ │ 68 min  │ │ 17      │ │ 6,240 kg │       │
 *   │ 7 sets are still unlogged. They won't be   │
 *   │ saved.                                     │
 *   │ HOW DID THAT GO                            │
 *   │ ( Easy | ▓Right▓ | Brutal )                │  ← the thumb slides
 *   │ ╭──────────── Save workout ────────────╮   │
 *   │              Keep training                 │
 *   ╰────────────────────────────────────────────╯
 *
 * ── THE MOTION PASS MADE IT A MOMENT ──────────────────────────────────────
 *
 * It slides up over a scrim that fades in, and the three numbers ROLL UP FROM
 * ZERO a beat after it lands (`revealStats`, 80 ms): minutes, sets and the volume,
 * the last one lit because it is the one that grows session over session. None
 * of it is decoration over a delay — the Save button is live from the first frame,
 * and a thumb that already knows where it is going is never made to wait for a
 * number to finish rolling.
 *
 * A sheet, not a dialog, for one reason: both buttons have to stay in the bottom
 * third where the thumb already is. A centred dialog puts the destructive option
 * in the middle of the screen and asks the user to reach for it.
 *
 * The destructive path is stated as a FACT and rendered in the same green as
 * every other primary action. There is no red in this app — a red button teaches
 * people to fear a button they press after every workout.
 *
 * ── THE PLAN OFFER ──────────────────────────────────────────────────────────
 *
 * When the sets you actually did disagree with what the routine plans, one extra
 * button writes the real number back. It is derived from what you did, not typed
 * into a form, which is this app's whole idiom for a plan — the same idiom as a
 * prefill coming from last session.
 *
 * Since the 2.9 redesign (#6) the offer is a `Changed from the plan` card —
 * `Bench press  3 sets → 4 sets` — and a two-line primary button that says what
 * the tap does in full: `Save and make 4 sets the plan for Bench press`, over
 * `Next Push starts with 4 × 80 kg. Other exercises stay as planned.` The old
 * `Finish and update the plan` needed the sentence above it to be understood.
 * `Save workout` steps down to secondary beside it, and `Keep training` is the
 * ghost way back. The words are `lib/finishSheet.ts`'s `planOffer`.
 *
 * Four things it is not:
 *
 *  • NOT AUTOMATIC. A routine is a template, and quietly rewriting it because
 *    somebody did an extra set on a good day is the app deciding what the plan is.
 *  • NOT A NAG. Declining is `Finish`, the button that was already there. There is
 *    no second ask, and the offer does not come back for this session.
 *  • NOT CONGRATULATIONS. "Dips did 5 sets, not 4" is the whole sentence. Five is
 *    not better than four, it is what happened.
 *  • NOT FOR A ONE-OFF SESSION. Only a workout that came from a routine has a plan
 *    to update, and an exercise added mid-session has no routine item — deciding to
 *    do neck work halfway through pull day says something about today.
 *    `plannedSetDiff` is where all of that is decided and tested.
 *
 * ── RECORDS THIS SESSION (W6) ──────────────────────────────────────────────
 *
 *   │ RECORDS THIS SESSION                       │
 *   │ ╭ ✦ Bench press · 82.5 × 5 · new best ──╮  │  ← lit, one spark lands
 *   │ ╰   e1RM, 96.3 kg ──────────────────────╯  │
 *   │ ╭ ✦ Plank · 3:10 · longest yet, 3:10 ───╮  │
 *
 * One to three rows, one per exercise, and NOTHING when nothing moved — no
 * "no records today" line, which would turn an ordinary good session into a
 * miss. `recordsBrokenIn` decides which and in what order. Quiet on purpose
 * (IMPLEMENTATION_DECISIONS row 7): ONE `SparkBurst` on the first row as the
 * sheet lands, and one line each. Rejected: the design's light sweep and a
 * banner, and a spark per row — the README's "no medals, no banners" is the
 * reason the bests were a micro line in the first place.
 *
 * ── THE MILESTONE (E4, Wave 3 switch on only) ─────────────────────────────
 *
 * At the 50th, 100th, 250th, 500th… workout, once, a lit card sits above the
 * records: `Workout 100 · Since 14 Feb 2025. 2,014 sets.` It takes the sheet's
 * one spark (the first record row then lands without its own), so the sheet
 * still has a single celebration. Which finish, and "only once", are
 * `lib/milestones.ts`; with the switch off the prop is null and the sheet is
 * exactly as before.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMotionScale } from '../hooks/useMotionScale';
import { useLanguage, useT, type Translate } from '../hooks/useT';
import type { PlanOffer } from '../lib/finishSheet';
import { formatValue } from '../lib/money';
import { kgToLb, unitLabel } from '../lib/units';
import type { UnitSystem } from '../types/models';
import { curve, glass, gradientFill, motion, palette, radius, tint } from '../theme/tokens';
import { SpecularEdge } from './glass';
import { Kicker, PrimaryButton } from './primitives';
import { RollingNumber } from './RollingNumber';
import { SparkBurst } from './SparkBurst';
import { sparkle } from '../lib/feedback';
import { SlidingThumb } from './SlidingThumb';
import { LinearGradient } from 'expo-linear-gradient';
import type { SessionEffort } from '../types/models';

/**
 * The three answers, in the order they run from easy to hard.
 *
 * `Right` in the middle rather than "Moderate" or "OK": the useful reading of a
 * session is whether it was pitched correctly, and "right" is the word a lifter
 * actually uses for a day that went to plan.
 */
const EFFORT_CHOICES: readonly SessionEffort[] = ['easy', 'right', 'hard'];

/**
 * A function rather than a constant, because the labels are translated: a
 * module-level record would be frozen in whichever language the app started in.
 */
function effortLabels(t: Translate): Record<SessionEffort, string> {
  return {
    easy: t('Easy'),
    right: t('Right'),
    hard: t('Brutal'),
  };
}

interface FinishSheetProps {
  /** Sets the user planned but never logged. Drives the whole copy. */
  unloggedCount: number;
  loggedCount: number;
  /**
   * The rows and the button's two lines (`planOffer`), or null when the session
   * matched the plan (or had no plan). Null hides the card and the button.
   */
  planOffer: PlanOffer | null;
  /**
   * "Wide pull-ups · new max 17 · 17 + 10 + 9 + 8 + 7 next time" — what the
   * ladders in this session earned, or null when none of them moved.
   *
   * A STATEMENT, not an offer, and that is the difference between it and
   * `planChange` directly above. A routine is a template the user wrote, so
   * rewriting it is a question. A ladder is a progression they switched on so that
   * it would move without being asked — see `ladderOutcomes`. It gets a line
   * because being pushed one rep further is the whole feature and the user should
   * see the number that did it, not because there is anything to decide.
   */
  ladderChange: string | null;
  /**
   * HOW IT FELT, and the answer already given if the sheet has been here before.
   *
   * One tap, three choices, and skipping it is pressing the button that was already
   * there — which is the whole reason it can live on this sheet at all. `SessionEffort`
   * has the argument for why this exists when per-set RPE deliberately does not.
   */
  effort?: SessionEffort;
  onSetEffort?: (effort: SessionEffort) => void;
  onConfirm: () => void;
  /** Finish, and write the session's set counts back to the routine. */
  onConfirmAndUpdatePlan: () => void;
  onDismiss: () => void;
  /** What this workout will be saved as. Null titles the sheet without a number. */
  workoutNumber?: number | null;
  /** Minutes since the start, or null for a session that never started. */
  minutes?: number | null;
  /** Kilograms moved in the working sets — `sessionVolume`. */
  volumeKg?: number;
  /** Shown in the lifter's own unit: a pounds user sees pounds moved. */
  unitSystem?: UnitSystem;
  /**
   * The records this session broke, already worded (`describeSessionRecord`):
   * at most three, most significant first. Empty hides the block entirely.
   */
  records?: readonly FinishRecord[];
  /**
   * E4: the milestone card (`lib/milestones.ts`), already worded, or null. Only
   * ever set with Wave 3's switch on; null (the default) draws nothing.
   */
  milestone?: FinishMilestone | null;
}

/** The milestone card's three facts: `100`, `Workout 100`, `Since … . 2,014 sets.` */
export interface FinishMilestone {
  n: number;
  title: string;
  line: string;
}

/** One row of `Records this session`: the set, and the record it set (lit). */
export interface FinishRecord {
  key: string;
  lead: string;
  record: string;
}

export function FinishSheet({
  unloggedCount,
  loggedCount,
  planOffer,
  ladderChange,
  effort,
  onSetEffort,
  onConfirm,
  onConfirmAndUpdatePlan,
  onDismiss,
  workoutNumber = null,
  minutes = null,
  volumeKg = 0,
  unitSystem = 'metric',
  records = [],
  milestone = null,
}: FinishSheetProps) {
  const t = useT();
  const lang = useLanguage();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const motionScale = useMotionScale();
  const efforts = effortLabels(t);

  /* The sheet rises over a scrim that fades; `motion.sheet` on the base curve. */
  const scrim = useRef(new Animated.Value(motionScale === 0 ? 1 : 0)).current;
  const rise = useRef(new Animated.Value(motionScale === 0 ? 0 : height)).current;
  /** Flips 80 ms after mount, so the numbers roll UP rather than simply appear. */
  const [revealStats, setRevealStats] = useState(motionScale === 0);
  useEffect(() => {
    Animated.parallel([
      Animated.timing(scrim, {
        toValue: 1,
        duration: 260 * motionScale,
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: motion.sheet * motionScale,
        easing: curve(motion.ease),
        useNativeDriver: true,
      }),
    ]).start();
    const reveal = setTimeout(() => setRevealStats(true), 80 * motionScale);
    // The digits rolling up are FELT rolling: soft ticks across the roll.
    if (motionScale > 0) sparkle(5, 110, 80);
    return () => clearTimeout(reveal);
    // Mount only: the sheet arrives once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [trackWidth, setTrackWidth] = useState(0);
  const effortIndex = effort ? EFFORT_CHOICES.indexOf(effort) : null;

  return (
    <View className="absolute inset-0" accessibilityViewIsModal>
      {/* Scrim. Tapping it is the same as "Keep training": the safe option is
          always the easy one, even when the easy one is a mis-tap. */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: palette.scrim,
          opacity: scrim,
        }}
      >
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={t('Keep training')}
          style={{ flex: 1 }}
        />
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: 12,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 24,
          maxHeight: height * 0.94,
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
          backgroundColor: palette.surface,
          borderTopWidth: 1,
          borderTopColor: 'rgba(236,241,238,0.08)',
          transform: [{ translateY: rise }],
        }}
      >
        <View className="mb-[18px] h-[4px] w-[36px] self-center rounded-pill bg-hairline" />
        {/* Scrolls only when it must: three records, a plan line and a ladder line
            on a short phone would otherwise push the title off the top. */}
        <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
          <Kicker tone="green">{t('Session complete')}</Kicker>
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ fontSize: 30, lineHeight: 34, letterSpacing: -0.9 }}
            className="mt-[6px] font-semibold text-ink"
          >
            {workoutNumber != null
              ? t('Workout {number}', { number: workoutNumber })
              : t('Finish workout?')}
          </Text>

          {/* The three facts of the session, rolling up from zero. The last one is
            lit: it is the number that grows workout over workout. */}
          <View className="mt-[18px] flex-row" style={{ gap: 8 }}>
            <StatTile
              label={t('Time')}
              value={revealStats ? String(Math.max(0, minutes ?? 0)) : '0'}
              unit={t('min')}
              duration={900}
            />
            <StatTile
              label={t('Sets')}
              value={revealStats ? String(loggedCount) : '0'}
              duration={900}
            />
            <StatTile
              label={t('Volume')}
              value={
                revealStats
                  ? formatValue(Math.round(unitSystem === 'imperial' ? kgToLb(volumeKg) : volumeKg))
                  : '0'
              }
              unit={unitLabel(unitSystem, lang)}
              duration={1100}
              lit
            />
          </View>

          {/* E4: above the records, as the design draws it. It takes the
              sheet's one spark; the record row below it then lands quietly. */}
          {milestone ? <MilestoneCard milestone={milestone} /> : null}

          {records.length > 0 ? (
            <>
              <Kicker tone="faint" className="mt-[20px]">
                {t('Records this session')}
              </Kicker>
              <View className="mt-[8px]" style={{ gap: 6 }}>
                {records.map((record, index) => (
                  <RecordRow
                    key={record.key}
                    record={record}
                    lit={index === 0}
                    spark={index === 0 && !milestone}
                  />
                ))}
              </View>
            </>
          ) : null}

          {/* Only when there is something to lose. A session with everything logged
            is on this sheet to be saved, and telling it "0 sets are still
            unlogged" would be the sheet reading out a zero. */}
          {unloggedCount > 0 ? (
            <Text className="mt-lg text-body tabular-nums text-ink-muted">
              {t('{count} still unlogged. They won’t be saved.', {
                count:
                  unloggedCount === 1
                    ? t('{count} set is', { count: unloggedCount })
                    : t('{count} sets are', { count: unloggedCount }),
              })}
            </Text>
          ) : null}

          {/* What the ladder did. Green, because it is the one thing on this sheet
            that is progressive overload — the app's single meaning for colour. */}
          {ladderChange ? (
            <Text className="mt-lg text-body tabular-nums text-green-bright">{ladderChange}</Text>
          ) : null}

          {/* What moved, one row per exercise, above the button that acts on it:
            the card is the fact about the session, the button the choice about
            the routine. */}
          {planOffer ? <PlanChangesCard offer={planOffer} /> : null}

          {/*
          HOW DID THAT GO — above the buttons, because it is about the session and
          the buttons are about what to do with it.

          One track, three words, and a green thumb that SLIDES to the answer.
          Nothing is preselected — an answer the user did not give must not be
          recorded, so the thumb is not drawn until there is one — and tapping the
          selected word again takes it back, which is why there is no fourth
          segment reading `Skip`.
        */}
          {onSetEffort ? (
            <>
              <Kicker tone={effort ? 'green' : 'faint'} className="mt-[20px]">
                {t('How did that go')}
              </Kicker>
              <View
                accessibilityRole="radiogroup"
                onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
                style={{
                  marginTop: 8,
                  height: 44,
                  flexDirection: 'row',
                  padding: 4,
                  borderRadius: radius.pill,
                  backgroundColor: 'rgba(236,241,238,0.03)',
                  borderWidth: 1,
                  borderColor: palette.hairline,
                }}
              >
                <SlidingThumb
                  index={effortIndex}
                  count={EFFORT_CHOICES.length}
                  trackWidth={trackWidth - 2}
                  duration={320}
                  bezier={[0.34, 1.3, 0.64, 1]}
                  style={{
                    borderRadius: radius.pill,
                    backgroundColor: palette.green,
                  }}
                />
                {EFFORT_CHOICES.map((choice) => {
                  const selected = effort === choice;
                  return (
                    <Pressable
                      key={choice}
                      onPress={() => onSetEffort(choice)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={efforts[choice]}
                      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text
                        maxFontSizeMultiplier={1.3}
                        style={{ fontSize: 13 }}
                        className={
                          selected ? 'font-semibold text-on-acc' : 'font-medium text-ink-muted'
                        }
                      >
                        {efforts[choice]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <View className="mt-[20px]">
            {planOffer ? (
              <>
                <PlanButton offer={planOffer} onPress={onConfirmAndUpdatePlan} />
                <View className="h-sm" />
                <PrimaryButton label={t('Save workout')} variant="ghost" onPress={onConfirm} />
              </>
            ) : (
              /* Demoted to ghost above when there are two ways to finish, so the two
               are not one mis-tap apart at the same weight. Neither is
               destructive: both save the workout, and only one also touches the
               routine. */
              <SaveButton label={t('Save workout')} onPress={onConfirm} />
            )}
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={t('Keep training')}
              className="mt-xs h-[48px] items-center justify-center"
            >
              <Text className="text-label font-medium text-ink-muted">{t('Keep training')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/**
 * One record. The first is lit and is where the session's single spark lands; the
 * rest sit on plain glass, so the block reads as one moment with footnotes.
 */
function RecordRow({
  record,
  lit,
  spark,
}: {
  record: FinishRecord;
  lit: boolean;
  /** The sheet's single spark — moved to the milestone card when there is one. */
  spark: boolean;
}) {
  const motionScale = useMotionScale();
  return (
    <View
      accessible
      accessibilityLabel={`${record.lead} · ${record.record}`}
      style={{
        minHeight: 56,
        borderRadius: radius.row,
        borderWidth: 1,
        paddingVertical: 8,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: lit ? tint(0.13) : glass.raised,
        borderColor: lit ? tint(0.3) : glass.raisedEdge,
      }}
    >
      <Text
        maxFontSizeMultiplier={1.3}
        style={{
          fontSize: 20,
          width: 22,
          textAlign: 'center',
          color: lit ? palette.c1 : palette.acc,
        }}
      >
        ✦
      </Text>
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ flex: 1, fontSize: 15.5, lineHeight: 21 }}
        className="tabular-nums text-ink"
      >
        {record.lead} · <Text className="text-green-bright">{record.record}</Text>
      </Text>
      {spark && motionScale > 0 ? <SparkBurst y={20} /> : null}
    </View>
  );
}

/**
 * The milestone (E4, design 2): a lit card, the number in a gradient disc, one
 * line of what it adds up to. ONE `SparkBurst` and nothing else — no rise, no
 * light sweep (IMPLEMENTATION_DECISIONS row 7). It is shown once per milestone,
 * which `lib/milestones.ts` decides; this only draws it.
 */
function MilestoneCard({ milestone }: { milestone: FinishMilestone }) {
  const t = useT();
  const motionScale = useMotionScale();
  return (
    <View
      accessible
      accessibilityLabel={`${t('Milestone')}. ${milestone.title}. ${milestone.line}`}
      style={{
        marginTop: 20,
        minHeight: 84,
        borderRadius: radius.card,
        borderWidth: 1,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: tint(0.13),
        borderColor: tint(0.3),
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LinearGradient
          {...gradientFill()}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <Text
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ fontSize: milestone.n >= 1000 ? 15 : 19, paddingHorizontal: 4 }}
          className="font-semibold tabular-nums text-on-acc"
        >
          {milestone.n}
        </Text>
      </View>
      <View className="flex-1">
        <Kicker tone="green">{t('Milestone')}</Kicker>
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 22, lineHeight: 27, letterSpacing: -0.4 }}
          className="mt-[2px] font-semibold text-ink"
        >
          {milestone.title}
        </Text>
        <Text
          maxFontSizeMultiplier={1.3}
          className="mt-[2px] text-label tabular-nums text-ink-muted"
        >
          {milestone.line}
        </Text>
      </View>
      {motionScale > 0 ? <SparkBurst y={40} /> : null}
    </View>
  );
}

/** One of the three numbers. `lit` is the volume — see the sheet. */
function StatTile({
  label,
  value,
  unit,
  duration,
  lit = false,
}: {
  label: string;
  value: string;
  /** `min` / `kg` after the number, small: the label names the quantity now. */
  unit?: string;
  duration: number;
  lit?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        padding: 14,
        borderRadius: radius.row,
        borderWidth: 1,
        backgroundColor: lit ? tint(0.13) : 'rgba(236,241,238,0.055)',
        borderColor: lit ? tint(0.3) : 'rgba(236,241,238,0.06)',
      }}
    >
      <Text
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        style={{ fontSize: 12.5, letterSpacing: 1.1 }}
        className={['font-semibold uppercase', lit ? 'text-green-bright' : 'text-ink-faint'].join(
          ' ',
        )}
      >
        {label}
      </Text>
      <View className="mt-[6px] flex-row items-baseline">
        <RollingNumber
          value={value}
          lineHeight={30}
          duration={duration}
          style={{ fontSize: 26 }}
          className={['font-semibold', lit ? 'text-green-bright' : 'text-ink'].join(' ')}
        />
        {unit ? (
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            className={['ml-[4px] text-label', lit ? 'text-green-bright' : 'text-ink-muted'].join(
              ' ',
            )}
          >
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * `Changed from the plan` — one row per exercise whose set count moved, the
 * name on the left and `3 sets → 4 sets` on the right. Plain glass: it is a
 * fact, and the button under it is where the accent goes.
 */
function PlanChangesCard({ offer }: { offer: PlanOffer }) {
  const t = useT();
  return (
    <>
      <Kicker tone="faint" className="mt-[20px]">
        {t('Changed from the plan')}
      </Kicker>
      <View
        className="mt-[8px]"
        style={{
          borderRadius: radius.row,
          borderWidth: 1,
          backgroundColor: glass.raised,
          borderColor: glass.raisedEdge,
          paddingHorizontal: 14,
        }}
      >
        {offer.rows.map((row, index) => (
          <View
            key={row.key}
            accessible
            accessibilityLabel={`${row.name}: ${row.change}`}
            style={{
              minHeight: 48,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderTopWidth: index > 0 ? 1 : 0,
              borderTopColor: palette.hairline,
            }}
          >
            <Text
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              className="flex-1 text-body font-medium text-ink"
            >
              {row.name}
            </Text>
            <Text maxFontSizeMultiplier={1.3} className="text-label tabular-nums text-ink-muted">
              {row.change}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

/**
 * The plan offer as a button that says everything it does: the action on the
 * first line, what it means for the next session on the second (12.5 px). The
 * commit gradient, like `Save workout` when it is alone — it is the primary.
 */
function PlanButton({ offer, onPress }: { offer: PlanOffer; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={offer.title}
      accessibilityHint={offer.caption}
      // A static style: this file's `Pressable` is React Native's, whose style
      // callback NativeWind drops (see `components/Pressable.tsx`).
      style={{
        minHeight: 64,
        borderRadius: 22,
        overflow: 'hidden',
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
      }}
    >
      <LinearGradient
        {...gradientFill()}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SpecularEdge color="rgba(236,241,238,0.22)" radius={22} height={2} />
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 16, lineHeight: 21 }}
        className="text-center font-semibold text-on-acc"
      >
        {offer.title}
      </Text>
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 12.5, lineHeight: 17, opacity: 0.8 }}
        className="mt-[2px] text-center text-on-acc"
      >
        {offer.caption}
      </Text>
    </Pressable>
  );
}

/** `Save workout` — 56 high, the commit gradient, the heavy specular. */
function SaveButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    /* The glow on a wrapper: `overflow: hidden` on the pill itself would cut it
       off — the same nesting `GlassSurface` uses, for the same reason. */
    <View
      style={{
        borderRadius: radius.pill,
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          height: 56,
          borderRadius: radius.pill,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LinearGradient
          {...gradientFill()}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <SpecularEdge color="rgba(236,241,238,0.22)" radius={radius.pill} height={2} />
        <Text maxFontSizeMultiplier={1.3} className="text-body font-semibold text-on-acc">
          {label}
        </Text>
      </Pressable>
    </View>
  );
}
