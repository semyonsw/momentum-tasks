/**
 * AiChangesCard — suggested SETTINGS changes, in the chat, waiting for a tap.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ SUGGESTED CHANGES                  Applied │
 *   │ Pull-up                                    │
 *   │ Rep ladder max            ~~12~~ → 14      │
 *   │ Settings                                   │
 *   │ Rest between sets       ~~2:00~~ → 1:30    │
 *   │ You hit 12 on every set for two weeks…     │
 *   │ (  Discard  )      (  ✓ Apply changes  )   │
 *   ╰────────────────────────────────────────────╯
 *
 * The same contract as `AiSequenceCard`: the model SUGGESTS, nothing is written
 * until `Apply changes`, and the shell's toast carries an Undo. Applied whole —
 * the fields each have their own editor already, and a card that let rows be
 * ticked off one by one would be a second, worse editor for all of them.
 *
 * The rows are the ones STORED with the message (`describeChanges` ran when the
 * answer arrived), not recomputed here: after Apply the stores hold the new
 * values, and a `from` read now would say `1:30 → 1:30`. An empty `from` — a new
 * task, a first budget — draws only the new value rather than a struck-out blank.
 */

import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { BubblePressable } from './bubbles';
import { GlassSurface, SpecularEdge } from './glass';
import { Icon } from './Icon';
import { pressedStyle } from './motion';
import { useT } from '../hooks/useT';
import type { ChangesChatBlock } from '../state/aiStore';
import { gradientFill, palette, radius, specularHeavy } from '../theme/tokens';

export function AiChangesCard({
  block,
  onApply,
  onDiscard,
}: {
  block: ChangesChatBlock;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const t = useT();
  const pending = block.status === 'pending';

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
              {t('Suggested changes')}
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

          <View className="mt-md" style={{ gap: 10 }}>
            {block.rows.map((row, index) => (
              <View key={`${index}-${row.subject}-${row.label}`}>
                <Text numberOfLines={1} className="text-micro text-ink-faint">
                  {row.subject}
                </Text>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Text numberOfLines={1} className="flex-1 text-label font-medium text-ink">
                    {row.label}
                  </Text>
                  <View className="flex-row items-center" style={{ flexShrink: 1 }}>
                    {row.from ? (
                      <>
                        <Text
                          numberOfLines={1}
                          style={{ textDecorationLine: 'line-through', flexShrink: 1 }}
                          className="text-label tabular-nums text-ink-faint"
                        >
                          {row.from}
                        </Text>
                        <Text className="mx-xs text-label text-ink-faint">→</Text>
                      </>
                    ) : null}
                    <Text
                      numberOfLines={1}
                      style={{ flexShrink: 1 }}
                      className="text-label font-semibold tabular-nums text-green-bright"
                    >
                      {row.to}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

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
                accessibilityLabel={t('Apply changes')}
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
                  {t('Apply changes')}
                </Text>
              </BubblePressable>
            </View>
          ) : null}
        </View>
      </GlassSurface>
    </View>
  );
}
