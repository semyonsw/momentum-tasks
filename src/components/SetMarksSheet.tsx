/**
 * SetMarksSheet — what a set WAS, as opposed to what it weighed.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ Set 2 · Set type & reps left               │
 *   │ W warm-up · D drop set · F to failure · …  │
 *   │ [ ]  Normal set                         ✓  │  ← 50 dp radio rows
 *   │      Counts toward your volume             │
 *   │ [W]  Warm-up                               │
 *   │      Light set, not counted                │
 *   │ …                                          │
 *   │ REPS LEFT (RIR)                            │
 *   │ ( – )( 0 )( 1 )( 2 )( 3 )( 4+ )            │
 *   │ (                 Done                 )   │
 *   ╰────────────────────────────────────────────╯
 *
 * ONE SHEET FOR THE SET'S ANNOTATIONS — its type and its effort — opened from the
 * set well on a row (the ▾ says it opens something) and from a history
 * correction, so "RIR 2" is set the same way on a set done a minute ago and on
 * one done in June. The inline editor offers the same two questions in place;
 * this is the version with the words for what each answer means.
 *
 * A RADIO LIST WITH A LINE OF WHY, where it used to be five chips. "Drop set" is
 * a name; "Lower the weight, keep going" is what makes someone choose it — and
 * "Light set, not counted" is the one fact about a warm-up that changes the
 * numbers, said where the choice is made.
 *
 * NOTHING HERE CLOSES THE SHEET BUT `Done`. Choosing `To failure` is usually
 * followed by saying how close it was, and a sheet that closed on the type made
 * that two trips. Every tap applies at once; `Done` only leaves.
 *
 * REPS LEFT IS 0 1 2 3 4+ AND `–` FOR "not said" (`RIR_QUICK`). The stored scale
 * still has halves; a half-step grade from before lights no chip and is kept
 * until another chip is tapped.
 *
 * REJECTED: a long-press menu on the set number. A hold is invisible until
 * somebody tells you it is there (every hold has a visible twin), and the number
 * is a tap target already.
 */

import { Text, View } from 'react-native';
import { Pressable } from './Pressable';

import { tap } from '../lib/feedback';
import { describeRir } from '../lib/effort';
import {
  SET_KINDS,
  SET_TYPE_LEGEND,
  kindBadge,
  kindDescription,
  kindRowName,
  type SetKind,
} from '../lib/setType';
import { RIR_QUICK, rirQuickLabel, rirQuickSelected } from '../lib/setRowLayout';
import { useLanguage, useT } from '../hooks/useT';
import { glass, palette, tint } from '../theme/tokens';
import { Sheet, useSheetDismiss } from './Sheet';
import { Icon } from './Icon';
import { Kicker, PrimaryButton } from './primitives';

interface SetMarksSheetProps {
  /**
   * The whole title. Build it with `setSheetTitle` (`lib/setType.ts`) —
   * `Set 2 · Set type & reps left` — so every caller says it the same way.
   */
  title: string;
  /** What the set is now. */
  kind: SetKind;
  onKind: (kind: SetKind) => void;
  /** The set's current RIR, or undefined when nobody graded it. */
  rir?: number;
  /** Offer the effort scale — reps only (`effortApplies`). */
  showEffort: boolean;
  onRir: (rir: number | null) => void;
  onDismiss: () => void;
}

export function SetMarksSheet({
  title,
  kind,
  onKind,
  rir,
  showEffort,
  onRir,
  onDismiss,
}: SetMarksSheetProps) {
  const t = useT();
  return (
    <Sheet title={title} onDismiss={onDismiss}>
      <Text maxFontSizeMultiplier={1.3} className="-mt-sm mb-md text-[13px] text-ink-muted">
        {t(SET_TYPE_LEGEND)}
      </Text>
      <TypeList kind={kind} onKind={onKind} />
      {showEffort ? (
        <View className="mt-lg">
          <EffortChips rir={rir} onRir={onRir} />
        </View>
      ) : null}
      <DoneButton />
    </Sheet>
  );
}

/** The five kinds as 50 dp radio rows: badge, name, the line of why, a ✓ if chosen. */
function TypeList({ kind, onKind }: { kind: SetKind; onKind: (kind: SetKind) => void }) {
  const lang = useLanguage();
  return (
    <View accessibilityRole="radiogroup" style={{ gap: 4 }}>
      {SET_KINDS.map((option) => {
        const selected = option === kind;
        const badge = kindBadge(option);
        const name = kindRowName(option, lang);
        return (
          <Pressable
            key={option}
            onPress={() => {
              tap();
              if (!selected) onKind(option);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={`${name}. ${kindDescription(option, lang)}`}
            style={({ pressed }) => [
              {
                minHeight: 50,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: selected ? tint(0.14) : 'transparent',
              },
              pressed ? { opacity: 0.7 } : null,
            ]}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: selected ? tint(0.45) : palette.hairline,
                backgroundColor: glass.sunken,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {badge ? (
                <Text
                  maxFontSizeMultiplier={1.2}
                  style={{
                    fontSize: 13,
                    fontWeight: '800',
                    color: option === 'warmup' && !selected ? palette.inkMuted : palette.acc,
                  }}
                >
                  {badge}
                </Text>
              ) : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                className={[
                  'text-label',
                  selected ? 'font-semibold text-acc' : 'font-medium text-ink',
                ].join(' ')}
              >
                {name}
              </Text>
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                className="text-[12.5px] text-ink-muted"
              >
                {kindDescription(option, lang)}
              </Text>
            </View>
            {selected ? <Icon name="check" size={18} color={palette.acc} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** `– 0 1 2 3 4+`, equal width. `–` is "not said". Applies, stays open. */
function EffortChips({ rir, onRir }: { rir?: number; onRir: (rir: number | null) => void }) {
  const t = useT();
  const lang = useLanguage();
  const lit = rirQuickSelected(rir);
  const choices: (number | null)[] = [null, ...RIR_QUICK];
  return (
    <View>
      <Kicker>{t('Reps left (RIR)')}</Kicker>
      <View className="mt-sm flex-row" style={{ gap: 6 }}>
        {choices.map((value) => {
          const selected = value == null ? rir == null : lit === value;
          return (
            <Pressable
              key={value ?? 'none'}
              onPress={() => {
                tap();
                onRir(value);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={value == null ? t('Not said') : describeRir(value, lang)}
              style={({ pressed }) => [
                {
                  flex: 1,
                  height: 44,
                  borderRadius: 12,
                  borderWidth: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? tint(0.14) : glass.sunken,
                  borderColor: selected ? tint(0.45) : palette.hairline,
                },
                pressed ? { opacity: 0.7 } : null,
              ]}
            >
              <Text
                maxFontSizeMultiplier={1.2}
                className={[
                  'text-label font-semibold tabular-nums',
                  selected ? 'text-acc' : 'text-ink',
                ].join(' ')}
              >
                {value == null ? '–' : rirQuickLabel(value)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DoneButton() {
  const t = useT();
  const dismiss = useSheetDismiss();
  return (
    <View className="mt-lg">
      <PrimaryButton label={t('Done')} onPress={() => dismiss?.()} />
    </View>
  );
}
