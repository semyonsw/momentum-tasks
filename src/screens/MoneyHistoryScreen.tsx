/**
 * MoneyHistoryScreen — one day in full, then the two lines and the share.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹ EXPENSE HISTORY · CASH                     │
 *   │ ONE DAY AT A TIME                            │
 *   │ ‹        12 September 2026        ›          │
 *   │ 🚌 Transport                    400 AMD    › │
 *   │    taxi to the gym                           │
 *   │ 🧊 Food                       2,600 AMD    › │
 *   │    no note                                   │
 *   │ Spent 3,000 AMD · received 0 AMD             │
 *   │ EXPENSES OVER TIME                           │
 *   │ (Expenses)(Incomes)                          │
 *   │ (Week)(Month)(3 months)(Year)(All)           │
 *   │  ╱╲    ╱╲                                    │
 *   │ ╱  ╲__╱  ╲___                                │
 *   │ BALANCE OVER THE SAME RANGE                  │
 *   │ WHERE IT WENT                                │
 *   │ 🚌 Transport        10,300 AMD      36%      │
 *   └──────────────────────────────────────────────┘
 *
 * ── THE DAY LIST IS WHERE A NOTE FINALLY GETS READ ────────────────────────
 *
 * Every amount can carry a sentence saying what it was for, and for three
 * releases the only place one appeared was inside one category's own list, in
 * whatever window that screen had been opened with. So reading back a single
 * Tuesday — what did I actually spend this on — meant opening eight categories
 * and reassembling the day in your head, and the notes were in practice
 * write-only.
 *
 * The day list is that Tuesday, whole: every category, both directions, in the
 * order the amounts were written down, each with its note on a line of its own.
 * It is deliberately the FIRST thing on this screen and not a fourth chart,
 * because "what was that 2,600" is a question with an exact answer sitting in
 * the log, and everything below it is a shape rather than an answer.
 *
 * It does NOT follow the direction chips. Those pick which line is drawn; a day
 * is not a direction, and hiding the morning's income behind a chip meant for a
 * chart would make the day's own total unreadable against its rows.
 *
 * ── THE WINDOW AND THE RANGE ARE STILL TWO QUESTIONS ───────────────────────
 *
 * That argument has not changed and it is why this screen exists at all: the
 * expenses screen's `‹ September 2026 ›` is a FILTER — how much this month — and
 * everything here is a SERIES — is it going up. They were stacked on one screen,
 * which meant the answer to the second question was four scrolls under the answer
 * to the first, and the two controls sat close enough together to look like one
 * control that was behaving strangely.
 *
 * THE SUBSECTION IS NOT ONE OF THE TWO QUESTIONS. It came with the tap — these
 * are the lines for the chip the money screen was reading — because a chart
 * whose total disagrees with the screen it was opened from is a chart nobody can
 * use, and that is exactly what summing Cash and Online here would produce.
 *
 * So the filter stays on the section and the series moved behind the glyph, which
 * is the same glyph in the same corner as the training log's and the daily tasks'.
 * The direction chips come WITH it: which of expenses or incomes a line is drawn
 * from is a property of the line, and reaching back to the tiles on the previous
 * screen to change it would be the one control that stayed behind.
 *
 * ── DAY | CALENDAR (M4) | CATEGORIES ───────────────────────────────────────
 *
 * The header switch is the task history's (Month | Year | Trend): the same
 * place, the same control. `Calendar` is a month of spending — or of income,
 * by its own chips — as squares (`components/MoneyCalendar`), for the same
 * subsection, and its `Open this day` lands back on `Day` at the day tapped —
 * the day list is the one place a day's amounts are read in full, so the
 * calendar points at it rather than growing a second one.
 *
 * `Categories` is the hand-picked question: tick any categories, expense or
 * income, pick a period (the chart's presets or two days of your own) and read
 * what went out and came in, per category and amount by amount. Every rule is
 * `lib/moneyFilter.ts`; this draws it.
 *
 * The view and the filter are held ON THE ROUTE, like the day: a row of the
 * categories list opens the amount editor too, and coming back to the Day tab
 * with every tick reset would undo the question the user had just built. It
 * opens on `Day`, which is what the ⟲ has always opened.
 */

import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Pressable } from '../components/Pressable';
import { StatusBar } from 'expo-status-bar';

import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { SettingsFootRow } from '../components/SettingsFootRow';
import { WrappedHistoryFoot } from '../components/WrappedEntry';
import { InsightsDoor } from '../components/InsightsDoor';
import type { WrappedPeriod } from '../lib/wrapped';
import { TrendChart } from '../components/TrendChart';
import { pressedStyle } from '../components/motion';
import { MoneyCalendar } from '../components/MoneyCalendar';
import { DayPicker } from '../components/DayPicker';
import {
  GlassCard,
  Kicker,
  Segmented,
  SelectChip,
  Separator,
  TextButton,
} from '../components/primitives';
import { dayKey, formatLongDay, formatMonth, formatShortDay, shiftDay } from '../lib/days';
import { tap } from '../lib/feedback';
import {
  categoryShares,
  moneyBalanceSeries,
  moneyTrendSeries,
  summarizeMoneyTrend,
} from '../lib/moneyTrends';
import { TREND_RANGES, TREND_RANGE_LABELS, type TrendRange } from '../lib/trends';
import {
  amountsOnDay,
  describeCount,
  formatMoney,
  formatValue,
  inAccount,
  type Amount,
  type Direction,
  type MoneyAccount,
  type MoneyCategory,
} from '../lib/money';
import {
  defaultCustomPeriod,
  FILTER_PERIOD_KINDS,
  filterableCategories,
  filterAmounts,
  isTicked,
  periodBounds,
  summarizeFiltered,
  toggleTicks,
  type CategoryFilter,
} from '../lib/moneyFilter';
import { useMoney } from '../state/moneyStore';
import { moneyTone, palette } from '../theme/tokens';
import { noteFolds } from '../lib/noteFold';
import { useSettings } from '../state/settingsStore';
import { useMoneyScale } from '../hooks/useMoneyScale';
import { useLanguage, useT, type Translate } from '../hooks/useT';
import { plural, t as translate, type Language } from '../lib/i18n';
import type { ID } from '../types/models';

/*
 * A function rather than a constant, because the labels are translated: a
 * module-level array would be frozen in whichever language the app started in.
 */
function directions(t: Translate) {
  return [
    { value: 'expense' as const, label: t('Expenses') },
    { value: 'income' as const, label: t('Incomes') },
  ];
}

export type MoneyHistoryView = 'day' | 'calendar' | 'categories';

function views(t: Translate) {
  return [
    { value: 'day' as const, label: t('Day') },
    { value: 'calendar' as const, label: t('Calendar') },
    { value: 'categories' as const, label: t('Categories') },
  ];
}

export function MoneyHistoryScreen({
  account,
  day,
  onChangeDay,
  view,
  onChangeView,
  filter,
  onChangeFilter,
  onBack,
  onOpenAmount,
  onOpenSettings,
  onOpenWrapped,
  onOpenInsights,
}: {
  /** The subsection the ⟲ was tapped in. Every line here is drawn from it alone. */
  account: MoneyAccount;
  /**
   * The day the money screen was anchored on. Not `today`: stepping back three
   * days and then opening the history is a question about THOSE three days ago,
   * and landing on today would be the screen forgetting where the user was.
   */
  day: string;
  /**
   * The day list moved. HELD BY THE SHELL, on this screen's route, and not in a
   * `useState` here: a row opens the amount editor, which is a pushed route, and
   * a pushed route replaces this screen — so coming back re-mounted it and
   * re-seeded the day from the ⟲. You stepped to Tuesday, fixed a typo in
   * Tuesday's taxi, and landed back on the day you opened with.
   *
   * `view` moves the tab in the SAME route write: the calendar's `Open this day`
   * changes both, and two writes from one render would each start from the old
   * route, so the second would put the day back.
   */
  onChangeDay: (day: string, view?: MoneyHistoryView) => void;
  /** Day | Calendar | Categories — on the route, for the reason `day` is. */
  view: MoneyHistoryView;
  onChangeView: (view: MoneyHistoryView) => void;
  /** The categories view's ticks and period — on the route, the same way. */
  filter: CategoryFilter;
  onChangeFilter: (filter: CategoryFilter) => void;
  onBack: () => void;
  /** A row of the day list, opened in the editor it was written in. */
  onOpenAmount: (amountId: ID) => void;
  /** `Settings ›` at the foot: the finance settings (U24). */
  onOpenSettings?: () => void;
  /** X1: open a Wrapped. Absent = no Wrapped row at the foot. */
  onOpenWrapped?: (period: WrappedPeriod) => void;
  /** X2: Insights, at the foot under Wrapped. */
  onOpenInsights?: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const categories = useMoney((s) => s.categories);
  const all = useMoney((s) => s.amounts);
  const amounts = useMemo(() => inAccount(all, account.id), [all, account.id]);
  const currency = useSettings((s) => s.currencyCode);
  const scale = useMoneyScale();
  /*
   * Seeded from the setting, then the chips own it — the same rule the task
   * history follows. A range that wrote itself back would make "what this opens
   * on" and "what I am looking at" one fact, and then a glance at the year would
   * silently change tomorrow.
   */
  const opensOn = useSettings((s) => s.moneyTrendRange);
  const [range, setRange] = useState<TrendRange>(opensOn);
  const [direction, setDirection] = useState<Direction>(
    () => useSettings.getState().moneyDefaultDirection,
  );

  const today = dayKey(new Date());
  /*
   * Which day the list below is reading — the route's (see `onChangeDay`), and
   * never the chart's range: they answer different questions, and a day that
   * moved when the range chips were touched would be the one control on this
   * screen that did two things.
   */
  const dayRows = useMemo(() => amountsOnDay(amounts, day), [amounts, day]);
  const dayTotals = useMemo(
    () =>
      dayRows.reduce(
        (sums, row) => ({
          spent: sums.spent + (row.direction === 'expense' ? row.value : 0),
          received: sums.received + (row.direction === 'income' ? row.value : 0),
        }),
        { spent: 0, received: 0 },
      ),
    [dayRows],
  );
  const series = useMemo(
    () => moneyTrendSeries(amounts, direction, range, today, lang),
    [amounts, direction, lang, range, today],
  );
  const balanceLine = useMemo(
    () => moneyBalanceSeries(amounts, range, today, lang, account.opening),
    [account.opening, amounts, lang, range, today],
  );
  const trend = useMemo(() => summarizeMoneyTrend(series), [series]);
  const shares = useMemo(
    () => categoryShares(amounts, direction, range, today),
    [amounts, direction, range, today],
  );
  const namesById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category])),
    [categories],
  );

  const money = (value: number) => formatMoney(value, currency, scale);

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader
        kicker={`${t('Finance history')} · ${account.name}`}
        onBack={onBack}
        bordered={false}
      >
        <View className="mt-md">
          <Segmented
            options={views(t)}
            value={view}
            onChange={onChangeView}
            accessibilityLabel={t('The day, the calendar or the categories')}
          />
        </View>
      </ScreenHeader>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {view === 'calendar' ? (
          <MoneyCalendar
            amounts={all}
            accountId={account.id}
            categories={categories}
            currency={currency}
            scale={scale}
            today={today}
            day={day}
            onOpenDay={(picked) => {
              tap();
              onChangeDay(picked, 'day');
            }}
          />
        ) : view === 'categories' ? (
          <CategoriesView
            amounts={amounts}
            categories={categories}
            currency={currency}
            today={today}
            filter={filter}
            onChangeFilter={onChangeFilter}
            onOpenAmount={onOpenAmount}
          />
        ) : (
          <>
            <Kicker className="mx-lg mb-sm">{t('One day at a time')}</Kicker>

            {/* THE DAY. Both directions, every category, and the note on its own line —
            see the file header. The chevrons step ONE day, like the window picker
            on the money screen, so where a tap lands is never a surprise; `Today`
            is the way back from a walk into last month. */}
            <View className="mx-lg flex-row items-center">
              <Pressable
                onPress={() => {
                  tap();
                  onChangeDay(shiftDay(day, -1));
                }}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('The day before')}
                style={pressedStyle}
                className="h-hit w-[32px] items-center justify-center"
              >
                <Icon name="chevron-left" size={20} color={palette.inkMuted} />
              </Pressable>
              <Text className="flex-1 text-center text-body font-medium tabular-nums text-ink">
                {formatLongDay(day, lang)}
              </Text>
              <Pressable
                onPress={() => {
                  tap();
                  onChangeDay(shiftDay(day, 1));
                }}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('The day after')}
                style={pressedStyle}
                className="h-hit w-[32px] items-center justify-center"
              >
                <Icon name="chevron-right" size={20} color={palette.inkMuted} />
              </Pressable>
            </View>

            {dayRows.length > 0 ? (
              <>
                <GlassCard className="mx-lg mt-sm">
                  {dayRows.map((row, index) => (
                    <View key={row.id}>
                      {index > 0 ? <Separator /> : null}
                      <DayRow
                        amount={row}
                        category={namesById[row.categoryId] ?? null}
                        currency={currency}
                        onPress={() => onOpenAmount(row.id)}
                      />
                    </View>
                  ))}
                </GlassCard>
                <Text className="mx-lg mt-sm text-label tabular-nums text-ink-faint">
                  {t('Spent {spent} · received {received}', {
                    spent: money(dayTotals.spent),
                    received: money(dayTotals.received),
                  })}
                </Text>
              </>
            ) : (
              <Text className="mx-lg mt-sm text-label text-ink-faint">
                {t(
                  'Nothing recorded on this day. A whole-month amount is on no day at all, so it is not here either.',
                )}
              </Text>
            )}

            {day !== today ? (
              <View className="mx-lg">
                <TextButton
                  label={t('Today')}
                  onPress={() => {
                    tap();
                    onChangeDay(today);
                  }}
                />
              </View>
            ) : null}

            <Kicker className="mx-lg mb-sm mt-xxl">
              {direction === 'expense' ? t('Expenses over time') : t('Incomes over time')}
            </Kicker>
            <View className="mx-lg flex-row flex-wrap">
              {directions(t).map((option) => (
                <SelectChip
                  key={option.value}
                  label={option.label}
                  selected={option.value === direction}
                  onPress={() => {
                    tap();
                    setDirection(option.value);
                  }}
                />
              ))}
            </View>
            <View className="mx-lg flex-row flex-wrap">
              {TREND_RANGES.map((option) => (
                <SelectChip
                  key={option}
                  label={t(TREND_RANGE_LABELS[option])}
                  selected={option === range}
                  onPress={() => {
                    tap();
                    setRange(option);
                  }}
                />
              ))}
            </View>

            {/* A range with nothing in it is not a flat line at zero — it is a range
            with nothing in it, and the card says so. Every bucket is present by
            then (`lib/moneyTrends.ts` plots quiet days rather than skipping them),
            so the length alone would always be enough to draw. */}
            {series.length >= 2 && trend.total > 0 ? (
              <>
                <View className="mx-lg mt-md">
                  <TrendChart points={series} formatValue={(value) => formatValue(value, scale)} />
                </View>
                <Text className="mx-lg mt-sm text-label tabular-nums text-ink-faint">
                  {t('{total} over {count} {buckets} · about {average} each', {
                    total: money(trend.total),
                    count: trend.buckets,
                    buckets: bucketNoun(range, trend.buckets, lang),
                    average: money(trend.average),
                  })}
                  {trend.peak
                    ? ` · ${t('most on {label}, {value}', {
                        label: trend.peak.label,
                        value: money(trend.peak.value),
                      })}`
                    : ''}
                </Text>

                <Kicker className="mx-lg mb-sm mt-xl">{t('Balance over the same range')}</Kicker>
                <View className="mx-lg">
                  <TrendChart
                    points={balanceLine}
                    formatValue={(value) => formatValue(value, scale)}
                  />
                </View>
                <Text className="mx-lg mt-sm text-label text-ink-faint">
                  {t(
                    'Incomes less expenses, running. It starts from what you already had, so the left edge is where the range opened rather than zero.',
                  )}
                </Text>

                {shares.length > 0 ? (
                  <>
                    <Kicker className="mx-lg mb-sm mt-xl">{t('Where it went')}</Kicker>
                    <GlassCard className="mx-lg">
                      {shares.slice(0, 5).map((share, index) => (
                        <View key={share.categoryId}>
                          {index > 0 ? <Separator /> : null}
                          <ShareRow
                            glyph={namesById[share.categoryId]?.glyph ?? '•'}
                            name={namesById[share.categoryId]?.name ?? t('Archived')}
                            value={share.value}
                            percent={share.percent}
                            currency={currency}
                          />
                        </View>
                      ))}
                    </GlassCard>
                  </>
                ) : null}
              </>
            ) : (
              <GlassCard className="mx-lg mt-md p-lg">
                <Kicker>{t('Not enough yet')}</Kicker>
                <Text className="mt-sm text-body text-ink-muted">
                  {t('Nothing recorded in this range. Put something in and the line draws itself.')}
                </Text>
              </GlassCard>
            )}

            <Text className="mx-lg mt-md text-label text-ink-faint">
              {t(
                'Up to three months the line is one point a day; past that it is one a month. A whole-month amount has no day to sit on, so it only appears once the buckets are months.',
              )}
            </Text>
          </>
        )}

        {/* U24: the section's settings, where you notice one is wrong. */}
        {/* X1: last month's Wrapped, at any time (and the year's, in its window). */}
        {onOpenWrapped ? <WrappedHistoryFoot onOpen={onOpenWrapped} /> : null}
        {/* X2: patterns across the three logs, under the look back. */}
        {onOpenInsights ? <InsightsDoor onPress={onOpenInsights} /> : null}
        {onOpenSettings ? (
          <SettingsFootRow sectionLabel={t('Finance settings')} onPress={onOpenSettings} />
        ) : null}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */

function bucketNoun(range: TrendRange, count: number, lang: Language): string {
  /*
   * Spelled out rather than pluralised by appending an `s`, which is what this
   * did and which is wrong in the language this app now ships in: Russian has
   * three forms of a counted noun and none of them is the singular with a letter
   * on the end. `few` is the Russian-only form, so it is the Russian word.
   */
  const forms =
    range === 'year' || range === 'all'
      ? { one: translate('month', lang), few: 'месяца', many: translate('months', lang) }
      : { one: translate('day', lang), few: 'дня', many: translate('days', lang) };
  return plural(count, lang, forms);
}

/**
 * ONE AMOUNT, ON THE DAY IT WAS RECORDED — the glyph, the category, and the NOTE.
 *
 * The note is why this row exists. It was written at the till, it is the only
 * record of what the 2,600 actually was, and until now the single screen that
 * showed it was one category's own list in one window — so reading back a
 * Tuesday meant opening eight categories and reassembling it by hand.
 *
 * So the note is a LINE OF ITS OWN and not a tail on the meta line: it is a
 * sentence a person wrote, and truncating it to fit beside a date would hide
 * exactly the half that says why. ONE line of it while folded, because the note
 * field takes line breaks now and a ten-line list would turn one row into a
 * screen; a note that one line cannot hold (`lib/noteFold.ts`) wears a ⌄ that
 * unfolds the whole of it IN PLACE. In place, not in the editor: reading what
 * the 2,600 was is not the same intent as correcting it, and the row's own tap
 * still opens the editor.
 *
 * The amount is GREEN in and RED out (`moneyTone`), with the `+` kept on an
 * income so the direction survives a colour-blind reading. A transfer's two
 * halves stay ink: moving money between pockets is neither.
 *
 * A row with no note says `no note` in `ink-faint` rather than collapsing. An
 * amount nobody explained is a fact about that amount, and a list whose rows
 * changed height depending on it would be harder to scan than one that does not.
 */
function DayRow({
  amount,
  category,
  currency,
  dated = false,
  onPress,
}: {
  amount: Amount;
  /** Null once the category has been archived — the amount outlives it. */
  category: MoneyCategory | null;
  /** Passed down rather than read here: the lib formats, the screen decides. */
  currency: string;
  /**
   * Print the amount's day (or its month) above the note. The day list does not
   * need it — every row is that day — but the categories list spans weeks.
   */
  dated?: boolean;
  onPress: () => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const scale = useMoneyScale();
  const [open, setOpen] = useState(false);
  const note = amount.note.trim();
  const folds = noteFolds(note);
  const name = category?.name ?? t('Archived');
  const income = amount.direction === 'income';
  /* A transfer's half is money moved between your own pockets, not earned or
     spent, so it stays ink rather than wearing the green or the red. */
  const moved = amount.transferId !== undefined;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${income ? t('Income') : t('Expense')} ${formatMoney(amount.value, currency, scale)}. ${note === '' ? t('no note') : note}`}
      style={pressedStyle}
      className="justify-center px-lg py-md"
    >
      <View className="flex-row items-center">
        <Text className="mr-sm text-label">{category?.glyph ?? '•'}</Text>
        <Text numberOfLines={1} className="flex-1 text-body text-ink">
          {name}
        </Text>
        <Text
          className="ml-md text-body font-semibold tabular-nums"
          style={{ color: moved ? palette.ink : income ? moneyTone.income : moneyTone.expense }}
        >
          {income ? '+' : '−'}
          {formatMoney(amount.value, currency, scale)}
        </Text>
        <Icon name="chevron-right" size={16} color={palette.inkFaint} />
      </View>
      {dated ? (
        <Text className="ml-[22px] mt-[2px] text-label tabular-nums text-ink-faint">
          {amount.when.kind === 'day'
            ? formatShortDay(amount.when.date, lang)
            : `${formatMonth(amount.when.year, amount.when.month, lang)} · ${t('whole month')}`}
        </Text>
      ) : null}
      <View className="ml-[22px] mt-[2px] flex-row items-start">
        <Text
          numberOfLines={open ? undefined : 1}
          className={`flex-1 text-label ${note === '' ? 'text-ink-faint' : 'text-ink-muted'}`}
        >
          {note === '' ? t('no note') : note}
        </Text>
        {folds ? (
          <Pressable
            onPress={() => {
              tap();
              setOpen((was) => !was);
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={open ? t('Show less of the note') : t('Show the whole note')}
            style={pressedStyle}
            className="ml-sm h-[24px] w-[32px] items-center justify-center rounded-pill bg-surface-alt"
          >
            <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
              <Icon name="chevron-down" size={14} color={palette.inkMuted} />
            </View>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * WHERE IT WENT — the five categories with the most in them, each with a bar.
 *
 * The bar is the share of the range's total, so the five read as a division of
 * one thing rather than as five unrelated totals. Five and not all of them:
 * a list long enough to need scrolling stops being a shape.
 */
function ShareRow({
  glyph,
  name,
  value,
  percent,
  currency,
}: {
  glyph: string;
  name: string;
  value: number;
  percent: number;
  /** Passed down rather than read here: the lib formats, the screen decides. */
  currency: string;
}) {
  const scale = useMoneyScale();
  return (
    <View className="h-row-lg justify-center px-lg">
      <View className="flex-row items-center">
        <Text className="mr-sm text-label">{glyph}</Text>
        <Text numberOfLines={1} className="flex-1 text-body text-ink">
          {name}
        </Text>
        <Text className="ml-md text-body tabular-nums text-green-bright">
          {formatMoney(value, currency, scale)}
        </Text>
        <Text className="ml-sm w-[40px] text-right text-label tabular-nums text-ink-faint">
          {percent}%
        </Text>
      </View>
      <View className="mt-sm h-[4px] overflow-hidden rounded-pill bg-green-dim">
        <View
          className="h-[4px] rounded-pill bg-green-bright"
          style={{
            width: `${percent}%`,
            // The bar is the one place a share is a length rather than a number,
            // so it gets the glow: at 4px, a lit bar is legible where a flat one
            // is a hairline in the same colour as the track. Five of these in a
            // card, so it is the repeating value — see `theme/tokens.ts`.
          }}
        />
      </View>
    </View>
  );
}

/** How many amounts the categories list draws before asking to show more. */
const LIST_PAGE = 100;

/**
 * THE CATEGORIES VIEW — tick categories, pick a period, read the result.
 *
 * Top to bottom in the order the question is asked: WHEN (the chart's chips and
 * `Custom`), WHICH (a checkbox per category, expenses and incomes in two groups,
 * each group's header ticking or unticking all of it), then the ANSWER — out
 * and in apart, a line per category, and every amount, newest first, opening in
 * the editor like the day list's rows.
 *
 * The list draws a hundred at a time: `All time` with everything ticked is the
 * whole log, and a ScrollView of thousands of rows is a frozen screen.
 */
function CategoriesView({
  amounts,
  categories,
  currency,
  today,
  filter,
  onChangeFilter,
  onOpenAmount,
}: {
  /** This subsection's amounts — the lib does not filter by account. */
  amounts: readonly Amount[];
  categories: readonly MoneyCategory[];
  currency: string;
  today: string;
  filter: CategoryFilter;
  onChangeFilter: (filter: CategoryFilter) => void;
  onOpenAmount: (amountId: ID) => void;
}) {
  const t = useT();
  const lang = useLanguage();
  const scale = useMoneyScale();
  const [editing, setEditing] = useState<'from' | 'to' | null>(null);
  const [shown, setShown] = useState(LIST_PAGE);

  const groups = useMemo(() => filterableCategories(categories, amounts), [categories, amounts]);
  const every = useMemo(
    () => [...groups.expense, ...groups.income].map((category) => category.id),
    [groups],
  );
  const byId = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const { from, to } = useMemo(
    () => periodBounds(amounts, filter.period, today),
    [amounts, filter.period, today],
  );
  const rows = useMemo(
    () => filterAmounts(amounts, filter.selected, from, to),
    [amounts, filter.selected, from, to],
  );
  const summary = useMemo(() => summarizeFiltered(rows), [rows]);
  const money = (value: number) => formatMoney(value, currency, scale);
  const nothingTicked = filter.selected !== null && filter.selected.length === 0;

  const toggle = (ids: readonly ID[]) => {
    tap();
    setShown(LIST_PAGE);
    onChangeFilter({ ...filter, selected: toggleTicks(filter.selected, ids, every) });
  };
  const periodKind = filter.period.kind === 'custom' ? 'custom' : filter.period.range;

  return (
    <>
      <Kicker className="mx-lg mb-sm">{t('Period')}</Kicker>
      <View className="mx-lg flex-row flex-wrap">
        {FILTER_PERIOD_KINDS.map((option) => (
          <SelectChip
            key={option}
            label={option === 'custom' ? t('Custom') : t(TREND_RANGE_LABELS[option])}
            selected={option === periodKind}
            onPress={() => {
              tap();
              setShown(LIST_PAGE);
              setEditing(null);
              onChangeFilter({
                ...filter,
                period:
                  option === 'custom'
                    ? filter.period.kind === 'custom'
                      ? filter.period
                      : defaultCustomPeriod(today)
                    : { kind: 'range', range: option },
              });
            }}
          />
        ))}
      </View>

      {filter.period.kind === 'custom' ? (
        <GlassCard className="mx-lg mt-xs">
          {(['from', 'to'] as const).map((end, index) => {
            const period = filter.period as { kind: 'custom'; from: string; to: string };
            const value = period[end];
            return (
              <View key={end}>
                {index > 0 ? <Separator /> : null}
                <Pressable
                  onPress={() => {
                    tap();
                    setEditing((was) => (was === end ? null : end));
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: editing === end }}
                  accessibilityLabel={`${end === 'from' ? t('Starts') : t('Ends')} ${formatLongDay(value, lang)}`}
                  style={pressedStyle}
                  className="h-row-lg flex-row items-center px-lg"
                >
                  <Text className="w-[56px] text-label text-ink-muted">
                    {end === 'from' ? t('Starts') : t('Ends')}
                  </Text>
                  <Text className="flex-1 text-body font-medium tabular-nums text-ink">
                    {formatLongDay(value, lang)}
                  </Text>
                  <View style={{ transform: [{ rotate: editing === end ? '180deg' : '0deg' }] }}>
                    <Icon name="chevron-down" size={16} color={palette.inkMuted} />
                  </View>
                </Pressable>
                {editing === end ? (
                  <View className="px-md pb-md">
                    <DayPicker
                      value={value}
                      onChange={(picked) => {
                        setShown(LIST_PAGE);
                        setEditing(null);
                        onChangeFilter({ ...filter, period: { ...period, [end]: picked } });
                      }}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </GlassCard>
      ) : null}

      <Kicker className="mx-lg mb-sm mt-xl">{t('Categories')}</Kicker>
      {(['expense', 'income'] as const).map((direction) => {
        const group = groups[direction];
        if (group.length === 0) return null;
        const ids = group.map((category) => category.id);
        const on = ids.filter((id) => isTicked(filter.selected, id)).length;
        const label = direction === 'expense' ? t('Expenses') : t('Incomes');
        return (
          <GlassCard key={direction} className="mx-lg mb-md">
            <CheckRow
              label={label}
              state={on === ids.length ? 'on' : on === 0 ? 'off' : 'some'}
              strong
              trailing={`${on}/${ids.length}`}
              onPress={() => toggle(ids)}
            />
            {group.map((category) => (
              <View key={category.id}>
                <Separator />
                <CheckRow
                  label={`${category.glyph} ${category.name}${
                    category.archivedAt !== null ? ` · ${t('Archived')}` : ''
                  }`}
                  state={isTicked(filter.selected, category.id) ? 'on' : 'off'}
                  onPress={() => toggle([category.id])}
                />
              </View>
            ))}
          </GlassCard>
        );
      })}

      <Kicker className="mx-lg mb-sm mt-lg">
        {from === to
          ? formatLongDay(from, lang)
          : `${formatLongDay(from, lang)} – ${formatLongDay(to, lang)}`}
      </Kicker>
      {nothingTicked ? (
        <Text className="mx-lg text-label text-ink-faint">
          {t('Tick at least one category to see its amounts.')}
        </Text>
      ) : rows.length === 0 ? (
        <Text className="mx-lg text-label text-ink-faint">
          {t('Nothing in the ticked categories over this period.')}
        </Text>
      ) : (
        <>
          <GlassCard className="mx-lg flex-row px-lg py-md">
            <View className="flex-1">
              <Kicker>{t('Spent')}</Kicker>
              <Text
                className="mt-xs text-title font-semibold tabular-nums"
                style={{ color: moneyTone.expense }}
              >
                {money(summary.spent)}
              </Text>
            </View>
            <View className="flex-1">
              <Kicker>{t('Received')}</Kicker>
              <Text
                className="mt-xs text-title font-semibold tabular-nums"
                style={{ color: moneyTone.income }}
              >
                {money(summary.received)}
              </Text>
            </View>
          </GlassCard>

          <Kicker className="mx-lg mb-sm mt-xl">{t('By category')}</Kicker>
          <GlassCard className="mx-lg">
            {summary.byCategory.map((line, index) => {
              const category = byId.get(line.categoryId);
              const income = line.direction === 'income';
              return (
                <View key={line.categoryId}>
                  {index > 0 ? <Separator /> : null}
                  <View className="h-row-lg flex-row items-center px-lg">
                    <Text className="mr-sm text-label">{category?.glyph ?? '•'}</Text>
                    <View className="flex-1">
                      <Text numberOfLines={1} className="text-body text-ink">
                        {category?.name ?? t('Archived')}
                      </Text>
                      <Text className="text-label tabular-nums text-ink-faint">
                        {describeCount(line.count, lang)}
                      </Text>
                    </View>
                    <Text
                      className="ml-md text-body font-semibold tabular-nums"
                      style={{ color: income ? moneyTone.income : moneyTone.expense }}
                    >
                      {income ? '+' : '−'}
                      {money(line.total)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </GlassCard>

          <Kicker className="mx-lg mb-sm mt-xl">{describeCount(rows.length, lang)}</Kicker>
          <GlassCard className="mx-lg">
            {rows.slice(0, shown).map((row, index) => (
              <View key={row.id}>
                {index > 0 ? <Separator /> : null}
                <DayRow
                  amount={row}
                  category={byId.get(row.categoryId) ?? null}
                  currency={currency}
                  dated
                  onPress={() => onOpenAmount(row.id)}
                />
              </View>
            ))}
          </GlassCard>
          {rows.length > shown ? (
            <View className="mx-lg">
              <TextButton
                label={t('Show {n} more', { n: Math.min(LIST_PAGE, rows.length - shown) })}
                onPress={() => {
                  tap();
                  setShown((was) => was + LIST_PAGE);
                }}
              />
            </View>
          ) : null}
        </>
      )}

      <Text className="mx-lg mt-md text-label text-ink-faint">
        {t(
          'Transfers between your accounts are neither spending nor income, so they are not here. A whole-month amount counts only when the period covers its whole month.',
        )}
      </Text>
    </>
  );
}

/**
 * One checkbox row: the box, then the label. `some` is a group header with part
 * of its group ticked — a bar in the box, the mail-client convention — and a
 * tap on it ticks the rest (`toggleTicks`).
 */
function CheckRow({
  label,
  state,
  strong = false,
  trailing,
  onPress,
}: {
  label: string;
  state: 'on' | 'off' | 'some';
  /** A group header: the label in semibold. */
  strong?: boolean;
  /** Faint text at the right edge — the header's `3/7`. */
  trailing?: string;
  onPress: () => void;
}) {
  const filled = state !== 'off';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: state === 'some' ? 'mixed' : state === 'on' }}
      accessibilityLabel={label}
      style={pressedStyle}
      className="min-h-[48px] flex-row items-center px-lg"
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 7,
          borderWidth: 1.5,
          borderColor: filled ? palette.c2 : palette.inkFaint,
          backgroundColor: filled ? palette.c2 : 'transparent',
        }}
        className="items-center justify-center"
      >
        {state === 'on' ? <Icon name="check" size={14} color={palette.onAcc} /> : null}
        {state === 'some' ? <Icon name="minus" size={14} color={palette.onAcc} /> : null}
      </View>
      <Text
        numberOfLines={1}
        className={`ml-md flex-1 text-body text-ink ${strong ? 'font-semibold' : ''}`}
      >
        {label}
      </Text>
      {trailing ? (
        <Text className="ml-sm text-label tabular-nums text-ink-faint">{trailing}</Text>
      ) : null}
    </Pressable>
  );
}
