/**
 * BalanceBubble — every account's balance, carried along at the top of Finance
 * once the balance card has scrolled away.
 *
 *   ╭──────────────────────────────────────────╮
 *   │ ╭──────────────────╮                     │
 *   │ │💵 CASH           │ 💸 ONLINE           │   ← the lit thumb is the account
 *   │ │   9,020          │    48,500           │     every figure below is about
 *   │ ╰──────────────────╯                     │
 *   │   🏛 BANK             🐷 SAVINGS          │   ← a second row, not a narrower
 *   │      120,000             310,000         │     pill: two columns at most
 *   ╰──────────────────────────────────────────╯
 *
 * ── WHY IT EXISTS ─────────────────────────────────────────────────────────
 *
 * The balance is the one number the Expenses section is ABOUT, and it was the
 * first thing to scroll away: reading the category grid meant reading it with no
 * idea what was left. The bubble keeps it on screen — and keeps EVERY live
 * account's balance, one cell each, because switching account is the other thing
 * you do while you read the grid.
 *
 * ── NEVER A TOTAL ─────────────────────────────────────────────────────────
 *
 * Each balance in its own cell, and no sum anywhere, for the same reason the
 * money screen never adds its accounts up: cash and a card are different piles
 * of money, and a figure that pooled them would be a number nobody can spend.
 *
 * ── THE GRID ──────────────────────────────────────────────────────────────
 *
 *   • It was one HALF per account across the fixed 326 dp capsule — right for
 *     the two accounts it was drawn with. At four, each "half" was ~75 dp: the
 *     names read `…` and the amounts clipped to `4,`. So the cells are a GRID of
 *     at most two columns (`lib/bubbleGrid.ts` has the layout and why an odd
 *     last cell stays half width, on the left): one account is one full-width
 *     cell, two is the original row, four is 2×2, five or six is three rows.
 *   • More than one row and the capsule stops being a pill: its corners are
 *     concentric with the cells', or a full radius would cut into them.
 *   • The selected cell is LIT: c2 16 % fill, c2 38 % border, a c2 glow. It is a
 *     thumb that SLIDES between cells on the spring curve (460 ms) — across a
 *     row and between rows — so a switch is seen travelling rather than two
 *     panes swapping. Its place is computed from the grid, not measured: every
 *     cell has a fixed size, so it is right from the first frame.
 *   • Glyph, the name as a 12.5 kicker (acc when selected, faint otherwise) and
 *     the balance at 18, or smaller in half-steps down to micro when the whole
 *     figure would not otherwise fit the cell — a balance that shrinks is still a
 *     balance, a clipped one is not. The amounts ROLL, so a saved expense is
 *     seen landing.
 *   • Another cell switches account — the whole screen rolls to it. The selected
 *     one scrolls back to the top, which is where its full card is.
 *
 * It rides on `FloatingBubble`, the shell Workout and Tasks share: same glass,
 * same trigger, same drop-in. Only the contents — and, through `contentStyle`,
 * the wrap that makes them rows — are this file's.
 */

import { Text, View, useWindowDimensions, type TextStyle } from 'react-native';

import { useT } from '../hooks/useT';
import {
  BUBBLE_PAD,
  CELL_GAP,
  CELL_HEIGHT,
  CELL_PAD_LEFT,
  CELL_PAD_RIGHT,
  GLYPH_GAP,
  GLYPH_WIDTH,
  amountFontSize,
  bubbleCapsuleWidth,
  bubbleGrid,
} from '../lib/bubbleGrid';
import { formatMoney, formatValue } from '../lib/money';
import { useMoneyScale } from '../hooks/useMoneyScale';
import { palette, radius, tint } from '../theme/tokens';
import { FloatingBubble } from './FloatingBubble';
import { Pressable } from './Pressable';
import { RollingNumber } from './RollingNumber';
import { SlidingThumb } from './SlidingThumb';

/** The design's Finance pill width; `FloatingBubble` caps it at the screen. */
const BUBBLE_WIDTH = 326;
/**
 * The unselected cell's name. It was the prototype's #6B766F, "between muted and
 * faint"; the raised `inkFaint` (U3) is now that step, and #6B766F was 4.3:1.
 */
const QUIET_KICKER = palette.inkFaint;
/* `RollingNumber` is memoised; inline style objects here would be new every
   render and defeat it. The size now varies with the figure, so one object per
   size, kept for the life of the module — there are only a dozen half-steps. */
const BALANCE_CONTAINER = { marginTop: 1 };
const BALANCE_TEXT = new Map<number, TextStyle>();
function balanceText(fontSize: number): TextStyle {
  let style = BALANCE_TEXT.get(fontSize);
  if (!style) {
    style = { fontSize };
    BALANCE_TEXT.set(fontSize, style);
  }
  return style;
}

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
  const scale = useMoneyScale();
  const screen = useWindowDimensions();
  const grid = bubbleGrid(accounts.length, bubbleCapsuleWidth(screen.width, BUBBLE_WIDTH));
  const selectedIndex = Math.max(
    0,
    accounts.findIndex((account) => account.id === selectedId),
  );
  /* The thumb is absolute, so it is placed from inside the 1 dp border — where
     the content box starts after the 6 dp padding on the left and top. */
  const offsets = grid.cells.map((cell) => ({
    x: BUBBLE_PAD + cell.x,
    y: BUBBLE_PAD + cell.y,
    width: grid.cellWidth,
    height: CELL_HEIGHT,
  }));

  return (
    <FloatingBubble
      visible={visible}
      width={BUBBLE_WIDTH}
      /* 140 ms, then 70 ms a cell after it. */
      delays={accounts.map((_, index) => 140 + index * 70)}
      contentStyle={[
        { flexWrap: 'wrap', gap: CELL_GAP },
        grid.cornerRadius != null ? { borderRadius: grid.cornerRadius } : null,
      ]}
      underlay={
        accounts.length > 0 ? (
          <SlidingThumb
            index={selectedIndex}
            count={accounts.length}
            trackWidth={1}
            inset={0}
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
        const value = formatValue(account.balance, scale);
        return (
          <Pressable
            key={account.id}
            onPress={() => (selected ? onTop() : onSelect(account.id))}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${account.name}, ${formatMoney(account.balance, currency, scale)}`}
            accessibilityHint={selected ? t('Back to the top') : t('Switch to this account')}
            style={({ pressed }) => ({
              width: grid.cellWidth,
              height: CELL_HEIGHT,
              paddingLeft: CELL_PAD_LEFT,
              paddingRight: CELL_PAD_RIGHT,
              flexDirection: 'row',
              alignItems: 'center',
              borderRadius: radius.pill,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            })}
          >
            {/* A fixed slot, so the room `amountFontSize` reckons with is the
                room the text actually gets. */}
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ width: GLYPH_WIDTH, textAlign: 'center', fontSize: 22, lineHeight: 26 }}
            >
              {account.glyph}
            </Text>
            <View style={{ marginLeft: GLYPH_GAP, flex: 1, minWidth: 0 }}>
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
                value={value}
                lineHeight={22}
                duration={800}
                containerStyle={BALANCE_CONTAINER}
                style={balanceText(amountFontSize(value, grid.cellWidth))}
                className={['font-semibold', selected ? 'text-ink' : 'text-ink-muted'].join(' ')}
              />
            </View>
          </Pressable>
        );
      })}
    </FloatingBubble>
  );
}
