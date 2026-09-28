/**
 * AiProposalCard — a suggested routine, in the chat, waiting for a tap.
 *
 *   SUGGESTED EDIT · PUSH                       ✓ Applied
 *   Push
 *   4 changes · 5 exercises · 16 sets
 *   ┌───────────────────────────────────────────┐
 *   │ Bench press      4 × 8 · 60 kg  4 × 6 · 65 kg  CHANGED │
 *   │ Cable fly (struck)                        REMOVED │
 *   └───────────────────────────────────────────┘
 *   [ ✎ Review & edit ]  [ ✓ Apply changes ]
 *
 * ── THE OLD VALUE IS ON THE CARD ───────────────────────────────────────────
 *
 * An edit that only showed the new numbers would ask the user to remember the
 * routine to know what is changing. So a changed row shows what it was, struck
 * through, beside what it would become — the diff is the card. Statuses come from
 * `rowStatus`, which compares numbers, never from the model's own labels.
 *
 * Pending is the lit pane with the hero bloom; once decided it keeps its place in
 * the chat as a record — `✓ Added`, or `Discarded` at 60% on a well — and loses
 * its buttons, because a decision in a chat history is not a control.
 */

import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { BubblePressable } from './bubbles';
import { GlassSurface, SpecularEdge } from './glass';
import { Icon } from './Icon';
import { pressedStyle } from './motion';
import { useT } from '../hooks/useT';
import { proposalTotals, rowStatus, type RowValues } from '../lib/ai/aiProposal';
import type { StoredProposal } from '../state/aiStore';
import { gradientFill, palette, radius, specularHeavy } from '../theme/tokens';

/** `4 × 8 · 60 kg`, or `BW` for no weight. */
export function formatRow(values: RowValues, kg: string, bw: string): string {
  const load = values.weightKg > 0 ? `${values.weightKg} ${kg}` : bw;
  return `${values.sets} × ${values.reps} · ${load}`;
}

export function AiProposalCard({
  stored,
  onReview,
  onAccept,
}: {
  stored: StoredProposal;
  onReview: () => void;
  onAccept: () => void;
}) {
  const t = useT();
  const { proposal, status } = stored;
  const isNew = proposal.kind === 'new';
  const totals = proposalTotals(proposal);
  const pending = status === 'pending';
  const kg = t('kg');
  const bw = t('BW');

  const meta = [
    isNew ? proposal.focus : t('{count} changes', { count: totals.changes }),
    t('{exercises} exercises · {sets} sets', { exercises: totals.exercises, sets: totals.sets }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={status === 'discarded' ? { opacity: 0.6 } : undefined}>
      <GlassSurface
        tier={status === 'discarded' ? 'well' : 'lit'}
        radius={radius.card}
        glow={pending ? 'hero' : 'none'}
        shadow={pending ? 'e2' : 'none'}
        flat
      >
        <View style={{ padding: 16 }}>
          <View className="flex-row items-center">
            <Text
              numberOfLines={1}
              style={{ letterSpacing: 1.2 }}
              className="flex-1 text-micro font-semibold uppercase text-green-bright"
            >
              {isNew
                ? t('Suggested routine')
                : t('Suggested edit · {name}', { name: proposal.name })}
            </Text>
            {status === 'accepted' ? (
              <View className="flex-row items-center">
                <Icon name="check" size={13} color={palette.greenBright} />
                <Text className="ml-xs text-label font-semibold text-green-bright">
                  {isNew ? t('Added') : t('Applied')}
                </Text>
              </View>
            ) : status === 'discarded' ? (
              <Text className="text-label font-medium text-ink-faint">{t('Discarded')}</Text>
            ) : null}
          </View>

          <Text
            numberOfLines={2}
            style={{ fontSize: 22, lineHeight: 27 }}
            className="mt-xs font-semibold text-ink"
          >
            {proposal.name}
          </Text>
          <Text
            numberOfLines={2}
            style={{ fontSize: 13 }}
            className="mt-[2px] tabular-nums text-ink-muted"
          >
            {meta}
          </Text>

          <View
            style={{
              marginTop: 12,
              borderRadius: 14,
              overflow: 'hidden',
              backgroundColor: 'rgba(6,8,7,0.35)',
              borderWidth: 1,
              borderColor: 'rgba(236,241,238,0.045)',
            }}
          >
            {proposal.rows.map((row, index) => {
              const state = rowStatus(row);
              const tagged = !isNew && state !== 'same';
              return (
                <View
                  key={row.key}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderTopWidth: index > 0 ? 1 : 0,
                    borderTopColor: 'rgba(30,37,35,0.8)',
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 14,
                      textDecorationLine: state === 'removed' ? 'line-through' : 'none',
                    }}
                    className={[
                      'flex-1 pr-sm',
                      state === 'removed' ? 'text-ink-faint' : 'text-ink',
                    ].join(' ')}
                  >
                    {row.name}
                  </Text>
                  {state === 'changed' && row.was ? (
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 12, textDecorationLine: 'line-through', marginRight: 6 }}
                      className="tabular-nums text-ink-faint"
                    >
                      {formatRow(row.was, kg, bw)}
                    </Text>
                  ) : null}
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 13,
                      textDecorationLine: state === 'removed' ? 'line-through' : 'none',
                    }}
                    className={[
                      'font-semibold tabular-nums',
                      state === 'removed'
                        ? 'text-ink-faint'
                        : state === 'same'
                          ? 'text-ink-muted'
                          : 'text-green-bright',
                    ].join(' ')}
                  >
                    {formatRow(row, kg, bw)}
                  </Text>
                  {tagged ? (
                    <Text
                      style={{ fontSize: 9, letterSpacing: 0.9, marginLeft: 8 }}
                      className={[
                        'font-semibold uppercase',
                        state === 'removed' ? 'text-ink-muted' : 'text-green-bright',
                      ].join(' ')}
                    >
                      {t(state)}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>

          {pending ? (
            <View className="mt-md flex-row" style={{ gap: 10 }}>
              <BubblePressable
                onPress={onReview}
                radius="pill"
                accessibilityRole="button"
                accessibilityLabel={t('Review & edit')}
                style={(state) => [
                  pressedStyle(state),
                  {
                    flex: 1,
                    height: 44,
                    borderRadius: radius.pill,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(236,241,238,0.10)',
                    backgroundColor: 'rgba(236,241,238,0.07)',
                  },
                ]}
              >
                <Icon name="edit" size={14} color={palette.inkMuted} />
                <Text numberOfLines={1} className="ml-xs text-label font-medium text-ink-muted">
                  {t('Review & edit')}
                </Text>
              </BubblePressable>
              <BubblePressable
                onPress={onAccept}
                radius="pill"
                bubbleColor={palette.ink}
                accessibilityRole="button"
                accessibilityLabel={isNew ? t('Add to routines') : t('Apply changes')}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: radius.pill,
                  overflow: 'hidden',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <LinearGradient
                  {...gradientFill()}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
                <SpecularEdge color={specularHeavy} radius={radius.pill} />
                <Icon name="check" size={14} color={palette.onAcc} />
                <Text numberOfLines={1} className="ml-xs text-label font-semibold text-on-acc">
                  {isNew ? t('Add to routines') : t('Apply changes')}
                </Text>
              </BubblePressable>
            </View>
          ) : null}
        </View>
      </GlassSurface>
    </View>
  );
}
