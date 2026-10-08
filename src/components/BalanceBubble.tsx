/**
 * BalanceBubble — every account's balance, carried along at the top of Finance
 * once the balance card has scrolled away.
 *
 *   ╭──────────────────────────────────────────╮
 *   │ ╭──────────────╮                         │
 *   │ │💵 CASH       │  💳 ONLINE              │   ← the lit thumb is the account
 *   │ │   9,020      │     48,500              │     every figure below is about
 *   │ ╰──────────────╯                         │
 *   ╰──────────────────────────────────────────╯
 *
 * ── WHY IT EXISTS ─────────────────────────────────────────────────────────
 *
 * The balance is the one number the Expenses section is ABOUT, and it was the
 * first thing to scroll away: reading the category grid meant reading it with no
 * idea what was left. The bubble keeps it on screen — and keeps EVERY live
 * account's balance, one pill each, because switching account is the other thing
 * you do while you read the grid.
 *
 * ── NEVER A TOTAL ─────────────────────────────────────────────────────────
 *
 * Each balance on its own pill, and no sum anywhere, for the same reason the
 * money screen never adds its accounts up: cash and a card are different piles
 * of money, and a figure that pooled them would be a number nobody can spend.
 *
 * ── THE HALVES ────────────────────────────────────────────────────────────
 *
 *   • One HALF per account, equal widths across a fixed 326 dp capsule (v3) —
 *     the capsule no longer hugs its names, so the halves are divided out of
 *     its width here rather than measured.
 *   • The selected half is LIT: c2 16 % fill, c2 38 % border, a c2 glow. It is a
 *     thumb that SLIDES between halves on the spring curve (460 ms), so a switch
 *     is seen travelling rather than two panes swapping.
 *   • Glyph, the name as a 10.5 kicker (acc when selected, faint otherwise) and
 *     the balance at 18 / 22. The amounts ROLL, so a saved expense is seen landing.
 *   • The other half switches account — the whole screen rolls to it. The
 *     selected one scrolls back to the top, which is where its full card is.
 *
 * It rides on `FloatingBubble`, the shell Workout and Tasks share: same glass,
 * same trigger, same drop-in. Only the contents are this file's.
 */

import { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';

import { useT } from '../hooks/useT';
import { formatMoney, formatValue } from '../lib/money';
import { palette, radius, tint } from '../theme/tokens';
import { FloatingBubble } from './FloatingBubble';
import { Pressable } from './Pressable';
import { RollingNumber } from './RollingNumber';
import { SlidingThumb } from './SlidingThumb';

/** The design's Finance pill width; `FloatingBubble` caps it at the screen. */
const BUBBLE_WIDTH = 326;
/**
 * The unselected half's name. It was the prototype's #6B766F, "between muted and
 * faint"; the raised `inkFaint` (U3) is now that step, and #6B766F was 4.3:1.
 */
const QUIET_KICKER = palette.inkFaint;
/* `RollingNumber` is memoised; inline style objects here would be new every
   render and defeat it. Both are theme-free, so module scope is safe. */
const BALANCE_CONTAINER = { marginTop: 1 };
const BALANCE_TEXT = { fontSize: 18 };

export interface BubbleAccount {
  id: string;
  name: string;
  glyph: string;
  balance: number;
}

export function BalanceBubble({
  visible,
  accounts,
  selectedId,
  currency,
  onSelect,
  onTop,
}: {
  visible: boolean;
  accounts: readonly BubbleAccount[];
  selectedId: string;
  currency: string;
  onSelect: (id: string) => void;
  onTop: () => void;
}) {
  const t = useT();
  const screen = useWindowDimensions();
  /* The capsule's width as `FloatingBubble` caps it, less its 1 dp border, 5 dp
     padding and the 4 dp gaps — divided into one equal half per account. */
  const capsule = Math.min(BUBBLE_WIDTH, screen.width - 32);
  const count = Math.max(1, accounts.length);
  const halfWidth = (capsule - 2 - 10 - 4 * (count - 1)) / count;
  /* Where each pill landed inside the capsule, so the thumb can be put on one. */
  const [layouts, setLayouts] = useState<Record<number, { x: number; width: number }>>({});
  const selectedIndex = Math.max(
    0,
    accounts.findIndex((account) => account.id === selectedId),
  );
  const offsets = accounts.map((_, index) => {
    const layout = layouts[index];
    /* `layout.x` is measured from the capsule's outer edge; an absolute child is
       placed from inside its 1 dp border, and `SlidingThumb` adds its own 5 dp
       inset back — so the two come off here. */
    return layout ? { x: layout.x - 6, width: layout.width } : { x: 0, width: 0 };
  });
  const measured = layouts[selectedIndex] != null;

  return (
    <FloatingBubble
      visible={visible}
      width={BUBBLE_WIDTH}
      /* 140 ms, then 70 ms a pill after it. */
      delays={accounts.map((_, index) => 140 + index * 70)}
      contentStyle={{ gap: 4 }}
      onItemLayout={(index, layout) =>
        setLayouts((current) => {
          const was = current[index];
          if (was && was.x === layout.x && was.width === layout.width) return current;
          return { ...current, [index]: layout };
        })
      }
      underlay={
        measured ? (
          <SlidingThumb
            index={selectedIndex}
            count={accounts.length}
            trackWidth={1}
            inset={5}
            offsets={offsets}
            duration={460}
            bezier={[0.34, 1.3, 0.64, 1]}
            style={{
              borderRadius: radius.pill,
              backgroundColor: tint(0.16),
              borderWidth: 1,
              borderColor: tint(0.38),
            }}
          />
        ) : null
      }
    >
      {accounts.map((account) => {
        const selected = account.id === selectedId;
        return (
          <Pressable
            key={account.id}
            onPress={() => (selected ? onTop() : onSelect(account.id))}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${account.name}, ${formatMoney(account.balance, currency)}`}
            accessibilityHint={selected ? t('Back to the top') : t('Switch to this subsection')}
            style={({ pressed }) => ({
              width: halfWidth,
              height: 56,
              paddingLeft: 12,
              paddingRight: 14,
              flexDirection: 'row',
              alignItems: 'center',
              borderRadius: radius.pill,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            })}
          >
            <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 22, lineHeight: 26 }}>
              {account.glyph}
            </Text>
            <View style={{ marginLeft: 10, flex: 1, minWidth: 0 }}>
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={{
                  fontSize: 12.5,
                  lineHeight: 16,
                  letterSpacing: 1.1,
                  color: selected ? palette.acc : QUIET_KICKER,
                }}
                className="font-semibold uppercase"
              >
                {account.name}
              </Text>
              <RollingNumber
                value={formatValue(account.balance)}
                lineHeight={22}
                duration={800}
                containerStyle={BALANCE_CONTAINER}
                style={BALANCE_TEXT}
                className={['font-semibold', selected ? 'text-ink' : 'text-ink-muted'].join(' ')}
              />
            </View>
          </Pressable>
        );
      })}
    </FloatingBubble>
  );
}
