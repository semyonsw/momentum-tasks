/**
 * SetMarksSheet — what a set WAS, as opposed to what it weighed.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ Set 2                                      │
 *   │ REPS IN RESERVE                            │
 *   │  0    ½    1   1½    2   2½                │
 *   │ @10 @9.5  @9 @8.5  @8 @7.5   …             │
 *   │ How many more you could have done.         │
 *   │                              Clear  Done   │
 *   ╰────────────────────────────────────────────╯
 *
 * ONE SHEET FOR THE SET'S ANNOTATIONS, opened from three places: the `RIR` chip on
 * a row, the row's `RIR` door in the inline editor, and the same door in a
 * history correction. The live session and the log both use it, so "RIR 2" is set
 * the same way on a set done a minute ago and on one done in June.
 *
 * A SCALE OF CHIPS, NEVER A KEYBOARD. Eleven answers (0–5 in halves), each showing
 * both readings — `2` over `@8` — so an RPE lifter and an RIR lifter tap the same
 * chip and the app stores one number (`lib/effort.ts` has the argument). A tap
 * applies and closes: grading a set mid-workout is one tap after the sheet opens,
 * and there is nothing to confirm about an annotation that the next tap can change.
 *
 * REJECTED: ± steppers around a number. They cost a tap per half step and hide
 * the scale, and the scale — "0 is nothing left" — is the thing a lifter needs to
 * see to answer honestly.
 */

import { Pressable, Text, View } from 'react-native';

import { tap } from '../lib/feedback';
import { describeRir, formatRir, rirChoices, rpeLabel } from '../lib/effort';
import { useLanguage, useT } from '../hooks/useT';
import { glass, tint } from '../theme/tokens';
import { Sheet, useSheetDismiss } from './Sheet';
import { Kicker, TextButton } from './primitives';

interface SetMarksSheetProps {
  /** `Set 2`, `Warm-up` — what the user tapped, so they know which row this is. */
  title: string;
  /** The set's current RIR, or undefined when nobody graded it. */
  rir?: number;
  /** Offer the effort scale — reps only (`effortApplies`). */
  showEffort: boolean;
  onRir: (rir: number | null) => void;
  onDismiss: () => void;
}

export function SetMarksSheet({ title, rir, showEffort, onRir, onDismiss }: SetMarksSheetProps) {
  return (
    <Sheet title={title} onDismiss={onDismiss}>
      {showEffort ? <EffortSection rir={rir} onRir={onRir} /> : null}
      <SheetFoot canClear={rir != null && showEffort} onClear={() => onRir(null)} />
    </Sheet>
  );
}

/** The scale. Inside the sheet so a choice can close it with the sheet's own fall. */
function EffortSection({ rir, onRir }: { rir?: number; onRir: (rir: number) => void }) {
  const t = useT();
  const lang = useLanguage();
  const dismiss = useSheetDismiss();
  return (
    <View>
      <Kicker>{t('Reps in reserve')}</Kicker>
      <View className="mt-sm flex-row flex-wrap" style={{ gap: 6 }}>
        {rirChoices().map((value) => {
          const selected = rir === value;
          return (
            <Pressable
              key={value}
              onPress={() => {
                tap();
                onRir(value);
                dismiss?.();
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={describeRir(value, lang)}
              style={({ pressed }) => [
                {
                  width: 44,
                  height: 52,
                  borderRadius: 14,
                  borderWidth: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? tint(0.16) : glass.sunken,
                  borderColor: selected ? tint(0.3) : glass.raisedEdge,
                },
                pressed ? { opacity: 0.7 } : null,
              ]}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                className={[
                  'text-label tabular-nums',
                  selected ? 'font-semibold text-acc' : 'font-semibold text-ink',
                ].join(' ')}
              >
                {formatRir(value)}
              </Text>
              <Text
                maxFontSizeMultiplier={1.3}
                className={[
                  'text-[12.5px] tabular-nums',
                  selected ? 'text-acc' : 'text-ink-faint',
                ].join(' ')}
              >
                {rpeLabel(value)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text maxFontSizeMultiplier={1.3} className="mt-md text-label text-ink-muted">
        {t('How many more reps you could have done. The small number is the same answer as RPE.')}
      </Text>
      <Text maxFontSizeMultiplier={1.3} className="mt-xs text-[12.5px] text-ink-faint">
        {t('A set at 0 or 0.5 was at the limit: it is not taken as a reason to add weight.')}
      </Text>
    </View>
  );
}

function SheetFoot({ canClear, onClear }: { canClear: boolean; onClear: () => void }) {
  const t = useT();
  const dismiss = useSheetDismiss();
  return (
    <View className="mt-lg flex-row items-center justify-end" style={{ gap: 24 }}>
      {canClear ? (
        <TextButton
          label={t('Clear')}
          onPress={() => {
            tap();
            onClear();
            dismiss?.();
          }}
        />
      ) : null}
      <TextButton label={t('Done')} onPress={() => dismiss?.()} />
    </View>
  );
}
