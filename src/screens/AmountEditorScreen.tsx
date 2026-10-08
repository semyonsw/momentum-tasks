/**
 * AmountEditorScreen — one amount, typed on a keypad this screen owns.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ (‹) NEW EXPENSE                              │  ← no Save in this bar
 *   │     💵 Cash · Today, 18 Sep                  │
 *   │ AMOUNT · AMD                                 │
 *   │ 2,400| AMD                                   │  ← 62 dp, glowing once typed
 *   │ (🧊 Food)(🚌 Transport)(🏠 Home)(💊 Health)  │  ← pick the category here
 *   │ (💵 Cash ▾) (Expense|Income)                 │
 *   │ (‹ Today, 18 Sep ›) (Day|Month) (＋ Note)     │
 *   │                            ╭ ✓ Save ╮         │  ← floats over the keypad
 *   │ ┌──────┐┌──────┐┌──────┐                     │
 *   │ │  1   ││  2   ││  3   │                     │
 *   │ └──────┘└──────┘└──────┘                     │
 *   │   4       5       6                          │
 *   │   7       8       9                          │
 *   │  000      0       ⌫                          │  ← `.` for cents (U25)
 *   └──────────────────────────────────────────────┘
 *
 * ── THE KEYPAD IS A GRID OF VIEWS, NOT A `TextInput` ──────────────────────
 *
 * The whole ergonomic argument depends on owning the bottom 300 dp. With the
 * system keyboard the app cannot: it decides its own height, it covers whatever
 * it likes, it puts a `Done` key where `Save` should be, and it changes all
 * three between phones. A grid of twelve `Pressable`s is the same twelve digits
 * at a size this app chose, in a place `Save` can be anchored against.
 *
 * It also removes the last reason the amount had to be small. `2,400` is the
 * thing you came here to type and it is now the one hero on the screen at 62 dp,
 * faint at zero and lit the moment a digit exists, with a caret blinking at 1 s.
 *
 * ── FOUR LABELLED SECTIONS BECAME A ROW OF CHIPS ──────────────────────────
 *
 * `Direction`, `Subsection`, `Category`, `When` were four kickers, four
 * controls and roughly 400 dp of scroll — on a screen whose fastest path is a
 * number and `Save`, because every one of those four arrives already correct:
 * you tapped a category tile in a direction the grid was already showing, in the
 * subsection you were already reading, on the day you were reading. So they are
 * chips. Each one STATES its answer, and correcting one is a tap; the category's
 * chip is the `lit` one because it is the only one of the six that changes what
 * the amount is ABOUT.
 *
 * ── AND `WHEN` ARRIVES CORRECT TOO, WHICH IT DID NOT USED TO ──────────────
 *
 * It was always today. Stepping the money screen back to the 16th and tapping a
 * category is unambiguously a sentence about the 16th, and this screen opening
 * on today meant three taps on the stepper to say again what had already been
 * said — or, far worse, a `Save` that filed the 16th's taxi on the 19th and gave
 * two days the wrong total. The `day` prop carries it; `lib/money.ts` works out
 * which day a window means.
 *
 * ── THE MOTION PASS ───────────────────────────────────────────────────────
 *
 *   • It ARRIVES as a push (the shell slides it in); inside it, the fields rise
 *     in at 140 ms and the twelve keys follow 22 ms apart. It used to slide up
 *     like a sheet on its own, which stacked a second entrance on the push.
 *   • THE CATEGORY IS PICKED ON THIS SCREEN — every live category as a 38 dp
 *     chip, the chosen one lit and glowing — instead of behind a chip that opened a second
 *     sheet. It is the one field that changes what an amount is ABOUT, and
 *     correcting it used to cost two taps and a sheet.
 *   • THE AMOUNT ROLLS as digits land, faint at zero, ink once typed.
 *   • A KEY SINKS to 0.92 and tints c2 under the finger.
 *   • Saving says what was saved on the way out: `Food · 1,200 AMD saved`.
 *
 * ── AND SAVE LEFT THE CORNER ──────────────────────────────────────────────
 *
 * It was a pill in the header, which is the single worst place for the one
 * action on a screen whose other twelve targets are all in the bottom third. It
 * floats 16 dp above the keypad's right edge now — `right: 16`, the same
 * geometry as every other section's commit action (the design's `bottom: 318`).
 *
 * It is PRESENT while the amount is empty — the gradient pill at 50 % and scale
 * .94 — rather than hidden. A button that materialises under a thumb already on
 * its way is a button that gets pressed by accident; this one wakes instead,
 * with a 420 ms spring, when the first digit lands. See `SavePill`.
 *
 * ── DELETE IS A SENTENCE, NOT A RED BUTTON ────────────────────────────────
 *
 * `ink-muted` text at the foot, under the chips — `DangerFootAction`, the one
 * destructive rule every screen follows (U19) — and the coral is saved for the
 * confirm it opens. It only exists when there is something to delete; a new
 * amount has no row to remove.
 *
 * ── THE CHIPS ARE THE DIRECTION'S OWN CATEGORIES ──────────────────────────
 *
 * Expenses and incomes keep separate category lists (`lib/money.ts`), so the
 * row offers only the side the switch is on, and flipping the switch swaps the
 * row — and the selection, to the first of the other side, since an expense
 * category is never a valid answer for an income. A side with no categories yet
 * says where to add one rather than saving into nothing.
 *
 * ── AND THE SAME KEYPAD MOVES MONEY ───────────────────────────────────────
 *
 * `transfer` turns this into the ⇄ editor: `From` and `To` instead of the
 * category, direction, span and note, and `Save` writes both halves at once
 * (`addTransfer`). Opening either half of an existing transfer lands here too,
 * edits both, and `Delete` takes both. A transfer is always on one day — money
 * leaves a pocket at a moment — so there is no whole-month switch.
 *
 * ── `A DAY` OR `WHOLE MONTH` ──────────────────────────────────────────────
 *
 * The one switch here people do not expect, so it keeps its explanation: a whole
 * month counts towards the month, the year and the balance, and towards no
 * single day. Rent is not spent on the 3rd, and filing it there makes the 3rd a
 * lie every time you open it. See `lib/money.ts`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ScrollView, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable } from '../components/Pressable';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmSheet } from '../components/ConfirmSheet';
import { Sheet } from '../components/Sheet';
import { Icon } from '../components/Icon';
import { BubblePressable } from '../components/bubbles';
import { Lamps, SpecularEdge } from '../components/glass';
import { MaterialSymbol } from '../components/MaterialSymbol';
import { ScreenHeader } from '../components/ScreenHeader';
import { SlidingThumb } from '../components/SlidingThumb';
import { Stagger, pressedStyle, usePressScale } from '../components/motion';
import { RollingNumber } from '../components/RollingNumber';
import { DangerFootAction, Separator, TextButton } from '../components/primitives';
import { dayKey, formatLongDay, formatMonth, parseDay, shiftDay } from '../lib/days';
import { tap } from '../lib/feedback';
import {
  type Amount,
  type AmountWhen,
  type Direction,
  type MoneyAccount,
  categoriesFor,
  formatMoney,
  formatValue,
  transferPartner,
} from '../lib/money';
import {
  entryToMinor,
  formatEntry,
  keypadDecimals,
  keypadKeys,
  keypadPress,
  minorToEntry,
} from '../lib/moneyUnits';
import { quickCategoryId } from '../lib/quickCategory';
import { useMoneyScale } from '../hooks/useMoneyScale';
import { useMoney } from '../state/moneyStore';
import { useLanguage, useT } from '../hooks/useT';
import { useSettings } from '../state/settingsStore';
import { TOUCH_MIN, slopInsets } from '../lib/hitTarget';
import {
  curve,
  focalType,
  glass,
  gradientFill,
  motion,
  palette,
  radius,
  specularHeavy,
  tint,
} from '../theme/tokens';
import type { ID } from '../types/models';

/** A key's height, its corner and the air around it — 62 high, 10 apart (v3). */
const KEY_HEIGHT = 62;
const KEY_GAP = 10;
const KEY_RADIUS = 20;
/** The keypad's foot above the gesture strip. */
const KEYPAD_FOOT = 24;
/** One half of the Expense | Income switch. */
const SEGMENT_WIDTH = 80;
/** The amount at zero: fainter than `inkFaint`, so the caret is the loudest thing. */
const AMOUNT_EMPTY = '#3A433F';
/** Key glyphs and the date: between ink and `inkMuted`, as drawn. */
const INK_SOFT = '#AEB9B3';
/** Save waking: the 420 ms overshoot. */
const WAKE_SPRING = [0.34, 1.56, 0.64, 1] as const;
/** The direction thumb: 360 ms, a slight overshoot. */
const THUMB_SPRING = [0.34, 1.3, 0.64, 1] as const;

/*
 * The twelve keys, the entry they edit and the 12-digit cap live in
 * `lib/moneyUnits.ts` (`keypadKeys`, `keypadPress`): with cents the bottom-left
 * key is `.` instead of `000` (U25), and the rules for a second point, the
 * two-decimal cap and backspacing across the point are tested there. The cap is
 * still the reason `000` is safe — three taps on it is nine zeroes, and without
 * a limit a pocketed phone can overflow the field and the `Number` behind it.
 */

interface AmountEditorScreenProps {
  /** The amount being edited, or null for a new one. */
  amount: Amount | null;
  /** Which category a new amount lands in. Ignored when editing. */
  categoryId: ID | null;
  /** Which subsection a new amount lands in. Ignored when editing. */
  accountId: ID | null;
  /**
   * Which DAY a new amount lands on. Ignored when editing — an amount already
   * has a day, and the stepper is right there.
   *
   * Not `today`, and that is the whole point of the prop: the money screen's
   * window is a sentence about a day, and tapping `Food` while reading the 16th
   * MEANS the 16th. Filing it under today was the screen overruling the only
   * thing the user had said, and the correction cost three taps on the stepper
   * every time. `lib/money.ts`'s `dayInWindow` works out which day that is.
   *
   * Optional so that the paths with no window behind them — a row of the day
   * list, opened to be corrected — can leave it out and get today.
   */
  day?: string;
  /**
   * Which way a NEW amount points, decided by whatever opened this screen.
   *
   * The money grid is already showing expenses or incomes when a tile is tapped,
   * and arriving on the other one would mean the first field a user corrects is
   * the one they had just told the app. Ignored when editing: an amount already
   * knows its own direction, and the chip is right there.
   */
  direction?: Direction;
  /**
   * The ⇄ editor: `accountId` is `From`. True for both halves of an existing
   * transfer as well. See the file header.
   */
  transfer?: boolean;
  /**
   * Leave.
   *
   * `saved` is true only on the path through the floating `Save`, and the shell
   * uses it to raise the toast over the section this screen returns to. It is an
   * argument rather than a second callback because every other way out of here —
   * the chevron, hardware back, deleting the amount — means exactly the same
   * thing, and a `onSaved` beside an `onBack` is two doors where there is one.
   */
  onBack: (saved?: boolean, summary?: string) => void;
}

export function AmountEditorScreen({
  amount,
  categoryId,
  accountId,
  direction: initialDirection = 'expense',
  day: initialDay,
  transfer = false,
  onBack,
}: AmountEditorScreenProps) {
  const t = useT();
  const lang = useLanguage();
  const insets = useSafeAreaInsets();
  const accounts = useMoney((s) => s.accounts);
  const categories = useMoney((s) => s.categories);
  const amounts = useMoney((s) => s.amounts);
  const currency = useSettings((s) => s.currencyCode);
  /* The log's scale (whole units, or hundredths) and how many decimals the
     keypad offers in it — see `lib/moneyUnits.ts`. Stored amounts are integers
     in that scale; the keypad's string is converted at this edge only. */
  const scale = useMoneyScale();
  const decimals = keypadDecimals(scale, currency);
  const keys = keypadKeys(decimals);
  const pinScale = useMoney((s) => s.pinScale);
  const addAmount = useMoney((s) => s.addAmount);
  const updateAmount = useMoney((s) => s.updateAmount);
  const deleteAmount = useMoney((s) => s.deleteAmount);
  const addTransfer = useMoney((s) => s.addTransfer);
  const updateTransfer = useMoney((s) => s.updateTransfer);

  /* An archived subsection stays selectable while an amount still sits in it —
     otherwise editing that amount would silently move it somewhere else. */
  const liveAccounts = accounts.filter(
    (account) =>
      account.archivedAt === null ||
      account.id === amount?.accountId ||
      amounts.some(
        (row) =>
          row.transferId !== undefined &&
          row.transferId === amount?.transferId &&
          row.accountId === account.id,
      ),
  );

  const today = dayKey(new Date());
  /* The day a NEW amount opens on: the window's, when one came with the tap.
     Guarded, because a route that predates the prop — or a malformed one — must
     not put an amount on `undefined`. */
  const landsOn = initialDay && parseDay(initialDay) ? initialDay : today;
  const [digits, setDigits] = useState(amount ? minorToEntry(amount.value, scale) : '');
  const [direction, setDirection] = useState<Direction>(amount?.direction ?? initialDirection);
  /* Only this side's categories — plus the amount's own while it is on this
     side, archived or not, so editing it never silently moves it. */
  const live = categories.filter(
    (category) =>
      (category.id === amount?.categoryId && category.direction === direction) ||
      categoriesFor([category], direction, { pickable: true }).length > 0,
  );
  /* A category handed in for a NEW amount must still be live: an archived one
     opened the editor with an empty chip and saved the amount under a category
     the grid no longer shows. An existing amount keeps its own, archived or not. */
  const [category, setCategory] = useState<ID | null>(
    amount?.categoryId ??
      (categoryId && live.some((option) => option.id === categoryId) ? categoryId : null) ??
      live[0]?.id ??
      null,
  );
  const [account, setAccount] = useState<ID | null>(
    amount?.accountId ?? accountId ?? liveAccounts[0]?.id ?? null,
  );
  /*
   * The two ends of a transfer. An existing one reads them off its halves (the
   * expense half is `From`); a new one goes from the subsection that opened it
   * to the next live one.
   */
  const partner = amount ? transferPartner(amounts, amount) : null;
  const outHalf = amount?.direction === 'expense' ? amount : partner;
  const inHalf = amount?.direction === 'income' ? amount : partner;
  const [fromAccount, setFromAccount] = useState<ID | null>(
    outHalf?.accountId ?? accountId ?? liveAccounts[0]?.id ?? null,
  );
  const [toAccount, setToAccount] = useState<ID | null>(
    inHalf?.accountId ?? liveAccounts.find((row) => row.id !== fromAccount)?.id ?? null,
  );
  const [span, setSpan] = useState<'day' | 'month'>(amount?.when.kind ?? 'day');
  const [day, setDay] = useState(amount?.when.kind === 'day' ? amount.when.date : landsOn);
  /* The month follows the day for the same reason: switching a new amount to
     `Whole month` while reading March means March, not this one. */
  const [monthAnchor, setMonthAnchor] = useState(() =>
    amount?.when.kind === 'month'
      ? dayKey(new Date(amount.when.year, amount.when.month, 1))
      : landsOn,
  );
  const [note, setNote] = useState(amount?.note ?? '');
  const [deleting, setDeleting] = useState(false);
  /** Which picker is open. Closed is the normal state of all three. */
  const [picking, setPicking] = useState<'account' | 'from' | 'to' | 'note' | null>(null);
  /** Said out loud when `Save` is pressed with nothing typed. */
  const [complaint, setComplaint] = useState(false);

  const chosen = live.find((option) => option.id === category) ?? null;
  const chosenAccount = liveAccounts.find((option) => option.id === account) ?? null;
  const chosenFrom = liveAccounts.find((option) => option.id === fromAccount) ?? null;
  const chosenTo = liveAccounts.find((option) => option.id === toAccount) ?? null;

  const value = entryToMinor(digits, scale);
  const savable = transfer
    ? value > 0 && chosenFrom !== null && chosenTo !== null && fromAccount !== toAccount
    : value > 0 && chosen !== null && account !== null;
  const noun = transfer ? t('transfer') : direction === 'expense' ? t('expense') : t('income');

  /* Flipping the switch flips the list, and the selection with it — see the
     header. The amount's own category survives a flip back. */
  const changeDirection = (next: Direction) => {
    setDirection(next);
    const own = categories.find((option) => option.id === category);
    if (own?.direction === next) return;
    const original = categories.find((option) => option.id === amount?.categoryId);
    if (original?.direction === next) {
      setCategory(original.id);
      return;
    }
    setCategory(quickCategoryId(categoriesFor(categories, next, { pickable: true })));
  };

  /* A transfer's two ends must differ: picking the other end's subsection swaps them. */
  const pickEnd = (end: 'from' | 'to', id: ID) => {
    if (end === 'from') {
      if (id === toAccount) setToAccount(fromAccount);
      setFromAccount(id);
    } else {
      if (id === fromAccount) setFromAccount(toAccount);
      setToAccount(id);
    }
  };

  const whenOf = (): AmountWhen => {
    if (span === 'day') return { kind: 'day', date: day };
    const at = parseDay(monthAnchor) ?? new Date();
    return { kind: 'month', year: at.getFullYear(), month: at.getMonth() };
  };

  const press = (key: string | 'back') => {
    tap();
    setComplaint(false);
    setDigits((current) => keypadPress(current, key, decimals));
  };

  const save = () => {
    // The first amount a log ever gets fixes the scale it is kept in.
    if (savable) pinScale(scale);
    if (transfer) {
      if (!savable || fromAccount === null || toAccount === null) {
        setComplaint(true);
        return;
      }
      const draft = { fromAccountId: fromAccount, toAccountId: toAccount, value, date: day };
      if (amount?.transferId) updateTransfer(amount.transferId, draft);
      else addTransfer(draft);
      onBack(
        true,
        chosenFrom && chosenTo
          ? t('{from} → {to} · {amount} moved', {
              from: chosenFrom.name,
              to: chosenTo.name,
              amount: formatMoney(value, currency, scale),
            })
          : undefined,
      );
      return;
    }
    if (!savable || category === null || account === null) {
      setComplaint(true);
      return;
    }
    const draft = {
      categoryId: category,
      accountId: account,
      direction,
      value,
      when: whenOf(),
      note,
    };
    if (amount) updateAmount(amount.id, draft);
    else addAmount(draft);
    /* What was saved, in the words the toast will say over the section:
       `Food · 1,200 AMD saved`. */
    onBack(
      true,
      chosen
        ? t('{category} · {amount} saved', {
            category: chosen.name,
            amount: formatMoney(value, currency, scale),
          })
        : undefined,
    );
  };

  const stepWhen = (delta: number) => {
    if (span === 'day') {
      setDay(shiftDay(day, delta));
      return;
    }
    const at = parseDay(monthAnchor) ?? new Date();
    // Day 1 first, so stepping off the 31st does not skip February.
    setMonthAnchor(dayKey(new Date(at.getFullYear(), at.getMonth() + delta, 1)));
  };
  const whenLabel = (() => {
    if (span === 'day') {
      return day === today
        ? `${t('Today')}, ${formatLongDay(day, lang)}`
        : formatLongDay(day, lang);
    }
    const at = parseDay(monthAnchor) ?? new Date();
    return formatMonth(at.getFullYear(), at.getMonth(), lang);
  })();

  /* The keypad's own height, so `Save` can be anchored just above it rather than
     to the bottom of the screen: four rows of 62 and three gaps of 10. With the
     keypad's 24 of foot and 16 of air that puts the pill at the design's
     `bottom: 318`. The gesture strip is added on top of both, the same way. */
  const keypadHeight = 4 * KEY_HEIGHT + 3 * KEY_GAP;
  const saveBottom = KEYPAD_FOOT + keypadHeight + 16;

  const subline = transfer
    ? chosenFrom && chosenTo
      ? `${chosenFrom.glyph} ${chosenFrom.name} → ${chosenTo.glyph} ${chosenTo.name} · ${whenLabel}`
      : whenLabel
    : chosenAccount
      ? `${chosenAccount.glyph} ${chosenAccount.name} · ${whenLabel}`
      : whenLabel;

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <StatusBar style="light" />
      <Lamps section="Expenses" />

      {/* The shared pushed-screen header. NO COMMIT ACTION — see the file
          header. Wrapped, not passed: `onBack` takes a `saved` flag and a press
          would hand it a gesture event, which is truthy. */}
      <ScreenHeader
        kicker={amount ? t('Edit {noun}', { noun }) : t('New {noun}', { noun })}
        subtitle={subline}
        onBack={() => onBack()}
        bordered={false}
      />

      <ScrollView
        className="flex-1"
        /* Room to scroll the last chips out from under the floating Save. */
        contentContainerStyle={{ paddingBottom: 96 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Stagger delay={140} duration={560} rise={14}>
          {/* THE ONE HERO. Faint at zero, ink with a c2 glow the moment there is
              something to read, and a caret that blinks at 1 s so the number
              reads as the thing being typed into. */}
          <View className="px-lg pt-[16px]">
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ fontSize: 12.5, lineHeight: 16, letterSpacing: 1.1 }}
              className="font-semibold uppercase text-acc"
            >
              {`${t('Amount')} · ${currency}`}
            </Text>
            <View style={{ marginTop: 4, height: 70 }} className="flex-row items-end">
              {/* It ROLLS as digits land — the number is seen growing. */}
              <RollingNumber
                value={formatEntry(digits)}
                lineHeight={focalType.amount.lineHeight}
                duration={350}
                accessibilityLabel={`${t('Amount in {currency}', { currency })}: ${formatValue(value, scale)}`}
                style={[
                  {
                    fontSize: focalType.amount.fontSize,
                    letterSpacing: focalType.amount.letterSpacing,
                    color: digits === '' ? AMOUNT_EMPTY : palette.ink,
                  },
                ]}
                className="font-semibold"
              />
              <Caret />
              <Text
                maxFontSizeMultiplier={1.3}
                style={{ fontSize: 22, lineHeight: 26, marginBottom: 10 }}
                className="ml-sm font-semibold text-ink-muted"
              >
                {currency}
              </Text>
            </View>
            {complaint ? (
              <Text className="mt-xs text-label font-medium text-green-bright">
                {value > 0
                  ? transfer
                    ? t('Pick two different subsections')
                    : t('Pick a category first')
                  : t('Type an amount first')}
              </Text>
            ) : null}
          </View>

          {transfer ? (
            <TransferFields
              from={chosenFrom}
              to={chosenTo}
              whenLabel={whenLabel}
              onPickFrom={() => {
                tap();
                setPicking('from');
              }}
              onPickTo={() => {
                tap();
                setPicking('to');
              }}
              onSwap={() => {
                tap();
                setFromAccount(toAccount);
                setToAccount(fromAccount);
              }}
              onEarlier={() => setDay(shiftDay(day, -1))}
              onLater={() => setDay(shiftDay(day, 1))}
            />
          ) : (
            <>
              {/* THE CATEGORY, picked right here: every live one as a chip, the
              chosen one lit and glowing. See the file header. */}
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel={t('Category')}
                className="flex-row flex-wrap px-lg"
                style={{ gap: 8, marginTop: 14 }}
              >
                {live.map((option) => (
                  <CategoryChip
                    key={option.id}
                    glyph={option.glyph}
                    name={option.name}
                    selected={option.id === category}
                    onPress={() => {
                      tap();
                      setComplaint(false);
                      setCategory(option.id);
                    }}
                  />
                ))}
              </View>
              {live.length === 0 ? (
                <Text className="mx-lg mt-sm text-label text-ink-faint">
                  {direction === 'expense'
                    ? t('No expense categories yet. Add one on the Expenses tab.')
                    : t('No income categories yet. Add one on the Incomes tab.')}
                </Text>
              ) : null}

              {/* THE OTHER ANSWERED FIELDS, as one wrapping row. */}
              <View
                className="flex-row flex-wrap items-center px-lg"
                style={{ gap: 8, marginTop: 12 }}
              >
                <Chip
                  label={chosenAccount ? `${chosenAccount.glyph} ${chosenAccount.name}` : '—'}
                  chevron
                  onPress={() => {
                    tap();
                    setPicking('account');
                  }}
                  accessibilityLabel={t('Subsection')}
                />
                <DirectionSwitch
                  value={direction}
                  onChange={changeDirection}
                  expenseLabel={t('Expense')}
                  incomeLabel={t('Income')}
                  accessibilityLabel={t('Money out, or money in')}
                />
                <StepperChip
                  label={whenLabel}
                  onEarlier={() => stepWhen(-1)}
                  onLater={() => stepWhen(1)}
                />
                <MiniSegmented
                  options={[
                    { value: 'day' as const, label: t('A day') },
                    { value: 'month' as const, label: t('Whole month') },
                  ]}
                  value={span}
                  onChange={setSpan}
                  accessibilityLabel={t('A single day, or a whole month')}
                />
                <Chip
                  label={note.trim() === '' ? t('Note') : note.trim()}
                  onPress={() => {
                    tap();
                    setPicking('note');
                  }}
                  accessibilityLabel={t('Note')}
                />
              </View>

              {span === 'month' ? (
                <Text className="mx-lg mt-sm text-label text-ink-faint">
                  {t(
                    'A whole month counts towards the month, the year and the balance, and towards no single day.',
                  )}
                </Text>
              ) : null}
            </>
          )}

          {/* The one destructive rule (U19): muted, at the foot, and it asks. */}
          {amount ? (
            <DangerFootAction
              label={transfer ? t('Delete this transfer') : t('Delete this amount')}
              onPress={() => setDeleting(true)}
              className="mx-md mt-xl"
            />
          ) : null}
        </Stagger>
      </ScrollView>

      {/* THE KEYPAD. Twelve keys the app owns, at a size the app chose, rising in
          22 ms apart after the fields have landed. */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingBottom: KEYPAD_FOOT + insets.bottom,
          gap: KEY_GAP,
        }}
      >
        {[0, 1, 2, 3].map((row) => (
          <View key={row} className="flex-row" style={{ gap: KEY_GAP }}>
            {keys.slice(row * 3, row * 3 + 3).map((key, column) => (
              <Key
                key={key}
                value={key}
                delay={200 + (row * 3 + column) * 22}
                onPress={() => press(key)}
              />
            ))}
          </View>
        ))}
      </View>

      <SavePill
        label={t('Save')}
        asleep={!savable}
        bottom={saveBottom + insets.bottom}
        onPress={save}
      />

      {picking === 'account' ? (
        <Sheet title={t('Subsection')} onDismiss={() => setPicking(null)}>
          <View className="overflow-hidden rounded-surface bg-surface-alt">
            {liveAccounts.map((option, index) => (
              <View key={option.id}>
                {index > 0 ? <Separator inset={16} /> : null}
                <PickRow
                  glyph={option.glyph}
                  name={option.name}
                  selected={option.id === account}
                  onPress={() => {
                    tap();
                    setAccount(option.id);
                    setPicking(null);
                  }}
                />
              </View>
            ))}
          </View>
          <TextButton label={t('Cancel')} onPress={() => setPicking(null)} />
        </Sheet>
      ) : null}

      {picking === 'from' || picking === 'to' ? (
        <Sheet title={picking === 'from' ? t('From') : t('To')} onDismiss={() => setPicking(null)}>
          <View className="overflow-hidden rounded-surface bg-surface-alt">
            {liveAccounts.map((option, index) => (
              <View key={option.id}>
                {index > 0 ? <Separator inset={16} /> : null}
                <PickRow
                  glyph={option.glyph}
                  name={option.name}
                  selected={option.id === (picking === 'from' ? fromAccount : toAccount)}
                  onPress={() => {
                    tap();
                    pickEnd(picking, option.id);
                    setPicking(null);
                  }}
                />
              </View>
            ))}
          </View>
          <TextButton label={t('Cancel')} onPress={() => setPicking(null)} />
        </Sheet>
      ) : null}

      {picking === 'note' ? (
        <Sheet title={t('Note')} onDismiss={() => setPicking(null)}>
          <View className="h-row flex-row items-center rounded-surface border border-hairline bg-surface-alt px-lg">
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('What it was for')}
              placeholderTextColor={palette.inkFaint}
              cursorColor={palette.greenBright}
              selectionColor={palette.greenBright}
              accessibilityLabel={t('Note')}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => setPicking(null)}
              className="flex-1 text-body text-ink"
            />
          </View>
          <TextButton label={t('Done')} tone="green" onPress={() => setPicking(null)} />
        </Sheet>
      ) : null}

      {deleting && amount ? (
        <ConfirmSheet
          tone="danger"
          title={transfer ? t('Delete this transfer?') : t('Delete this amount?')}
          body={
            transfer
              ? t('Both halves go: the money returns to where it was moved from.')
              : t(
                  'It leaves the category, the month, the year and the balance. Nothing else changes.',
                )
          }
          confirmLabel={t('Delete it')}
          cancelLabel={t('Keep it')}
          onConfirm={() => {
            deleteAmount(amount.id);
            setDeleting(false);
            onBack();
          }}
          onCancel={() => setDeleting(false)}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The caret: 3 × 48 in `acc`, on for half a second and off for the other half.
 *
 * A stepped blink rather than a breathing fade — a fade reads as a lamp, and a
 * hard on/off is the one shape everybody already knows means "typing goes
 * here". Opacity on the native driver, so it costs the JS thread nothing.
 */
function Caret() {
  const on = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const step = (toValue: number) =>
      Animated.timing(on, { toValue, duration: 0, useNativeDriver: true });
    const loop = Animated.loop(
      Animated.sequence([step(1), Animated.delay(500), step(0.15), Animated.delay(500)]),
    );
    loop.start();
    return () => loop.stop();
  }, [on]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        width: 3,
        height: 48,
        marginLeft: 8,
        marginBottom: 9,
        borderRadius: 2,
        backgroundColor: palette.acc,
        opacity: on,
      }}
    />
  );
}

/**
 * ✓ Save — the gradient pill floating just above the keypad's right edge.
 *
 * Its own component rather than `FloatingAction`, because the design's sleep is
 * a different thing from that one's: the GRADIENT pill at 50 % and scale .94
 * (still recognisably the commit, just not yet), where `FloatingAction`'s sleep
 * is a ghost-glass pill. Waking is a 420 ms spring on the scale and a 300 ms
 * fade, and the halo only switches on once it is awake — a glowing button that
 * does nothing is a lie about what a tap will do. It stays PRESSABLE asleep, so
 * a tap with nothing typed can say why nothing happened.
 */
function SavePill({
  label,
  asleep,
  bottom,
  onPress,
}: {
  label: string;
  asleep: boolean;
  bottom: number;
  onPress: () => void;
}) {
  const wake = useRef(new Animated.Value(asleep ? 0 : 1)).current;
  const fade = useRef(new Animated.Value(asleep ? 0.5 : 1)).current;
  const press = usePressScale(0.94);
  useEffect(() => {
    Animated.parallel([
      Animated.timing(wake, {
        toValue: asleep ? 0 : 1,
        duration: 420,
        easing: curve(WAKE_SPRING),
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: asleep ? 0.5 : 1,
        duration: 300,
        easing: curve(motion.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [asleep, fade, wake]);

  const wakeScale = useMemo(
    () => wake.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }),
    [wake],
  );
  return (
    <Animated.View
      style={{
        position: 'absolute',
        right: 16,
        bottom,
        borderRadius: radius.pill,
        opacity: fade,
        transform: [{ scale: wakeScale }, ...press.style.transform],
      }}
    >
      <BubblePressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        radius="pill"
        bubbleColor={palette.onAcc}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: asleep }}
        style={{
          height: 60,
          paddingHorizontal: 24,
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: radius.pill,
          overflow: 'hidden',
        }}
      >
        <LinearGradient
          {...gradientFill()}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <SpecularEdge color={specularHeavy} radius={radius.pill} height={2} />
        <Icon name="check" size={20} color={palette.onAcc} />
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 17, marginLeft: 8, color: palette.onAcc }}
          className="font-semibold"
        >
          {label}
        </Text>
      </BubblePressable>
    </Animated.View>
  );
}

/**
 * One key. 62 tall, `card` glass, radius 20 — twelve panes sitting on the page
 * rather than twelve holes cut in it. Each RISES in on its own delay (22 ms a
 * key, reading order), so the pad arrives as a sweep rather than a slab.
 *
 * `flat`: twelve `BlurView`s in one grid is four times the budget this app gives
 * a whole screen, and a key is 62 dp of solid tint with a digit on it — there is
 * nothing behind it to see through. The tint and the specular edge are what make
 * it read as glass; the blur would only cost frames.
 */
function Key({
  value,
  delay,
  onPress,
}: {
  value: string | 'back';
  delay: number;
  onPress: () => void;
}) {
  const t = useT();
  const back = value === 'back';
  /* The design's lit `.` — the one key that is new, and the one that changes
     what the next two digits mean. */
  const point = value === '.';
  const press = usePressScale(0.92);
  return (
    <Stagger delay={delay} duration={420} rise={14} style={{ flex: 1 }}>
      <Animated.View
        style={{
          borderRadius: KEY_RADIUS,
          transform: press.style.transform,
        }}
      >
        <BubblePressable
          onPress={onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          radius={KEY_RADIUS}
          accessibilityRole="button"
          accessibilityLabel={
            back ? t('Delete the last digit') : point ? t('Decimal point') : value
          }
          style={({ pressed }) => ({
            height: KEY_HEIGHT,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: KEY_RADIUS,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: point ? glass.greenEdge : 'rgba(236,241,238,0.06)',
            // Under the finger it tints: the key being pressed is the one thing
            // on the pad that is currently the answer.
            backgroundColor: pressed ? tint(0.18) : point ? glass.green : 'rgba(236,241,238,0.055)',
          })}
        >
          <SpecularEdge color="rgba(236,241,238,0.10)" radius={KEY_RADIUS} />
          {back ? (
            <MaterialSymbol name="backspace" size={26} color={INK_SOFT} />
          ) : (
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ fontSize: 27 }}
              className={`font-medium tabular-nums ${point ? 'text-acc' : 'text-ink'}`}
            >
              {value}
            </Text>
          )}
        </BubblePressable>
      </Animated.View>
    </Stagger>
  );
}

/**
 * One category, as a 38 dp chip on the keypad: the glyph and the name. The one
 * this amount is in is LIT — c2 15 % fill, 36 % border, a glow, the name in acc
 * — rather than filled, so a light theme's c2 never has to carry ink.
 */
function CategoryChip({
  glyph,
  name,
  selected,
  onPress,
}: {
  glyph: string;
  name: string;
  selected: boolean;
  onPress: () => void;
}) {
  const press = usePressScale(0.92);
  return (
    <Animated.View style={{ transform: press.style.transform }}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={name}
        style={{
          height: 38,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: selected ? tint(0.36) : 'transparent',
          backgroundColor: selected ? tint(0.15) : 'rgba(236,241,238,0.035)',
        }}
      >
        <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 14.5 }}>
          {glyph}
        </Text>
        <Text
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          style={{ fontSize: 14.5, marginLeft: 6, maxWidth: 160 }}
          className={selected ? 'font-semibold text-acc' : 'font-medium text-ink-muted'}
        >
          {name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** One answered field, stated: 38 tall, ink on quiet glass, a chevron if it opens. */
function Chip({
  label,
  chevron = false,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  chevron?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <BubblePressable
      onPress={onPress}
      radius="pill"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={(state) => [
        pressedStyle(state),
        {
          height: 38,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          overflow: 'hidden',
          borderWidth: 1,
          backgroundColor: 'rgba(236,241,238,0.05)',
          borderColor: 'rgba(236,241,238,0.07)',
        },
      ]}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 14.5, maxWidth: 190 }}
        className="font-medium text-ink"
      >
        {label}
      </Text>
      {chevron ? (
        <View className="ml-[6px]">
          <Icon name="chevron-down" size={14} color={palette.inkMuted} />
        </View>
      ) : null}
    </BubblePressable>
  );
}

/**
 * FROM ⇄ TO, then the day — the transfer's answered fields.
 *
 * Kickered rows rather than bare chips, because which pocket is which is the
 * whole of what a transfer says and "Cash Online" in a row of chips does not
 * say it. The ⇄ swaps the ends: the common correction is the direction.
 */
function TransferFields({
  from,
  to,
  whenLabel,
  onPickFrom,
  onPickTo,
  onSwap,
  onEarlier,
  onLater,
}: {
  from: MoneyAccount | null;
  to: MoneyAccount | null;
  whenLabel: string;
  onPickFrom: () => void;
  onPickTo: () => void;
  onSwap: () => void;
  onEarlier: () => void;
  onLater: () => void;
}) {
  const t = useT();
  const end = (label: string, account: MoneyAccount | null, onPress: () => void) => (
    <View style={{ gap: 6 }}>
      <Text
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 12.5, letterSpacing: 1 }}
        className="font-semibold uppercase text-ink-muted"
      >
        {label}
      </Text>
      <Chip
        label={account ? `${account.glyph} ${account.name}` : '—'}
        chevron
        onPress={onPress}
        accessibilityLabel={label}
      />
    </View>
  );
  return (
    <View className="px-lg" style={{ marginTop: 14, gap: 12 }}>
      <View className="flex-row items-end" style={{ gap: 10 }}>
        {end(t('From'), from, onPickFrom)}
        <Pressable
          onPress={onSwap}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('Swap From and To')}
          style={pressedStyle}
          className="h-[38px] w-[38px] items-center justify-center rounded-pill"
        >
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 20 }} className="text-acc">
            ⇄
          </Text>
        </Pressable>
        {end(t('To'), to, onPickTo)}
      </View>
      <View className="flex-row">
        <StepperChip label={whenLabel} onEarlier={onEarlier} onLater={onLater} />
      </View>
      <Text className="text-label text-ink-faint">
        {t(
          'Counted as an expense from the first and an income into the second. Editing or deleting either half changes both.',
        )}
      </Text>
    </View>
  );
}

/**
 * A chip with a ‹ and a › built into it.
 *
 * The date is the one answered field whose correction is almost always "one
 * step back" — you are writing down yesterday's taxi — so a sheet listing days
 * would be three taps for the common case.
 *
 * The chevrons are 44 × 44 and DRAWN that size (U17), which makes the chip 44
 * tall where the chips around it are 38. They were 28 × 30 with a slop of 8,
 * legal on paper, but the slop reached outside the chip into the row's gaps,
 * and a hit test does not reliably follow a child past its parent's edge on
 * Android. A target that lies inside what it belongs to is one that works.
 */
function StepperChip({
  label,
  onEarlier,
  onLater,
}: {
  label: string;
  onEarlier: () => void;
  onLater: () => void;
}) {
  const t = useT();
  return (
    <View
      style={{
        height: 44,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radius.pill,
        borderWidth: 1,
        backgroundColor: 'rgba(236,241,238,0.03)',
        borderColor: 'rgba(236,241,238,0.05)',
      }}
    >
      <Pressable
        onPress={onEarlier}
        accessibilityRole="button"
        accessibilityLabel={t('Earlier')}
        style={pressedStyle}
        className="h-[44px] w-[44px] items-center justify-center"
      >
        <Icon name="chevron-left" size={14} color={palette.inkMuted} />
      </Pressable>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 14.5, maxWidth: 170, color: INK_SOFT }}
        className="tabular-nums"
      >
        {label}
      </Text>
      <Pressable
        onPress={onLater}
        accessibilityRole="button"
        accessibilityLabel={t('Later')}
        style={pressedStyle}
        className="h-[44px] w-[44px] items-center justify-center"
      >
        <Icon name="chevron-right" size={14} color={palette.inkMuted} />
      </Pressable>
    </View>
  );
}

/**
 * EXPENSE | INCOME — two fixed 80 dp halves and one gradient thumb that slides
 * between them (360 ms, a slight overshoot). Fixed widths so the thumb is a
 * translate on the native driver and never has to measure a word; the words'
 * colours follow it, `onAcc` on the gradient and muted off it.
 *
 * Each half is 38 tall — the height of every chip in the row it sits in — and
 * takes the track's 3 dp above and below as slop, so a press answers over 44
 * (U17). It was 30, the smallest target on the screen that writes money down.
 * Not 44 drawn: a 50 dp switch in a row of 38 dp chips would be the one thing
 * in the row that looks like it matters more. No slop sideways: the halves
 * touch, and the one between them is the one you meant.
 */
const SEGMENT_SLOP = slopInsets(38, TOUCH_MIN, { left: 0, right: 0 });

function DirectionSwitch({
  value,
  onChange,
  expenseLabel,
  incomeLabel,
  accessibilityLabel,
}: {
  value: Direction;
  onChange: (value: Direction) => void;
  expenseLabel: string;
  incomeLabel: string;
  accessibilityLabel: string;
}) {
  const options = [
    { value: 'expense' as const, label: expenseLabel },
    { value: 'income' as const, label: incomeLabel },
  ];
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        padding: 3,
        borderRadius: radius.pill,
        borderWidth: 1,
        backgroundColor: 'rgba(236,241,238,0.03)',
        borderColor: 'rgba(236,241,238,0.06)',
      }}
    >
      <SlidingThumb
        index={value === 'expense' ? 0 : 1}
        count={2}
        trackWidth={SEGMENT_WIDTH * 2 + 6}
        inset={3}
        duration={360}
        bezier={THUMB_SPRING}
        style={{ borderRadius: radius.pill, overflow: 'hidden' }}
      >
        <LinearGradient
          {...gradientFill()}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      </SlidingThumb>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              tap();
              onChange(option.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            hitSlop={SEGMENT_SLOP}
            style={pressedStyle}
            className="h-[38px] items-center justify-center"
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{
                width: SEGMENT_WIDTH,
                textAlign: 'center',
                fontSize: 13.5,
                color: selected ? palette.onAcc : palette.inkMuted,
              }}
              className="font-semibold"
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Two halves in a 38-high pill — a `Segmented` at chip scale, for `A day` /
 * `Whole month`.
 *
 * It is not `primitives.Segmented` because that one is 44 high, full width and
 * has its own track: it is a control that owns a row. These sit in a wrapping
 * row of chips and have to be the same height as the things beside them, which
 * is the entire difference. The selected half is LIT (a c2 tint) rather than
 * filled: the gradient belongs to the direction switch beside it, and two
 * gradient thumbs side by side would be two answers shouting at once.
 */
function MiniSegmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{
        height: 38,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 3,
        borderRadius: radius.pill,
        borderWidth: 1,
        backgroundColor: 'rgba(236,241,238,0.03)',
        borderColor: 'rgba(236,241,238,0.06)',
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <BubblePressable
            key={option.value}
            onPress={() => {
              tap();
              onChange(option.value);
            }}
            radius="pill"
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={(state) => [
              pressedStyle(state),
              {
                height: 30,
                paddingHorizontal: 12,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.pill,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: selected ? tint(0.34) : 'transparent',
                backgroundColor: selected ? tint(0.16) : 'transparent',
              },
            ]}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{ fontSize: 13.5 }}
              className={selected ? 'font-semibold text-acc' : 'font-semibold text-ink-muted'}
            >
              {option.label}
            </Text>
          </BubblePressable>
        );
      })}
    </View>
  );
}

/**
 * One row in a picker sheet: the glyph, the name, and a ✓ on the one in force.
 *
 * `h-row-lg` and a tick rather than a filled pill, because this is a LIST being
 * chosen from rather than a row of switches — the same shape the interval picker
 * on the money screen uses, so the two sheets are recognisably one object.
 */
function PickRow({
  glyph,
  name,
  selected,
  onPress,
}: {
  glyph: string;
  name: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={name}
      style={pressedStyle}
      className="h-row-lg flex-row items-center px-lg"
    >
      <Text className="mr-md text-title">{glyph}</Text>
      <Text
        numberOfLines={1}
        className={`flex-1 text-body ${selected ? 'font-semibold text-ink' : 'text-ink-muted'}`}
      >
        {name}
      </Text>
      {selected ? <Icon name="check" size={18} color={palette.greenBright} /> : null}
    </Pressable>
  );
}
