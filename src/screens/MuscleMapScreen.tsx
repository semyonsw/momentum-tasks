/**
 * MuscleMapScreen — where this week's sets landed on a body (W3, design 17).
 *
 *   ‹ MUSCLE MAP
 *   ‹  This week · 28 Sep – 4 Oct  ›
 *        FRONT            BACK
 *       ( ● )            ( ● )
 *      ▐█▌▐█▌           ▐▀▀▀▌          ← one hue, four steps (heat tokens)
 *       ▐██▌             ▐▌▐▌
 *   ╭────────────────────────────────────╮
 *   │ THIS WEEK · Chest              ✕   │
 *   │ 14 sets                            │
 *   │ Push · 31 / 40 sets this week      │   ← the cluster and ITS target
 *   │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━──────  │
 *   │ 9 sets to your target              │
 *   ╰────────────────────────────────────╯
 *   0 ▢ 1–4 ▢ 5–9 ▢ 10–14 ▢ 15+
 *   ( Chest 14 )( Back 18 )( Biceps 12 )…      ← every muscle, 48 dp targets
 *
 * A COUNT, NOT A VERDICT — `lib/balance.ts`'s rule, one level down. The map is
 * coloured by how many sets a muscle got, on the same four steps as every heat
 * grid in the app, and never by whether that was "enough": no muscle is drawn
 * as neglected, no colour means too little.
 *
 * THE TARGET LIVES ON THE CLUSTER. The weekly targets the user typed are per
 * cluster and were typed against the primary-only count (Workout settings →
 * weekly targets, History → sets per cluster), so a tapped muscle says its own
 * number and then its cluster's `n / target` — the design's "Chest · 14 / 16"
 * would compare a muscle's half-counted sets with a cluster's whole ones.
 * Rejected: per-muscle targets (a second model of the same plan), and putting
 * the cluster target next to the muscle number (a sum that does not add up).
 *
 * GEOMETRIC, NOT ANATOMICAL: rounded shapes per region, so it reads at 150 dp
 * and does not pretend to a precision the data does not have. The shapes are
 * small for a finger (a forearm is 14 dp wide), so every muscle is ALSO a 48 dp
 * chip under the map — the accessible way in, and the one TalkBack reads.
 * Cardio and calisthenics have no place on a body; they are counted in a line
 * under the map rather than dropped.
 */

import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { BubblePressable } from '../components/bubbles';
import { pressedStyle } from '../components/motion';
import { Kicker, SelectChip } from '../components/primitives';
import { useToday } from '../hooks/useToday';
import { useLanguage, useT } from '../hooks/useT';
import type { CompletedWorkout } from '../lib/completedWorkout';
import { dayKey, formatShortDay, shiftDay, weekStart } from '../lib/days';
import { tap } from '../lib/feedback';
import { clusterLabel, MUSCLE_CLUSTER, MUSCLE_GROUPS, muscleLabel } from '../lib/muscles';
import { formatSets, muscleHeat, muscleVolume, OFF_MAP, targetNote } from '../lib/muscleVolume';
import { useSettings } from '../state/settingsStore';
import { glass, greenSteps, heat, palette, radius } from '../theme/tokens';
import type { Exercise, ID, MuscleGroup } from '../types/models';

export function MuscleMapScreen({
  workouts,
  exercisesById,
  onBack,
}: {
  workouts: readonly CompletedWorkout[];
  exercisesById: Record<ID, Exercise>;
  onBack: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const today = useToday();
  const targets = useSettings((s) => s.weeklySetTargets);
  const thisWeek = weekStart(today);
  const [week, setWeek] = useState(thisWeek);
  const [selected, setSelected] = useState<MuscleGroup | null>(null);

  /* The pager stops at the first week anything was logged, and at this one. */
  const firstWeek = useMemo(() => {
    let earliest = thisWeek;
    for (const workout of workouts) {
      const day = dayKey(workout.startedAt);
      if (day !== '' && day < earliest) earliest = day;
    }
    return weekStart(earliest);
  }, [thisWeek, workouts]);

  const volume = useMemo(
    () => muscleVolume({ workouts, exercisesById, day: week }),
    [exercisesById, week, workouts],
  );

  const steps = greenSteps();
  const fillOf = (muscle: MuscleGroup) => {
    const level = muscleHeat(volume.muscles[muscle]);
    if (level === 0) return selected === muscle ? glass.dash : heat.empty;
    return steps[level - 1];
  };
  const pick = (muscle: MuscleGroup) => {
    tap();
    setSelected((current) => (current === muscle ? null : muscle));
  };
  /** Props for one region: its fill, the outline when picked, the dim when another is. */
  const region = (muscle: MuscleGroup) => ({
    fill: fillOf(muscle),
    stroke: selected === muscle ? palette.ink : 'transparent',
    strokeWidth: selected === muscle ? 2.5 : 0,
    opacity: selected == null || selected === muscle ? 1 : 0.32,
    onPress: () => pick(muscle),
  });

  const weekLabel = `${formatShortDay(volume.week.from, lang)} – ${formatShortDay(volume.week.to, lang)}`;
  const offMap = OFF_MAP.filter((muscle) => volume.muscles[muscle] > 0);
  const onMap = MUSCLE_GROUPS.filter((muscle) => !OFF_MAP.includes(muscle));

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader kicker={t('Muscle map')} onBack={onBack} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* The week, and a step either way within the log. */}
        <View className="mx-md mt-md flex-row items-center">
          <PagerButton
            icon="chevron-left"
            label={t('Previous week')}
            disabled={week <= firstWeek}
            onPress={() => setWeek((current) => shiftDay(current, -7))}
          />
          <View className="flex-1 items-center">
            <Text maxFontSizeMultiplier={1.3} className="text-body font-medium text-ink">
              {week === thisWeek ? t('This week') : weekLabel}
            </Text>
            <Text maxFontSizeMultiplier={1.3} className="text-label text-ink-faint">
              {week === thisWeek ? `${weekLabel} · ${t('working sets')}` : t('working sets')}
            </Text>
          </View>
          <PagerButton
            icon="chevron-right"
            label={t('Next week')}
            disabled={week >= thisWeek}
            onPress={() => setWeek((current) => shiftDay(current, 7))}
          />
        </View>

        <View
          className="mx-lg mt-lg flex-row justify-around"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <View className="items-center">
            <Kicker>{t('Front')}</Kicker>
            <Svg width={150} height={330} viewBox="0 0 150 330">
              <Circle cx={75} cy={24} r={16} fill={glass.raised} />
              <Rect x={66} y={40} width={18} height={10} rx={4} {...region('neck')} />
              <Ellipse cx={40} cy={62} rx={14} ry={12} {...region('shoulders')} />
              <Ellipse cx={110} cy={62} rx={14} ry={12} {...region('shoulders')} />
              <Rect x={52} y={54} width={22} height={36} rx={8} {...region('chest')} />
              <Rect x={76} y={54} width={22} height={36} rx={8} {...region('chest')} />
              <Rect x={22} y={78} width={16} height={44} rx={8} {...region('biceps')} />
              <Rect x={112} y={78} width={16} height={44} rx={8} {...region('biceps')} />
              <Rect x={16} y={126} width={14} height={48} rx={7} {...region('forearms')} />
              <Rect x={120} y={126} width={14} height={48} rx={7} {...region('forearms')} />
              <Rect x={58} y={94} width={34} height={58} rx={8} {...region('core')} />
              <Rect x={54} y={156} width={42} height={18} rx={8} fill={glass.raised} />
              <Rect x={50} y={178} width={22} height={70} rx={10} {...region('quads')} />
              <Rect x={78} y={178} width={22} height={70} rx={10} {...region('quads')} />
              <Rect x={52} y={256} width={18} height={60} rx={9} {...region('calves')} />
              <Rect x={80} y={256} width={18} height={60} rx={9} {...region('calves')} />
            </Svg>
          </View>
          <View className="items-center">
            <Kicker>{t('Back view')}</Kicker>
            <Svg width={150} height={330} viewBox="0 0 150 330">
              <Circle cx={75} cy={24} r={16} fill={glass.raised} />
              <Path d="M58 44 L92 44 L104 60 L46 60 Z" {...region('traps')} />
              <Ellipse cx={40} cy={64} rx={13} ry={11} {...region('shoulders')} />
              <Ellipse cx={110} cy={64} rx={13} ry={11} {...region('shoulders')} />
              <Path d="M52 64 L74 64 L74 140 L60 136 Q50 100 52 64 Z" {...region('back')} />
              <Path d="M98 64 L76 64 L76 140 L90 136 Q100 100 98 64 Z" {...region('back')} />
              <Rect x={22} y={78} width={16} height={44} rx={8} {...region('triceps')} />
              <Rect x={112} y={78} width={16} height={44} rx={8} {...region('triceps')} />
              <Rect x={16} y={126} width={14} height={48} rx={7} {...region('forearms')} />
              <Rect x={120} y={126} width={14} height={48} rx={7} {...region('forearms')} />
              <Rect x={52} y={146} width={46} height={30} rx={12} {...region('glutes')} />
              <Rect x={50} y={180} width={22} height={68} rx={10} {...region('hamstrings')} />
              <Rect x={78} y={180} width={22} height={68} rx={10} {...region('hamstrings')} />
              <Rect x={52} y={256} width={18} height={60} rx={9} {...region('calves')} />
              <Rect x={80} y={256} width={18} height={60} rx={9} {...region('calves')} />
            </Svg>
          </View>
        </View>

        {selected ? (
          <Selection
            muscle={selected}
            sets={volume.muscles[selected]}
            clusterSets={volume.clusters[MUSCLE_CLUSTER[selected]]}
            target={targets[MUSCLE_CLUSTER[selected]]}
            onClear={() => setSelected(null)}
          />
        ) : (
          <View
            className="mx-lg mt-md"
            style={{
              padding: 14,
              borderRadius: radius.row,
              borderWidth: 1,
              borderColor: glass.raisedEdge,
              backgroundColor: glass.raised,
            }}
          >
            <Text maxFontSizeMultiplier={1.3} className="text-body text-ink-muted">
              {t('Tap a muscle for its weekly sets.')}
            </Text>
          </View>
        )}

        <Legend />

        {/* Every muscle as a chip: the big target for a small shape, and what a
            screen reader walks. */}
        <View className="mx-lg mt-lg flex-row flex-wrap">
          {onMap.map((muscle) => (
            <SelectChip
              key={muscle}
              label={`${muscleLabel(muscle, lang)} ${formatSets(volume.muscles[muscle])}`}
              selected={selected === muscle}
              onPress={() => pick(muscle)}
            />
          ))}
        </View>

        {offMap.length > 0 || volume.unfiled > 0 ? (
          <Text maxFontSizeMultiplier={1.3} className="mx-lg mt-sm text-label text-ink-muted">
            {[
              offMap.length > 0
                ? t('Not on the map: {list}', {
                    list: offMap
                      .map((m) => `${muscleLabel(m, lang)} ${formatSets(volume.muscles[m])}`)
                      .join(' · '),
                  })
                : null,
              volume.unfiled > 0
                ? `${t('Exercise since deleted')} ${formatSets(volume.unfiled)}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}

        <Text maxFontSizeMultiplier={1.3} className="mx-lg mt-md text-micro text-ink-faint">
          {t(
            'Working sets, Monday to Sunday; warm-ups are left out. Secondary muscles count half: a set of bench press is 1 for chest and ½ for triceps and shoulders.',
          )}
        </Text>
      </ScrollView>
    </View>
  );
}

/** The tapped muscle: its own sets, then its cluster against the user's target. */
function Selection({
  muscle,
  sets,
  clusterSets,
  target,
  onClear,
}: {
  muscle: MuscleGroup;
  sets: number;
  clusterSets: number;
  target: number | undefined;
  onClear: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const cluster = clusterLabel(MUSCLE_CLUSTER[muscle], lang);
  const note = targetNote(clusterSets, target);
  const fraction = target != null && target > 0 ? Math.min(1, clusterSets / target) : 0;
  const line =
    target != null
      ? t('{muscle} · {n} / {target} sets this week', { muscle: cluster, n: clusterSets, target })
      : t('{muscle} · {n} sets this week', { muscle: cluster, n: clusterSets });

  return (
    <View
      className="mx-lg mt-md"
      accessibilityLiveRegion="polite"
      style={{
        padding: 16,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: glass.greenEdge,
        backgroundColor: glass.green,
      }}
    >
      <View className="flex-row items-start">
        <View className="flex-1">
          <Kicker>{t('This week')}</Kicker>
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ fontSize: 18, lineHeight: 24 }}
            className="mt-[2px] font-medium text-ink"
          >
            {muscleLabel(muscle, lang)}
          </Text>
        </View>
        <BubblePressable
          onPress={onClear}
          radius="pill"
          accessibilityRole="button"
          accessibilityLabel={t('Clear selection')}
          style={(state) => [
            pressedStyle(state),
            {
              width: 44,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: -8,
            },
          ]}
        >
          <Icon name="x" size={16} color={palette.inkMuted} />
        </BubblePressable>
      </View>
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 34, lineHeight: 40 }}
        className="mt-xs font-semibold tabular-nums text-acc"
      >
        {formatSets(sets)}
        <Text style={{ fontSize: 15 }} className="font-medium text-ink-muted">
          {` ${t('sets')}`}
        </Text>
      </Text>
      <Text maxFontSizeMultiplier={1.3} className="mt-sm text-label tabular-nums text-ink">
        {line}
      </Text>
      {target != null && target > 0 ? (
        <View
          className="mt-sm overflow-hidden rounded-pill"
          style={{ height: 8, backgroundColor: glass.sunken }}
        >
          <View style={{ height: 8, width: `${fraction * 100}%`, backgroundColor: palette.acc }} />
        </View>
      ) : null}
      <Text maxFontSizeMultiplier={1.3} className="mt-sm text-label text-ink-muted">
        {note == null
          ? t('No weekly target set for {cluster}', { cluster })
          : note.kind === 'short'
            ? t('{n} sets to your target', { n: note.left })
            : note.over > 0
              ? t('Target met · {n} over', { n: note.over })
              : t('Target met')}
      </Text>
    </View>
  );
}

/** 0, 1–4, 5–9, 10–14, 15+ — the five fills the map is drawn in. */
function Legend() {
  const steps = greenSteps();
  const keys: { label: string; fill: string }[] = [
    { label: '0', fill: heat.empty },
    { label: '1–4', fill: steps[0] },
    { label: '5–9', fill: steps[1] },
    { label: '10–14', fill: steps[2] },
    { label: '15+', fill: steps[3] },
  ];
  return (
    <View className="mx-lg mt-md flex-row flex-wrap items-center" style={{ gap: 10 }}>
      {keys.map((key) => (
        <View key={key.label} className="flex-row items-center" style={{ gap: 4 }}>
          <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: key.fill }} />
          <Text maxFontSizeMultiplier={1.3} className="text-micro tabular-nums text-ink-faint">
            {key.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PagerButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'chevron-left' | 'chevron-right';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <BubblePressable
      onPress={() => {
        if (disabled) return;
        tap();
        onPress();
      }}
      radius="pill"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={(state) => [
        pressedStyle(state),
        {
          width: 48,
          height: 48,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.3 : 1,
        },
      ]}
    >
      <Icon name={icon} size={20} color={palette.ink} />
    </BubblePressable>
  );
}
