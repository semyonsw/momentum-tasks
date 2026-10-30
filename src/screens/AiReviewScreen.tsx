/**
 * AiReviewScreen — a suggestion, opened, with every number on it editable.
 *
 *   ‹  AI SUGGESTION · EDIT                5 exercises · 16 sets
 *   Push____________________________
 *   Push · chest
 *   [ WHY  You did 4 × 8 at 60 kg on bench in each of … ]
 *   EXERCISES
 *   ┌ Bench press                    CHANGED  ✕ ┐
 *   │ was 4 × 8 · 60 kg                          │
 *   │ [− SETS 4 +] [− REPS 6 +] [− KG 65 +]      │
 *   └────────────────────────────────────────────┘
 *   ┆ + Add an exercise ┆
 *                          ( Discard ) ( ✓ Apply changes )
 *
 * ── THE MODEL PROPOSES, THE USER DISPOSES ──────────────────────────────────
 *
 * A suggestion is a draft, and this is the screen that makes it the user's: the
 * sets, the reps and the weight of every row on the same ± the rest of the app
 * uses, a row taken out or put back, one added from the library, the name
 * retyped. A number that now differs from the routine turns green-bright — the
 * app's one colour for "more than before" — so what Apply will change is visible
 * without reading the whole list. Nothing is written until the button.
 *
 * Every edit is saved to the proposal as it is made (`aiStore.updateProposal`),
 * so backing out to the chat and coming back finds the numbers where they were
 * left. The arithmetic of each edit is `lib/ai/aiProposal.ts`.
 */

import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { KeyboardAwareScrollView } from '../components/KeyboardAware';
import { BubblePressable } from '../components/bubbles';
import { DashedAdd } from '../components/primitives';
import { FloatingPair, GlassSurface, Lamps } from '../components/glass';
import { Icon } from '../components/Icon';
import { pressedStyle } from '../components/motion';
import { Kicker } from '../components/primitives';
import { NumberSheet } from '../components/NumberSheet';
import { ScreenHeader } from '../components/ScreenHeader';
import { Sheet } from '../components/Sheet';
import { formatReps, formatRow, movedOnly } from '../components/AiProposalCard';
import { useT } from '../hooks/useT';
import { nextStartWeights } from '../lib/ai/aiContext';
import {
  addRow,
  keepRow,
  proposalTotals,
  removeRow,
  renameProposal,
  rowStatus,
  setRowValue,
  stepRow,
  type ProposalRow,
  type ReviewProposal,
  type RowField,
} from '../lib/ai/aiProposal';
import { tap } from '../lib/feedback';
import { stepperFontSize } from '../lib/stepperFont';
import { useAi } from '../state/aiStore';
import { useLibrary } from '../state/libraryStore';
import { useWorkoutHistory } from '../state/workoutHistoryStore';
import { glass, glassTier, palette, radius, textGlow, tint } from '../theme/tokens';

export interface AiReviewScreenProps {
  proposalId: string;
  onBack: () => void;
  onAccept: () => void;
  onDiscard: () => void;
}

export function AiReviewScreen({ proposalId, onBack, onAccept, onDiscard }: AiReviewScreenProps) {
  const t = useT();
  const stored = useAi((s) => s.proposals[proposalId]);
  const exercises = useLibrary((s) => s.exercises);
  const workouts = useWorkoutHistory((s) => s.workouts);
  const lastWeights = useMemo(() => nextStartWeights(exercises, workouts), [exercises, workouts]);
  const [picking, setPicking] = useState(false);
  const [typing, setTyping] = useState<{ key: string; field: RowField } | null>(null);

  if (!stored) {
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader kicker={t('AI suggestion')} onBack={onBack} bordered={false} />
      </View>
    );
  }
  const proposal = stored.proposal;
  const isNew = proposal.kind === 'new';
  const totals = proposalTotals(proposal);
  const update = (next: ReviewProposal) => useAi.getState().updateProposal(proposalId, next);
  const taken = new Set(proposal.rows.map((row) => row.exerciseId).filter(Boolean));
  const typingRow = typing ? proposal.rows.find((r) => r.key === typing.key) : undefined;

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <Lamps section="Workout" />
      <ScreenHeader
        kicker={isNew ? t('AI suggestion · new routine') : t('AI suggestion · edit')}
        kickerTone="green"
        subtitle={t('{exercises} exercises · {sets} sets', {
          exercises: totals.exercises,
          sets: totals.sets,
        })}
        onBack={onBack}
        bordered={false}
      />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mx-lg mt-sm border-b border-b-hairline pb-xs">
          <TextInput
            value={proposal.name}
            onChangeText={(name) => update(renameProposal(proposal, name))}
            maxLength={40}
            accessibilityLabel={t('Routine name')}
            placeholder={t('Routine name')}
            placeholderTextColor={palette.inkFaint}
            style={{
              fontSize: 30,
              lineHeight: 36,
              letterSpacing: -0.8,
              fontWeight: '600',
              color: palette.ink,
              padding: 0,
            }}
          />
        </View>
        {proposal.focus ? (
          <Text className="mx-lg mt-sm text-label text-ink-muted">{proposal.focus}</Text>
        ) : null}

        {proposal.why ? (
          <GlassSurface tier="well" radius={radius.row} flat className="mx-lg mt-lg">
            <View className="p-lg">
              <Kicker tone="green">{t('Why')}</Kicker>
              <Text style={{ fontSize: 14, lineHeight: 20 }} className="mt-xs text-ink-muted">
                {proposal.why}
              </Text>
            </View>
          </GlassSurface>
        ) : null}

        <Kicker className="mx-lg mb-xs mt-xl">{t('Exercises')}</Kicker>
        <Text className="mx-lg mb-md text-label text-ink-faint">
          {t(
            'A weight here is where the exercise starts. Once it has been logged, each session opens on what you last lifted.',
          )}
        </Text>

        <View className="mx-lg" style={{ gap: 10 }}>
          {proposal.rows.map((row) => (
            <RowCard
              key={row.key}
              row={row}
              isNew={isNew}
              onStep={(field, direction) => {
                tap();
                update(stepRow(proposal, row.key, field, direction));
              }}
              onType={(field) => setTyping({ key: row.key, field })}
              onRemove={() => update(removeRow(proposal, row.key))}
              onKeep={() => update(keepRow(proposal, row.key))}
            />
          ))}
        </View>

        <View className="mx-lg mt-md">
          <DashedAdd label={t('Add an exercise')} onPress={() => setPicking(true)} />
        </View>
      </KeyboardAwareScrollView>

      <FloatingPair
        secondary={{ label: t('Discard'), onPress: onDiscard }}
        primary={{
          label: isNew ? t('Add to routines') : t('Apply changes'),
          icon: 'check',
          onPress: onAccept,
        }}
      />

      {picking ? (
        <Sheet title={t('Add an exercise')} onDismiss={() => setPicking(false)}>
          {exercises
            .filter((e) => !e.isArchived && !taken.has(e.id))
            .map((exercise) => (
              <BubblePressable
                key={exercise.id}
                onPress={() => {
                  update(addRow(proposal, exercise, lastWeights));
                  setPicking(false);
                }}
                radius={radius.row}
                accessibilityRole="button"
                accessibilityLabel={exercise.name}
                style={(state) => [
                  pressedStyle(state),
                  { height: 52, flexDirection: 'row', alignItems: 'center' },
                ]}
              >
                <Text numberOfLines={1} className="flex-1 text-body text-ink">
                  {exercise.name}
                </Text>
                <Icon name="plus" size={16} color={palette.greenBright} />
              </BubblePressable>
            ))}
        </Sheet>
      ) : null}

      {typing && typingRow ? (
        <NumberSheet
          title={t(FIELD_LABEL[typing.field])}
          // The exact value: a 62.5 kg row confirmed untouched must stay 62.5.
          initial={
            typing.field === 'weightKg'
              ? Math.round(typingRow.weightKg * 10) / 10
              : Math.round(typingRow[typing.field])
          }
          decimal={typing.field === 'weightKg'}
          min={typing.field === 'weightKg' ? 0 : 1}
          onConfirm={(value) => {
            update(setRowValue(proposal, typing.key, typing.field, value));
            setTyping(null);
          }}
          onCancel={() => setTyping(null)}
        />
      ) : null}
    </View>
  );
}

const FIELD_LABEL: Record<RowField, string> = { sets: 'Sets', reps: 'Reps', weightKg: 'Kg' };

function RowCard({
  row,
  isNew,
  onStep,
  onType,
  onRemove,
  onKeep,
}: {
  row: ProposalRow;
  isNew: boolean;
  onStep: (field: RowField, direction: 1 | -1) => void;
  onType: (field: RowField) => void;
  onRemove: () => void;
  onKeep: () => void;
}) {
  const t = useT();
  const state = rowStatus(row);
  const kg = t('kg');
  const bw = t('BW');
  const removed = state === 'removed';
  // Moved and nothing else: its `was` would repeat its own numbers — `movedOnly`.
  const moved = movedOnly(row);
  const tag =
    row.exerciseId == null
      ? t('new to library')
      : isNew
        ? null
        : state === 'same'
          ? null
          : moved
            ? t('moved')
            : t(state);

  return (
    <GlassSurface
      tier="card"
      radius={radius.row}
      shadow={removed ? 'none' : 'e1'}
      dashed={removed}
      tint={removed ? glass.ghost : undefined}
      flat
    >
      <View style={{ padding: 14 }}>
        <View className="flex-row items-center">
          <View className="flex-1 pr-sm">
            <Text
              numberOfLines={2}
              style={{
                fontSize: 16,
                lineHeight: 22,
                textDecorationLine: removed ? 'line-through' : 'none',
              }}
              className={['font-medium', removed ? 'text-ink-faint' : 'text-ink'].join(' ')}
            >
              {row.name}
            </Text>
            {row.was && ((state === 'changed' && !moved) || removed) ? (
              <Text className="mt-[2px] text-[12.5px] tabular-nums text-ink-faint">
                {t('was {value}', { value: formatRow(row.was, kg, bw, t('superset')) })}
              </Text>
            ) : null}
          </View>
          {tag ? (
            <View
              style={{
                height: 20,
                paddingHorizontal: 8,
                justifyContent: 'center',
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: removed ? 'rgba(236,241,238,0.07)' : glass.greenEdge,
                backgroundColor: removed ? 'rgba(236,241,238,0.04)' : tint(0.16),
              }}
            >
              <Text
                style={{ fontSize: 12.5, letterSpacing: 0.9 }}
                className={[
                  'font-semibold uppercase',
                  removed ? 'text-ink-muted' : 'text-green-bright',
                ].join(' ')}
              >
                {tag}
              </Text>
            </View>
          ) : null}
          {removed ? (
            <BubblePressable
              onPress={onKeep}
              radius="pill"
              accessibilityRole="button"
              accessibilityLabel={t('Keep')}
              style={(s) => [
                pressedStyle(s),
                { height: 32, justifyContent: 'center', paddingLeft: 12 },
              ]}
            >
              <Text className="text-label font-semibold text-green-bright">{t('Keep')}</Text>
            </BubblePressable>
          ) : (
            <BubblePressable
              onPress={onRemove}
              radius="pill"
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('Remove {name}', { name: row.name })}
              style={(s) => [
                pressedStyle(s),
                {
                  marginLeft: 8,
                  height: 32,
                  width: 32,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.pill,
                  backgroundColor: 'rgba(236,241,238,0.05)',
                },
              ]}
            >
              <Icon name="x" size={14} color={palette.inkMuted} />
            </BubblePressable>
          )}
        </View>

        {removed ? null : (
          <View className="mt-md flex-row" style={{ gap: 8 }}>
            <Stepper
              label={t('Sets')}
              value={String(row.sets)}
              differs={row.was != null && row.sets !== row.was.sets}
              onStep={(d) => onStep('sets', d)}
              onType={() => onType('sets')}
            />
            <Stepper
              label={t('Reps')}
              value={formatReps(row)}
              differs={
                row.was != null &&
                (row.reps !== row.was.reps || (row.repsMin ?? null) !== (row.was.repsMin ?? null))
              }
              locked={row.repsLocked}
              onStep={(d) => onStep('reps', d)}
              onType={() => onType('reps')}
            />
            <Stepper
              label={t('Kg')}
              value={row.weightKg > 0 ? String(row.weightKg) : bw}
              differs={row.was != null && row.weightKg !== row.was.weightKg}
              locked={row.weightLocked}
              onStep={(d) => onStep('weightKg', d)}
              onType={() => onType('weightKg')}
            />
          </View>
        )}
      </View>
    </GlassSurface>
  );
}

function Stepper({
  label,
  value,
  differs,
  locked = false,
  onStep,
  onType,
}: {
  label: string;
  value: string;
  differs: boolean;
  /** The app owns this number (a ladder's reps, a bodyweight exercise's kg). */
  locked?: boolean;
  onStep: (direction: 1 | -1) => void;
  onType: () => void;
}) {
  const t = useT();
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 14,
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderWidth: 1,
        borderColor: differs ? tint(0.28) : glassTier.well.border,
        backgroundColor: differs ? tint(0.1) : glassTier.well.tint,
        opacity: locked ? 0.45 : 1,
      }}
    >
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 12.5, letterSpacing: 1 }}
        className="text-center font-semibold uppercase text-ink-faint"
      >
        {label}
      </Text>
      <View className="mt-xs flex-row items-center justify-between">
        <StepButton
          sign="minus"
          disabled={locked}
          label={t('Less {label}', { label })}
          onPress={() => onStep(-1)}
        />
        {/* A TAP types the exact value too: the hold had no visible twin, and a
            number between two steppers is where a thumb goes to type one. */}
        <BubblePressable
          onPress={locked ? undefined : onType}
          onLongPress={locked ? undefined : onType}
          disabled={locked}
          accessibilityRole="adjustable"
          accessibilityLabel={`${label} ${value}`}
          style={{ flex: 1, alignItems: 'center' }}
        >
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={[
              { fontSize: stepperFontSize(value), lineHeight: 22 },
              differs ? textGlow.live : null,
            ]}
            className={[
              'font-semibold tabular-nums',
              differs ? 'text-green-bright' : 'text-ink',
            ].join(' ')}
          >
            {value}
          </Text>
        </BubblePressable>
        <StepButton
          sign="plus"
          disabled={locked}
          label={t('More {label}', { label })}
          onPress={() => onStep(1)}
        />
      </View>
    </View>
  );
}

function StepButton({
  sign,
  disabled,
  label,
  onPress,
}: {
  sign: 'plus' | 'minus';
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  const plus = sign === 'plus';
  return (
    <BubblePressable
      onPress={onPress}
      disabled={disabled}
      radius="pill"
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(s) => [
        pressedStyle(s),
        {
          height: 30,
          width: 30,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.pill,
          backgroundColor: plus ? tint(0.16) : 'rgba(236,241,238,0.06)',
        },
      ]}
    >
      <Icon name={sign} size={14} color={plus ? palette.greenBright : palette.inkMuted} />
    </BubblePressable>
  );
}
