/**
 * ExerciseHistoryScreen — has this actually been going up.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹  HISTORY                                   │
 *   │ Wide pull-ups machine                        │
 *   │ 8 sessions · top 80 kg · same weight 16 days │
 *   │ ESTIMATED 1-REP MAX                          │
 *   │ Up 7.5 kg since 12 Jun, to 96.3 kg.          │
 *   │   ╱╲ chart ╱╲                                │
 *   │ An estimate, from your best set each session.│
 *   │ RECORDS                                      │
 *   │ ○ BEST E1RM 28 Sep  96.3 kg · the set: 82.5×5│
 *   │ ○ HEAVIEST 14 Sep   87.5 kg · the set: 87.5×2│
 *   │ TOP WORKING WEIGHT                           │
 *   │   ╱╲ chart ╱╲                                │
 *   │ SESSIONS                                     │
 *   │ 8 Aug   80 kg · 8 6 5 5                      │
 *   └──────────────────────────────────────────────┘
 *
 * The screen answers one question. Top working weight per session, the sessions
 * that produced it and how long it has been stuck are the same data the nudge
 * fires on, and they still lead nothing but themselves: no volume totals, no badge.
 *
 * ── THE 1RM, REVISITED ─────────────────────────────────────────────────────
 *
 * This header used to refuse an estimated 1RM outright: a number that goes up on
 * its own and tells you nothing about whether to add a plate. Roadmap W5 (T-02)
 * reversed that, for the one thing top weight cannot show — `100 × 3` becoming
 * `100 × 5` is progress the weight line draws flat. It came back on the terms
 * that answered the old objection: one point per session from its best set, a
 * written conclusion above it, and the word "estimate" printed under it every
 * time (`lib/records.ts` has the rules). It is NOT stored on `SetHistory` again
 * — derived on read, so a change of formula never leaves old numbers on disk.
 *
 * The records are the bests told as a history, newest first, each with the set
 * that did it and a tap through to that session. Still no medal: a record row
 * is the same quiet text as everything else here.
 */

import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ScreenHeader } from '../components/ScreenHeader';
import { Kicker, ListCard, Separator } from '../components/primitives';
import { TrendChart } from '../components/TrendChart';
import { describeHistory, sessionRows, topWeightSeries } from '../lib/history';
import {
  LADDER_SETS,
  describeLadder,
  ladderOf,
  ladderTargets,
  ladderTotal,
  sessionsToNextMax,
} from '../lib/repLadder';
import type { OverloadVerdict } from '../lib/progressiveOverload';
import {
  describeBests,
  describeE1rmTrend,
  e1rmSeries,
  exerciseBests,
  formatBestLoad,
  prTimeline,
  recordLabel,
  recordSet,
  recordValue,
} from '../lib/records';
import { bodyweightAt } from '../lib/bodyweightLog';
import { formatCount, formatShortDate, kgToLb } from '../lib/units';
import { term } from '../lib/i18n';
import { useSettings } from '../state/settingsStore';
import { chartWash, palette } from '../theme/tokens';
import { useLanguage, useT } from '../hooks/useT';
import type { Exercise, ID, SetHistory } from '../types/models';

interface ExerciseHistoryScreenProps {
  exercise: Exercise;
  history: SetHistory[];
  /** Supplies the "same weight for N days" clause. */
  verdict?: OverloadVerdict;
  onBack: () => void;
  /**
   * Open this exercise in the editor.
   *
   * This screen is where the header action belongs: tapping an exercise anywhere in
   * the app lands here, so it is the one place that is always "about" one exercise —
   * and looking at a wrong name or a wrong starting weight is exactly when you want
   * to fix it.
   */
  onEdit?: () => void;
  onOpenSession?: (sessionId: ID) => void;
}

export function ExerciseHistoryScreen({
  exercise,
  history,
  verdict,
  onBack,
  onEdit,
  onOpenSession,
}: ExerciseHistoryScreenProps) {
  const t = useT();
  const lang = useLanguage();
  /* Memoized: the chart replays its entrance for every new `series`, so a series
     rebuilt on each render of this screen redrew the line from nothing on every
     unrelated settings write. */
  const rows = useMemo(() => sessionRows(history, exercise, lang), [exercise, history, lang]);
  const series = useMemo(() => topWeightSeries(rows), [rows]);
  /*
   * The staleness clause is a fact about the data, not a nag, so it appears as
   * soon as the same weight has been hit twice — well before the engine is
   * willing to nudge. On a lift that is still climbing there is no run to report
   * and the clause drops out entirely.
   */
  const plateauDays = verdict && verdict.sessionsInRun >= 2 ? verdict.plateauDays : null;
  const loadPrefix = exercise.loadMode === 'added_bodyweight' ? '+' : '';
  /*
   * The ladder, if this exercise runs one. Shown at five sets — the scheme's own
   * shape — because this screen is about the exercise and not about any one
   * routine's set count.
   */
  const ladder = ladderOf(exercise);
  const ladderPlan = ladder ? ladderTargets(ladder, LADDER_SETS) : null;
  const untilPR = ladder ? sessionsToNextMax(ladder, LADDER_SETS) : 0;

  /*
   * THE STANDING BESTS. Read from the same rows the list below is built from, and
   * compared on EFFECTIVE load — so a pull-up at `+20 kg` last year when the lifter
   * weighed 78 does not out-rank the same set at 82 today. `lib/records.ts` has the
   * argument for these three numbers, and for why the e1RM below is only ever an
   * estimate that says so.
   */
  const bodyweightLog = useSettings((s) => s.bodyweightLog);
  const unitSystem = useSettings((s) => s.unitSystem);
  const bests = useMemo(
    () => exerciseBests(history, exercise, (at) => bodyweightAt(bodyweightLog, at)),
    [bodyweightLog, exercise, history],
  );
  /*
   * THE e1RM LINE AND THE RECORDS. Same bodyweight lookup as the bests, so the
   * three never disagree about what a `+20` set weighed. Kilograms throughout;
   * the chart's gridlines and every sentence convert on the way out.
   */
  const lookup = useMemo(() => (at: string) => bodyweightAt(bodyweightLog, at), [bodyweightLog]);
  const e1rmPoints = useMemo(
    () => e1rmSeries(history, exercise.id, lookup),
    [exercise.id, history, lookup],
  );
  const timeline = useMemo(
    () => prTimeline(history, exercise.id, lookup),
    [exercise.id, history, lookup],
  );
  const trend = describeE1rmTrend(e1rmPoints, unitSystem, lang);
  // Timed, distance and round work has no e1RM to estimate; the section is not drawn.
  const estimates = exercise.countUnit === 'reps';
  const bestsLine = describeBests(
    bests,
    exercise.countUnit,
    // Bests are on-body totals, so no `+` even on added-bodyweight work.
    (kg) => formatBestLoad(kg, unitSystem),
    (count) => formatCount(count, exercise.countUnit),
    lang,
  );

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader
        kicker={t('History')}
        onBack={onBack}
        /* `Edit exercise`, not `Edit` (#17): on a history screen a bare `Edit`
           reads as editing the HISTORY. The pencil marks it as the way into the
           exercise's own settings. */
        action={
          onEdit
            ? { label: t('Edit exercise'), icon: 'edit', tone: 'muted', onPress: onEdit }
            : undefined
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="mx-lg text-title font-medium text-ink">{exercise.name}</Text>
        <Text className="mx-lg mt-xs text-label tabular-nums text-ink-muted">
          {describeHistory(rows, plateauDays, loadPrefix, lang)}
        </Text>

        {/*
          BEST — one line, `ink-faint`, and no medal anywhere near it.

          `HistoryScreen` sets the rule this follows: a total is a fact, not a goal;
          no streaks, no badges. A best is the same kind of thing — it is what the
          log says — so it is stated once, here, where somebody is already looking at
          this exercise's numbers, and it is never announced mid-set.
        */}
        {bestsLine ? (
          <Text className="mx-lg mt-xs text-label tabular-nums text-ink-faint">
            {t('Best')} {bestsLine}
          </Text>
        ) : null}

        {/*
          THE LADDER, above the chart, because it is the only thing on this screen
          that says what to do NEXT. Everything below it is what already happened.

          It answers the one question a scheme like this gets asked — how far to the
          next max — in sessions rather than in weeks, because a ladder does not
          advance on a calendar. It moves when you meet it.
        */}
        {ladder && ladderPlan ? (
          <>
            <Kicker tone="green" className="mx-lg mt-xl">
              {t('Ladder · max {max}', { max: ladder.max })}
            </Kicker>
            <Text className="mx-lg mt-sm text-title font-medium tabular-nums text-ink">
              {describeLadder(ladderPlan)}
            </Text>
            <Text className="mx-lg mt-xs text-label tabular-nums text-ink-muted">
              {t('{count} {unit}', {
                count: ladderTotal(ladderPlan),
                unit: term('unit', 'reps', lang),
              })}{' '}
              ·{' '}
              {untilPR === 1
                ? t('meet it and the max becomes {max}', { max: ladder.max + 1 })
                : t('{count} met sessions to a max of {max}', {
                    count: untilPR,
                    max: ladder.max + 1,
                  })}
            </Text>
          </>
        ) : null}

        {/*
          ESTIMATED 1-REP MAX — the conclusion is written ABOVE the line, so the
          chart is the evidence for a sentence rather than a puzzle. One hue, an
          even 12% wash, and the word "estimate" under it every time.
        */}
        {estimates ? (
          <>
            <Kicker className="mx-lg mt-xl">{t('Estimated 1-rep max')}</Kicker>
            {trend ? (
              <>
                <Text className="mx-lg mt-xs text-body tabular-nums text-ink">{trend.text}</Text>
                <View className="mx-lg mt-md">
                  <TrendChart
                    points={e1rmPoints}
                    flatWash={chartWash.flat}
                    formatValue={(kg) =>
                      String(Math.round(unitSystem === 'imperial' ? kgToLb(kg) : kg))
                    }
                  />
                </View>
                <Text className="mx-lg mt-xs text-label text-ink-faint">
                  {t('An estimate, from your best set each session.')}{' '}
                  {t('e1RM = weight × (1 + reps / 30); a single counts as its own weight.')}
                </Text>
              </>
            ) : (
              <Text className="mx-lg mt-xs text-label text-ink-muted">
                {t(
                  'Your estimated 1-rep max is drawn here from your second session with a weighted set of reps.',
                )}
              </Text>
            )}
          </>
        ) : null}

        <Kicker className="mx-lg mb-sm mt-xl">{t('Records')}</Kicker>
        {timeline.length > 0 ? (
          <View className="mx-lg">
            {/* The rail the dots sit on — structure, so `hairline`. */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 7,
                top: 12,
                bottom: 12,
                width: 2,
                backgroundColor: palette.hairline,
              }}
            />
            {timeline.map((entry) => {
              const label = recordLabel(entry.kind, entry.countUnit, lang);
              const date = formatShortDate(entry.at, lang);
              const value = recordValue(entry, unitSystem, lang);
              const theSet = t('the set: {set}', { set: recordSet(entry, unitSystem) });
              return (
                <Pressable
                  key={`${entry.sessionId}-${entry.kind}`}
                  onPress={onOpenSession ? () => onOpenSession(entry.sessionId) : undefined}
                  disabled={!onOpenSession}
                  accessibilityRole={onOpenSession ? 'button' : 'text'}
                  accessibilityLabel={`${label}, ${date}: ${value}, ${theSet}`}
                  className="min-h-[56px] flex-row items-center py-xs"
                >
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: palette.greenBright,
                      backgroundColor: palette.bg,
                    }}
                  />
                  <View className="ml-md flex-1">
                    <View className="flex-row items-baseline">
                      <Kicker tone="green">{label}</Kicker>
                      <Text className="ml-sm text-label tabular-nums text-ink-faint">{date}</Text>
                    </View>
                    <Text className="text-body tabular-nums text-ink">
                      <Text className="font-semibold">{value}</Text>
                      <Text className="text-ink-muted"> · {theSet}</Text>
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text className="mx-lg text-label text-ink-muted">
            {t(
              'A record appears here when a session beats your best so far: the heaviest set, the most reps, or the best e1RM. Your first session sets the bar.',
            )}
          </Text>
        )}

        {series.length >= 2 ? (
          <>
            <Kicker className="mx-lg mt-xl">{t('Top working weight')}</Kicker>
            <View className="mx-lg mt-md">
              <TrendChart points={series} />
            </View>
          </>
        ) : null}

        {rows.length > 0 ? (
          <>
            <Kicker className="mx-lg mb-sm mt-xl">{t('Sessions')}</Kicker>
            <ListCard className="mx-lg">
              {rows.map((row, index) => (
                <View key={row.sessionId}>
                  {index > 0 ? <Separator /> : null}
                  <Pressable
                    onPress={onOpenSession ? () => onOpenSession(row.sessionId) : undefined}
                    disabled={!onOpenSession}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatShortDate(row.performedAt, lang)}: ${row.lead}${row.drops ?? ''}`}
                    className="h-row flex-row items-center px-lg"
                  >
                    <Text className="w-[64px] text-label tabular-nums text-ink-faint">
                      {formatShortDate(row.performedAt, lang)}
                    </Text>
                    {/* Drops continue the same Text so they wrap as one line of
                        prose, not as a second column that needs aligning. */}
                    <Text
                      numberOfLines={1}
                      className="ml-md flex-1 text-body font-medium tabular-nums text-ink"
                    >
                      {row.lead}
                      {row.drops ? (
                        <Text className="text-body font-medium tabular-nums text-ink-faint">
                          {row.drops}
                        </Text>
                      ) : null}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </ListCard>
          </>
        ) : (
          <Text className="mx-lg mt-xl text-body text-ink-muted">
            {t('No completed sets yet.')}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
