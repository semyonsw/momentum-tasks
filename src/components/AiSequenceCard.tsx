/**
 * AiSequenceCard — a suggested TRAINING LOOP, in the chat, waiting for a tap.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ SUGGESTED LOOP                     Applied │
 *   │ 1 Push   2 Pull   3 Legs ▸next   4 Push    │
 *   │ was: Push · Pull · Legs                    │
 *   │ Legs was trained half as often as Push…    │
 *   │ (  Discard  )        (  ✓ Apply loop  )    │
 *   ╰────────────────────────────────────────────╯
 *
 * The same contract as `AiProposalCard`: the model SUGGESTS, nothing is written
 * until `Apply loop`, and the shell's toast carries an Undo. A loop is applied
 * whole — there is no editor, because the Sequence screen already is one, and a
 * suggestion that is almost right is one tap from being adjusted there.
 *
 * The steps are numbered and the same routine may appear at several of them —
 * Push at 1 and 4 is exactly what a loop is for. The current loop is drawn
 * underneath as `was`, so the change can be read without leaving the chat.
 */

import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { BubblePressable } from './bubbles';
import { COMMIT_GRADIENT, GlassSurface, SpecularEdge } from './glass';
import { Icon } from './Icon';
import { pressedStyle } from './motion';
import { useT } from '../hooks/useT';
import type { SequenceChatBlock } from '../state/aiStore';
import { useLibrary } from '../state/libraryStore';
import { palette, radius, specularHeavy } from '../theme/tokens';

export function AiSequenceCard({
  block,
  onApply,
  onDiscard,
}: {
  block: SequenceChatBlock;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const t = useT();
  const routines = useLibrary((s) => s.routines);
  const current = useLibrary((s) => s.sequence);
  const nameOf = new Map(routines.map((r) => [r.id, r.name]));
  const steps = block.routineIds.map((id) => nameOf.get(id) ?? t('Deleted routine'));
  const pending = block.status === 'pending';
  const was = current.routineIds.map((id) => nameOf.get(id)).filter(Boolean);

  return (
    <View style={block.status === 'discarded' ? { opacity: 0.6 } : undefined}>
      <GlassSurface
        tier={block.status === 'discarded' ? 'well' : 'lit'}
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
              {t('Suggested training loop')}
            </Text>
            {block.status === 'accepted' ? (
              <View className="flex-row items-center">
                <Icon name="check" size={13} color={palette.greenBright} />
                <Text className="ml-xs text-label font-semibold text-green-bright">
                  {t('Applied')}
                </Text>
              </View>
            ) : block.status === 'discarded' ? (
              <Text className="text-label font-medium text-ink-faint">{t('Discarded')}</Text>
            ) : null}
          </View>

          <View className="mt-md flex-row flex-wrap" style={{ gap: 8 }}>
            {steps.map((name, index) => {
              const next = index === block.next;
              return (
                <View
                  key={`${index}-${name}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    height: 32,
                    paddingHorizontal: 10,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: next ? 'rgba(63,169,108,0.6)' : 'rgba(236,241,238,0.08)',
                    backgroundColor: next ? 'rgba(63,169,108,0.18)' : 'rgba(6,8,7,0.35)',
                  }}
                >
                  <Text
                    style={{ fontSize: 11 }}
                    className="mr-xs font-semibold tabular-nums text-ink-faint"
                  >
                    {index + 1}
                  </Text>
                  <Text numberOfLines={1} className="text-label font-medium text-ink">
                    {name}
                  </Text>
                  {next ? (
                    <Text
                      style={{ fontSize: 9, letterSpacing: 0.9 }}
                      className="ml-xs font-semibold uppercase text-green-bright"
                    >
                      {t('next')}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>

          {pending && was.length > 0 ? (
            <Text numberOfLines={2} className="mt-sm text-label text-ink-faint">
              {t('Now: {loop}', { loop: was.join(' · ') })}
            </Text>
          ) : null}

          {block.why ? (
            <Text className="mt-md text-label text-ink-muted" style={{ lineHeight: 19 }}>
              {block.why}
            </Text>
          ) : null}

          {pending ? (
            <View className="mt-md flex-row" style={{ gap: 10 }}>
              <BubblePressable
                onPress={onDiscard}
                radius="pill"
                accessibilityRole="button"
                accessibilityLabel={t('Discard')}
                style={(state) => [
                  pressedStyle(state),
                  {
                    flex: 1,
                    height: 44,
                    borderRadius: radius.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(236,241,238,0.10)',
                    backgroundColor: 'rgba(236,241,238,0.07)',
                  },
                ]}
              >
                <Text className="text-label font-medium text-ink-muted">{t('Discard')}</Text>
              </BubblePressable>
              <BubblePressable
                onPress={onApply}
                radius="pill"
                bubbleColor={palette.ink}
                accessibilityRole="button"
                accessibilityLabel={t('Apply loop')}
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
                  colors={[...COMMIT_GRADIENT]}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
                <SpecularEdge color={specularHeavy} radius={radius.pill} />
                <Icon name="check" size={14} color={palette.ink} />
                <Text numberOfLines={1} className="ml-xs text-label font-semibold text-ink">
                  {t('Apply loop')}
                </Text>
              </BubblePressable>
            </View>
          ) : null}
        </View>
      </GlassSurface>
    </View>
  );
}
