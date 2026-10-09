/**
 * Two languages, one catalogue, and the English string is the key.
 *
 *   t('Add task', 'ru')  →  'Добавить задачу'
 *   t('Add task', 'en')  →  'Add task'
 *   t('Whatever', 'ru')  →  'Whatever'        ← no entry, so the source survives
 *
 * ── WHY THE KEY IS THE ENGLISH SENTENCE AND NOT `tasks.add` ────────────────
 *
 * A symbolic key buys namespacing and costs the thing that matters here: a
 * missing entry renders as `tasks.add` on somebody's phone. With the sentence as
 * the key, a string nobody has translated yet renders in English — which is
 * ugly and true, rather than broken. That is the right failure mode for an app
 * whose translation arrives one screen at a time, and it is what made it safe to
 * wrap the screens in the order they are used rather than all at once.
 *
 * It also means the code still READS: `t('Nothing asked for today')` says what
 * will be on screen, so a reviewer does not have to hold a key table in their
 * head to know what a screen says.
 *
 * ── PLURALS ARE SPELLED OUT, NOT COMPUTED ─────────────────────────────────
 *
 * Russian has three plural forms (1 день, 2 дня, 5 дней) where English has two,
 * so a `count === 1 ? a : b` at the call site cannot be translated — the branch
 * itself is wrong in the target language. `plural(n, lang, forms)` takes all
 * three and picks by the language's own rule, and `RU_PLURAL` is that rule: the
 * standard one/few/many split every Slavic counter needs.
 *
 * ── INTERPOLATION ─────────────────────────────────────────────────────────
 *
 * `{name}` placeholders, filled from a plain object. Word ORDER differs between
 * the two languages and a concatenation at the call site freezes English order
 * into the layout — so anything with a value in the middle of it is one string
 * with a hole in it, not three strings glued together.
 *
 * Everything here is pure: no store, no React. `hooks/useT.ts` is the three
 * lines that subscribe a component to the setting.
 */

export type Language = 'ru' | 'en';

export const LANGUAGES: readonly Language[] = ['ru', 'en'];

/** What the toggle in the corner of Settings prints. Two letters, each own script. */
export const LANGUAGE_LABELS: Record<Language, string> = {
  ru: 'РУ',
  en: 'EN',
};

/** Spoken by a screen reader, in the language being offered. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  ru: 'Русский',
  en: 'English',
};

/** A language this build knows, or Russian — the default this app ships in. */
export function usableLanguage(value: unknown): Language {
  return LANGUAGES.includes(value as Language) ? (value as Language) : 'ru';
}

/**
 * The three Russian plural forms, picked by the standard rule.
 *
 *   1, 21, 31 …        → one    (день)
 *   2–4, 22–24 …       → few    (дня)
 *   0, 5–20, 25–30 …   → many   (дней)
 */
export function ruPluralForm(n: number): 'one' | 'few' | 'many' {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'many';
}

export interface PluralForms {
  one: string;
  few?: string;
  many: string;
}

/**
 * The right form of a counted noun, in either language.
 *
 * English reads `one` at exactly 1 and `many` otherwise; Russian reads all three.
 * `few` is optional so an English-shaped pair can be passed without inventing a
 * form the language does not have.
 */
export function plural(n: number, lang: Language, forms: PluralForms): string {
  if (lang !== 'ru') return Math.abs(n) === 1 ? forms.one : forms.many;
  const form = ruPluralForm(n);
  if (form === 'one') return forms.one;
  if (form === 'few') return forms.few ?? forms.many;
  return forms.many;
}

export type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}

/**
 * The one read path. English in, the user's language out.
 *
 * An unknown string comes back unchanged rather than throwing or rendering a
 * key — see the file header.
 */
export function t(key: string, lang: Language, vars?: Vars): string {
  if (lang === 'en') return fill(key, vars);
  return fill(RU[key] ?? key, vars);
}

/**
 * A word the app needs TWICE, in two senses.
 *
 * `Back` is the chevron in a header and it is the muscle group, and in Russian
 * those are `Назад` and `Спина` — two different words for one English string, so
 * the string alone cannot be the key. The namespace disambiguates
 * (`muscle:Back`), and the English half is unaffected: `en` returns the bare
 * word, and a Russian entry that does not exist falls through to the un-namespaced
 * catalogue and then to the word itself, so the fallback is still a real word and
 * never a key with a colon in it.
 */
export function term(namespace: string, word: string, lang: Language): string {
  if (lang === 'en') return word;
  return RU[`${namespace}:${word}`] ?? RU[word] ?? word;
}

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */
/* ------------------------------------------------------------------ */

/**
 * English → Russian. Grouped by where the string is read, not alphabetically,
 * because the thing you want when you are translating is every string on one
 * screen at once.
 */
const RU: Record<string, string> = {
  /* --- the tab bar and the section corners ------------------------- */
  Workout: 'Тренировка',
  Tasks: 'Задачи',
  Expenses: 'Расходы',
  Settings: 'Настройки',
  'Daily tasks': 'Ежедневные задачи',
  History: 'История',
  'Training history': 'История тренировок',
  'Task history': 'История задач',
  Routines: 'Программы',
  Language: 'Язык',
  'Application language': 'Язык приложения',

  /* --- the workout section ----------------------------------------- */
  'In progress': 'Идёт сейчас',
  'Back to the workout': 'Вернуться к тренировке',
  Sequence: 'Последовательность',
  Today: 'Сегодня',
  Tomorrow: 'Завтра',
  // The training history's three views. `Cal` is the English label's short form;
  // Russian has room for the word.
  Log: 'Журнал',
  Graphs: 'Графики',
  Cal: 'Календарь',
  'Other routines': 'Другие программы',
  'Start a workout': 'Начать тренировку',
  Recent: 'Недавние',
  'Nothing to open': 'Нечего открыть',
  '{exercises} exercises · {sets} sets': 'упражнений: {exercises} · подходов: {sets}',
  'Open {name}': 'Открыть «{name}»',
  'Deleted routine': 'Удалённая программа',
  'Edit the sequence.': 'Изменить последовательность.',
  'next up': 'следующая',
  'then {name}': 'затем {name}',
  'Show the sequence': 'Показать последовательность',
  'Hide the sequence': 'Скрыть последовательность',
  'Training sequence': 'Последовательность тренировок',
  'Off · no order set': 'Выкл · порядок не задан',
  On: 'Вкл',
  Off: 'Выкл',
  step: 'шаг',
  steps: 'шагов',
  min: 'мин',
  sets: 'подходов',
  exercises: 'упражнений',
  'New routine': 'Новая программа',
  'Edit routine': 'Изменить программу',
  'Routine name': 'Название программы',
  Save: 'Сохранить',
  Cancel: 'Отмена',
  Drop: 'Отпустить',
  Back: 'Назад',
  'Add routine': 'Добавить программу',
  'Add exercise': 'Добавить упражнение',
  'Delete routine': 'Удалить программу',
  'The routine goes, and so do its steps in your training loop. Workouts you logged from it stay in your history.':
    'Программа удаляется вместе с её шагами в цикле тренировок. Тренировки, записанные по ней, остаются в истории.',
  Exercises: 'Упражнения',

  /* --- the dice ---------------------------------------------------- */
  'Random routine': 'Случайная программа',
  'Roll a random routine. Long press to choose what goes in it.':
    'Собрать случайную программу. Удержание — выбрать, из чего.',
  'Build a random routine': 'Собрать случайную программу',
  'Muscle groups': 'Группы мышц',
  'How many exercises': 'Сколько упражнений',
  'Sets each': 'Подходов в каждом',
  Roll: 'Собрать',
  'Rolling…': 'Собираем…',
  'There is nothing in the library for those groups yet.':
    'В базе пока нет упражнений для этих групп.',
  'Nothing to roll — the library is empty.': 'Нечего собирать — база упражнений пуста.',
  '{n} exercises to draw from': 'упражнений на выбор: {n}',
  "Each exercise's own number": 'Как задано у каждого упражнения',
  /* --- the library's two levels ------------------------------------ */
  /*
   * The clusters and the fourteen groups. Capitalised, because that is the shape
   * `clusterLabel` and `muscleLabel` hand over — the stored value is the
   * lower-case union member and stays English, since it is an identifier.
   */
  Push: 'Жим',
  Pull: 'Тяга',
  Legs: 'Ноги',
  Core: 'Пресс',
  Cardio: 'Кардио',
  Skill: 'Навык',
  'muscle:Chest': 'Грудь',
  // Namespaced, because `Back` is also the chevron in every header — see `term`.
  'muscle:Back': 'Спина',
  'muscle:Shoulders': 'Плечи',
  'muscle:Traps': 'Трапеции',
  'muscle:Neck': 'Шея',
  'muscle:Biceps': 'Бицепс',
  'muscle:Triceps': 'Трицепс',
  'muscle:Forearms': 'Предплечья',
  'muscle:Core': 'Пресс',
  'muscle:Quads': 'Квадрицепс',
  'muscle:Hamstrings': 'Бицепс бедра',
  'muscle:Glutes': 'Ягодицы',
  'muscle:Calves': 'Икры',
  'muscle:Cardio': 'Кардио',
  'muscle:Calisthenics': 'Калистеника',
  Unfiled: 'Без группы',
  Library: 'База',
  'New exercise': 'Новое упражнение',
  'Recently used': 'Недавние',
  'Search exercises, muscles, days': 'Поиск: упражнения, мышцы, дни',
  'Search exercises': 'Поиск упражнений',
  'Create “{name}”': 'Создать «{name}»',
  'Add exercise to {muscle}': 'Добавить упражнение — {muscle}',

  /* --- the daily tasks --------------------------------------------- */
  'Add task': 'Добавить задачу',
  'New task': 'Новая задача',
  'Edit task': 'Изменить задачу',
  'Task name': 'Название задачи',
  'What are you asking yourself to do?': 'Что вы просите себя сделать?',
  'Every day': 'Каждый день',
  'Chosen days': 'Выбранные дни',
  'Just once': 'Один раз',
  Never: 'Никогда',
  Once: 'Один раз',
  'A one-day task. It asks on that day and never again.':
    'Задача на один день. Спросит в этот день и больше никогда.',
  'Starts on': 'Начинается с',
  'Which day': 'В какой день',
  'The day it first asks. Days before it stay exactly as you left them.':
    'День, когда она спросит впервые. Более ранние дни останутся такими, как были.',
  'Give it a name.': 'Дайте ей название.',
  MAX: 'МАКС',
  'Reps to MAX': 'Повторения до МАКС',
  'Every set starts at 0 and counts up — nothing is prefilled':
    'Каждый подход начинается с 0 и считается вверх — ничего не подставляется',
  'Off — every set plans the rep target above':
    'Выкл — каждый подход планирует цель по повторениям выше',
  'Pick at least one day.': 'Выберите хотя бы один день.',
  'Nothing asked for today': 'На сегодня ничего не запланировано',
  'Nothing is scheduled for this day.': 'На этот день ничего не запланировано.',
  'Coming up': 'Впереди',
  '{done} of {total} done': 'сделано {done} из {total}',
  'Tap a circle to mark it done. Hold a row to skip today on purpose or pause the task.':
    'Нажмите на кружок, чтобы отметить. Удерживайте строку, чтобы осознанно пропустить день или поставить задачу на паузу.',
  'Add your first task': 'Добавьте первую задачу',
  "One circle per day. Tap it when it's done; the streak and the month build from there.":
    'Один кружок в день. Нажмите, когда сделано, — серия и месяц сложатся из этого.',
  'Skip today, on purpose': 'Пропустить сегодня — осознанно',
  "Keeps the streak and leaves today's count": 'Серия сохраняется, день не считается',
  'Skip this day, on purpose': 'Пропустить этот день — осознанно',
  "Keeps the streak and leaves the day's count": 'Серия сохраняется, день не считается',
  'Take the skip back': 'Отменить пропуск',
  'Back to not answered': 'Снова без ответа',
  Move: 'Переставить',
  'Slide it to a new place, then Drop': 'Ведите на новое место, затем «Отпустить»',
  'Open history': 'Открыть историю',
  'The month and the streak': 'Месяц и серия',
  'Skipped today, on purpose. The streak keeps.': 'Сегодня пропущено осознанно. Серия сохранена.',
  'Skipped on purpose. The streak keeps.': 'Пропущено осознанно. Серия сохранена.',
  'Hold for more: skip today, pause, move':
    'Удерживайте для действий: пропустить, пауза, переставить',
  'Hide the assistant card': 'Скрыть карточку ассистента',
  'The sparkle at the top stays the way in': 'Звёздочка вверху остаётся входом',
  'The day before': 'Предыдущий день',
  'The day after': 'Следующий день',
  'The month before': 'Предыдущий месяц',
  'The month after': 'Следующий месяц',
  Moving: 'Перемещение',
  'Slide to move it · position {at} of {of}': 'Ведите, чтобы переместить · место {at} из {of}',
  'Drop it here': 'Отпустить здесь',
  Done: 'Сделано',
  'Missed on purpose': 'Пропущено намеренно',
  'Not answered': 'Без ответа',
  'Tap to change.': 'Нажмите, чтобы изменить.',
  'Open the month.': 'Открыть месяц.',
  'Long press, then slide to reorder': 'Удержите и ведите, чтобы переставить',
  'missed on purpose': 'пропущено намеренно',
  auto: 'авто',
  'in a row': 'подряд',
  Streak: 'Серия',
  'This month': 'В этом месяце',
  'of {asked}': 'из {asked}',
  day: 'день',
  days: 'дней',
  Note: 'Заметка',
  'What happened that day': 'Что произошло в этот день',
  'Archive this task': 'Архивировать задачу',
  'It leaves the day list. Every day you already answered stays where it is.':
    'Она уйдёт из списка дня. Все уже отвеченные дни останутся на месте.',
  'Archive it': 'Архивировать',
  'Keep it': 'Оставить',
  since: 'с',

  /* --- reminders --------------------------------------------------- */
  'Remind me': 'Напоминать',
  'Remind me about this': 'Напоминать об этом',
  'At what time': 'Во сколько',
  'The phone will ask on the days this task asks.':
    'Телефон напомнит в те дни, когда задача спрашивает.',
  'Time to train': 'Пора тренироваться',
  'Workout reminder': 'Напоминание о тренировке',
  'Remind me to train': 'Напоминать о тренировке',
  'On which days': 'В какие дни',
  'A notification at the time you set, on the days you picked.':
    'Уведомление в заданное время, в выбранные дни.',
  Hours: 'Часы',
  Minutes: 'Минуты',
  'Notifications are switched off for this app, so nothing will arrive.':
    'Уведомления для приложения выключены, поэтому ничего не придёт.',
  Reminders: 'Напоминания',
  'Reminds at {time}': 'Напомнит в {time}',
  'Reminds at {time}, then every {interval}': 'Напомнит в {time}, затем каждые {interval}',
  'Remind again': 'Напомнить снова',
  '{hours} h': '{hours} ч',
  'Every {interval} after that, until you tick it off or the day ends.':
    'Затем каждые {interval}, пока не отметите задачу или не закончится день.',
  'Just the one notification.': 'Только одно уведомление.',
  'Still not done': 'Ещё не сделано',
  'A notification with this task, at the time you set.':
    'Уведомление с этой задачей в указанное время.',
  'That time has already passed today, so pick a later one.':
    'Это время сегодня уже прошло, выберите более позднее.',

  /* --- the session ------------------------------------------------- */
  'Start workout': 'Начать тренировку',
  'Stop and exit': 'Остановить и выйти',
  'Restart clock': 'Сбросить время',
  'Session options': 'Действия с тренировкой',
  'Stop and exit…': 'Остановить и выйти…',
  'Counts from now. Logged sets stay.': 'Отсчёт с этого момента. Записанные подходы останутся.',
  'Leaves without saving.': 'Выход без сохранения.',
  'Restart the clock?': 'Сбросить время?',
  'Restart it': 'Сбросить',
  'Remove it': 'Убрать',
  'Add an exercise': 'Добавить упражнение',
  'Stop and exit without saving?': 'Выйти без сохранения?',
  'Throw it away': 'Удалить',
  'Keep logging': 'Продолжить запись',
  'Full days': 'Полные дни',

  /* --- the expenses ------------------------------------------------ */
  Incomes: 'Доходы',
  'Time interval': 'Период',
  'Add expense': 'Добавить расход',
  'Add income': 'Добавить доход',
  'Add expense category': 'Добавить категорию расходов',
  'Add income category': 'Добавить категорию доходов',
  'No expense categories yet. Add one on the Expenses tab.':
    'Категорий расходов пока нет. Добавьте на вкладке «Расходы».',
  'No income categories yet. Add one on the Incomes tab.':
    'Категорий доходов пока нет. Добавьте на вкладке «Доходы».',
  'Pick a category first': 'Сначала выберите категорию',
  'Move money between subsections': 'Перевести деньги между разделами',
  Transfer: 'Перевод',
  transfer: 'перевод',
  From: 'Откуда',
  To: 'Куда',
  'Swap From and To': 'Поменять «Откуда» и «Куда»',
  'Pick two different subsections': 'Выберите два разных раздела',
  'Counted as an expense from the first and an income into the second. Editing or deleting either half changes both.':
    'Считается расходом из первого и доходом во второй. Изменение или удаление одной половины меняет обе.',
  '{from} → {to} · {amount} moved': '{from} → {to} · переведено {amount}',
  'Delete this transfer': 'Удалить этот перевод',
  'Delete this transfer?': 'Удалить этот перевод?',
  'Both halves go: the money returns to where it was moved from.':
    'Удаляются обе половины: деньги возвращаются туда, откуда были переведены.',
  Day: 'День',
  Week: 'Неделя',
  Month: 'Месяц',
  Year: 'Год',
  'All time': 'Всё время',
  'Tap to set what you actually have here': 'Нажмите, чтобы указать, сколько здесь на самом деле',
  '3 months': '3 месяца',
  'Change the time interval.': 'Сменить период.',
  year: 'год',
  'Everything recorded': 'Всё, что записано',
  'Add category': 'Добавить категорию',
  /* --- the subsections: where the money physically is ----------------
     `Cash` and `Online` themselves are NOT here: an account's name is user data
     the moment it can be renamed, exactly like a category's, and a catalogue
     entry for one would rename it back on every render. */
  Subsection: 'Раздел',
  'Add subsection': 'Добавить раздел',
  'Edit subsection': 'Изменить раздел',
  'Its name and its glyph': 'Название и значок',
  'Archive this subsection': 'Убрать этот раздел в архив',
  'It leaves the row. Everything recorded in it stays recorded.':
    'Он исчезнет из строки. Всё, что в нём записано, останется записанным.',
  'Long press to edit the subsection': 'Долгое нажатие — изменить раздел',
  'Set what you have here.': 'Указать, сколько здесь денег.',
  'What you have': 'Сколько у вас есть',
  'This sets the balance directly. Nothing is recorded as an income, and no month, category or chart moves.':
    'Баланс задаётся напрямую. Ничего не записывается как доход, и ни месяц, ни категория, ни график не меняются.',
  Add: 'Добавить',
  'The window before': 'Предыдущий период',
  'The window after': 'Следующий период',

  /* --- settings ---------------------------------------------------- */
  Sections: 'Разделы',
  'Workout settings': 'Настройки тренировок',
  'Daily tasks settings': 'Настройки ежедневных задач',
  Answering: 'Ответы',
  'Let the app tick what it knows': 'Разрешить приложению отмечать то, что оно знает',
  'Finishing a workout ticks the training task; recording an amount ticks the expense one':
    'Завершение тренировки отмечает задачу о зале; запись суммы — задачу о расходах',
  'History opens on': 'История открывается на',
  'Both rows are still ordinary tasks — you can tick them, skip them, and change what they say. This only means something else usually gets there first.':
    'Обе строки остаются обычными задачами — их можно отметить, пропустить и переименовать. Это лишь значит, что обычно кто-то другой успевает первым.',
  'Every task waits for you. Nothing in the app answers a row on its own, and marks already given stay exactly as they are.':
    'Каждая задача ждёт вас. Приложение ничего не отмечает само, а уже поставленные отметки остаются как есть.',
  'Which range the ⟲ in the corner of the daily tasks opens on. The chips on that screen still change it while you are reading.':
    'На каком диапазоне открывается ⟲ в углу ежедневных задач. Кнопки на том экране всё так же меняют его во время просмотра.',
  'Everything, in one file': 'Всё в одном файле',
  'Export everything': 'Выгрузить всё',
  'Replace everything from a file': 'Заменить всё из файла',
  /* --- the weekly review (X3) -------------------------------------- */
  'Last week · {range}': 'Прошлая неделя · {range}',
  'Dismiss weekly review': 'Скрыть итоги недели',
  Workouts: 'Тренировки',
  Spent: 'Потрачено',
  'Same as the week before.': 'Столько же, сколько неделей раньше.',
  'One more than the week before.': 'На одну больше, чем неделей раньше.',
  'One fewer than the week before.': 'На одну меньше, чем неделей раньше.',
  '{n} more than the week before.': 'На {n} больше, чем неделей раньше.',
  '{n} fewer than the week before.': 'На {n} меньше, чем неделей раньше.',
  point: 'пункт',
  points: 'пунктов',
  'Level with the week before.': 'Как и неделей раньше.',
  'Up {n} {points}.': 'Плюс {n} {points}.',
  'Down {n} {points}.': 'Минус {n} {points}.',
  '{name} slipped twice.': '{name}: дважды пропущено.',
  '{name} slipped {n} {times}.': '{name}: пропущено {n} {times}.',
  'All of it on {category}.': 'Всё — {category}.',
  '{category} was {percent}% of it.': '{category} — {percent}%.',
  'Export a spreadsheet (CSV)': 'Выгрузить таблицу (CSV)',
  'Export as a spreadsheet': 'Выгрузить таблицу',
  'Export amounts (CSV)': 'Выгрузить суммы (CSV)',
  'Export workouts (CSV)': 'Выгрузить тренировки (CSV)',
  'One row per amount, transfers included.': 'Строка на каждую сумму, переводы тоже.',
  'One row per set, warm-ups marked.': 'Строка на каждый подход, разминка отмечена.',
  'Saved {name} to {where}.': '{name} сохранён в {where}.',
  'A spreadsheet export is for reading a log in Excel or Google Sheets. It is not a backup and cannot be read back in — only the JSON file restores.':
    'Таблица нужна, чтобы открыть журнал в Excel или Google Таблицах. Это не резервная копия, и загрузить её обратно нельзя — восстанавливает только файл JSON.',
  'Reset every setting to its default': 'Сбросить все настройки',
  'Back up now': 'Сделать копию сейчас',
  'Last backup': 'Последняя копия',
  'Back up automatically': 'Копировать автоматически',

  /* --- workout settings -------------------------------------------- */
  Rest: 'Отдых',
  'Between sets': 'Между подходами',
  'Between exercises': 'Между упражнениями',
  'between sets': 'между подходами',
  'between exercises': 'между упражнениями',
  'Every set of every exercise. Setting it clears any exercise you have given a rest of its own.':
    'Каждый подход каждого упражнения. Изменение сбрасывает собственный отдых у всех упражнений.',
  'Start rest automatically': 'Запускать отдых автоматически',
  'Off: rest only runs when you start it': 'Выкл: отдых идёт, только когда вы его запустите',
  'Timer ± step': 'Шаг таймера ±',
  'The +15 on the rest and set-timer pills': 'Кнопка +15 на таймерах отдыха и подхода',
  'You rest {clock} {what}.': 'Вы отдыхаете {clock} {what}.',
  'You rest {clock} {what}. Use that as the setting.':
    'Вы отдыхаете {clock} {what}. Сделать это настройкой.',
  'Use it': 'Применить',
  'No rest': 'Без отдыха',
  'Straight to work': 'Сразу к делу',
  Silent: 'Без звука',
  '{seconds} s': '{seconds} с',
  'Timed sets': 'Подходы на время',
  'Get ready': 'Подготовка',
  'Counted in before a plank or a hang starts': 'Отсчёт перед планкой или висом',
  'Rep ladder': 'Лесенка повторов',
  'Make every exercise a rep ladder': 'Сделать лесенку повторов во всех упражнениях',
  'One max, {sets} sets — {ladder} at a max of 12':
    'Один максимум, подходов: {sets} — {ladder} при максимуме 12',
  'Every rep-counted exercise runs a ladder, and new ones start with it on. Switching this off takes back only the ladders it added — a max you set yourself, and any ladder that has earned a rep, stay exactly as they are.':
    'Каждое упражнение на повторы идёт лесенкой, и новые создаются с ней. Выключение уберёт только те лесенки, которые добавил этот переключатель: заданный вами максимум и лесенка, уже заработавшая повтор, останутся как есть.',
  'Switches the ladder on for every rep-counted exercise at once, seeded from each one’s target reps. Holds, rounds and distances are left alone — a ladder is a rep prescription.':
    'Включает лесенку сразу во всех упражнениях на повторы, отталкиваясь от их целевых повторов. Удержания, круги и дистанции не трогает — лесенка задаёт повторы.',
  Countdown: 'Обратный отсчёт',
  'Beep the last': 'Сигнал за',
  'Every countdown: rest, get ready, and a prescribed hold':
    'Любой отсчёт: отдых, подготовка и заданное удержание',
  Sound: 'Звук',
  Vibration: 'Вибрация',
  'Keep the screen on': 'Не гасить экран',
  'While a timer is running': 'Пока идёт таймер',
  'Notify when a timer ends': 'Уведомлять об окончании таймера',
  "How the beep reaches you when the app isn't open — a tick 5 s out, then the tone":
    'Как сигнал дойдёт, когда приложение закрыто: тик за 5 с, затем тон',
  'Test the beep': 'Проверить сигнал',
  'Test the countdown beep': 'Проверить сигнал отсчёта',
  'counting…': 'считаю…',
  '3 · 2 · 1 · go': '3 · 2 · 1 · пошли',
  Body: 'Тело',
  Bodyweight: 'Вес тела',
  'What makes push-ups, dips and assisted work countable':
    'То, что позволяет считать отжимания, брусья и работу с помощью',
  'Not set': 'Не задан',
  'Clear my bodyweight': 'Убрать мой вес',
  'Until this is set, a session of push-ups or dips reports no volume — the app will not guess what your body weighs. Nothing else reads it.':
    'Пока вес не задан, тренировка из отжиманий или брусьев не даёт объёма — приложение не станет его угадывать. Больше он нигде не используется.',
  'Read only when working out session volume. It is not logged, charted or compared to anything.':
    'Читается только при расчёте объёма тренировки. Он не записывается, не строит график и ни с чем не сравнивается.',
  Gym: 'Зал',
  'Gym {n}': 'Зал {n}',
  Plates: 'Блины',
  'Plates · this gym': 'Блины · этот зал',
  'Which plates this gym has, in kilograms. Only used to work out what goes on the bar; it never changes a weight you have typed.':
    'Какие блины есть в этом зале, в килограммах. Нужны только для расчёта набора на штанге и никогда не меняют введённый вами вес.',
  'Which plates your gym has, in kilograms. Only used to work out what goes on the bar; it never changes a weight you have typed.':
    'Какие блины есть в вашем зале, в килограммах. Нужны только для расчёта набора на штанге и никогда не меняют введённый вами вес.',
  '{count} sizes': 'размеров: {count}',
  'Remove {name}': 'Удалить «{name}»',
  'Add another gym': 'Добавить ещё зал',
  'A gym is a name and the plates on its rack — nothing else. Tap one to make it the current gym; the chips above then edit that gym’s plates.':
    'Зал — это название и блины на стойке, больше ничего. Нажмите на него, чтобы сделать текущим; кнопки выше тогда правят блины этого зала.',
  'Weekly sets': 'Подходов в неделю',
  '{count} sets': 'подходов: {count}',
  'Optional. Set one and the training history compares this window against it; leave it at “—” and the counts stay counts.':
    'Необязательно. Задайте цель — и история тренировок будет сравнивать период с ней; оставьте «—», и счётчики останутся просто счётчиками.',
  Units: 'Единицы',
  Kilograms: 'Килограммы',
  Pounds: 'Фунты',
  'Weight units': 'Единицы веса',
  'Display only. Every set is stored in kilograms, so switching can never change what your history says you lifted.':
    'Только отображение. Каждый подход хранится в килограммах, поэтому переключение не меняет того, что записано в истории.',
  'Workouts on disk': 'Тренировок на диске',
  'Cannot read the log': 'Не удалось прочитать журнал',
  '{onDisk} on disk · {loaded} loaded': 'на диске: {onDisk} · загружено: {loaded}',
  'Share workouts with Health Connect': 'Передавать тренировки в Health Connect',
  'On · start, end and name': 'Вкл · начало, конец и название',
  'Needs permission': 'Нужно разрешение',
  'Health Connect did not grant permission, so nothing will be shared.':
    'Health Connect не дал разрешения, поэтому ничего передаваться не будет.',
  'Delete all workout history': 'Удалить всю историю тренировок',
  'Delete all workout history?': 'Удалить всю историю тренировок?',
  'All {count} finished {workouts} go, and so do the sets in them — which is what the prefills and the overload suggestions read. This cannot be undone.':
    'Исчезнут все завершённые {workouts} ({count}) и подходы в них — именно их читают подстановки и подсказки о прогрессии. Отменить это нельзя.',
  'Delete everything': 'Удалить всё',
  'Keep my history': 'Оставить историю',
  workout: 'тренировка',
  workouts: 'тренировок',
  'Everything on this screen is about training. The daily tasks and the expenses have settings screens of their own, and the backup that carries all three is one row in the general section.':
    'Всё на этом экране — про тренировки. У ежедневных задач и расходов есть свои экраны настроек, а резервная копия, которая хранит всё сразу, — одна строка в общем разделе.',

  /* --- the workout, the library, the log and the sheets ------------ */
  'A day': 'День',
  'A line needs two sessions to have a direction. Log this exercise once more and it appears here.':
    'Линии нужны две тренировки, чтобы появилось направление. Запишите это упражнение ещё раз — и график появится здесь.',
  'A single day, or a whole month': 'Один день или целый месяц',
  'A weight cell renders on every set': 'В каждом подходе будет поле веса',
  'A whole month counts towards the month, the year and the balance, and towards no single day.':
    'Сумма за месяц идёт в месяц, в год и в баланс, но ни в один конкретный день.',
  'Abandon the hold without logging': 'Бросить удержание, не записывая',
  'Add a step': 'Добавить шаг',
  'Add an exercise to this workout': 'Добавить упражнение в тренировку',
  'Add at least one step to turn it on': 'Добавьте хотя бы один шаг, чтобы включить',
  'Add to this category': 'Добавить в эту категорию',
  'Add warm-up sets: {what}': 'Добавить разминочные подходы: {what}',
  'Add {name} to the sequence': 'Добавить «{name}» в последовательность',
  'Add {seconds} seconds': 'Добавить {seconds} с',
  'Add {unit}': 'Добавить {unit}',
  Added: 'С весом',
  'Adjust.': 'Изменить.',
  'All workouts': 'Все тренировки',
  'Amount in {currency}': 'Сумма в {currency}',
  'Archive this category': 'Архивировать категорию',
  'Archive “{name}”?': 'Архивировать «{name}»?',
  Archived: 'В архиве',
  'Archived, not deleted — its amounts stay in the month, the year and the balance.':
    'В архив, а не удалить — суммы остаются в месяце, в году и в балансе.',
  Assisted: 'С помощью',
  'Automatic backups will go to that folder from now on.':
    'Автоматические копии теперь будут сохраняться в эту папку.',
  'Backed up {name} to {folder} — {counts}.': 'Копия {name} сохранена в {folder} — {counts}.',
  'Backup every': 'Копировать каждые',
  'Balance over the same range': 'Баланс за тот же период',
  Best: 'Лучшее',
  Brutal: 'Жёстко',
  'Cancel the timer without logging': 'Отменить таймер без записи',
  'Cancel timer without logging': 'Отменить таймер без записи',
  Category: 'Категория',
  'Category glyph': 'Значок категории',
  'Category name': 'Название категории',
  Glyph: 'Значок',
  'Choose a backup folder': 'Выбрать папку для копий',
  Close: 'Закрыть',
  'Complete set': 'Отметить подход',
  'Correct a set.': 'Исправить подход.',
  'Correct the count, {count} {unit}': 'Исправить количество: {count} {unit}',
  'Correct the weight, {weight} {unit}': 'Исправить вес: {weight} {unit}',
  'Could not write to that folder. Pick it again to re-grant access.':
    'Не удалось записать в эту папку. Выберите её заново, чтобы выдать доступ.',
  "Couldn't open your log": 'Не удалось открыть журнал',
  'Count up': 'Отсчёт вверх',
  'Counted in': 'Считается в',
  'Counts down from {target} and logs the hold when it reaches zero.':
    'Отсчитывает от {target} и записывает удержание по нулю.',
  'Counts up until you stop it, and logs the time you held.':
    'Считает вверх, пока не остановите, и записывает продержанное время.',
  Create: 'Создать',
  Cue: 'Подсказка',
  Date: 'Дата',
  'Decrease {label}': 'Уменьшить «{label}»',
  'Delete it': 'Удалить',
  'Delete this amount': 'Удалить эту сумму',
  'Delete this amount?': 'Удалить эту сумму?',
  'Delete this workout': 'Удалить эту тренировку',
  'Delete {name}': 'Удалить «{name}»',
  'Delete “{title}”?': 'Удалить «{title}»?',
  'Discard the workout and restart': 'Сбросить тренировку и перезапустить',
  'Dismiss suggestion': 'Скрыть подсказку',
  'Distance per session': 'Дистанция за тренировку',
  'Done adjusting': 'Готово',
  'Done correcting': 'Готово',
  'Done editing': 'Готово',
  'Down to': 'Вниз до',
  'Duplicate this routine': 'Сделать копию программы',
  'Each one': 'Каждое',
  'Each round counts down from {target}, then logs itself.':
    'Каждый круг отсчитывает от {target} и записывается сам.',
  Earlier: 'Раньше',
  Easy: 'Легко',
  Edit: 'Изменить',
  'Edit exercise': 'Изменить упражнение',
  'Edit the exercises in {name}': 'Изменить упражнения в «{name}»',
  'Edit {name}: rest, defaults and targets':
    'Изменить «{name}»: отдых, значения по умолчанию и цели',
  'Edit {noun}': 'Изменить {noun}',
  'Elbows in, pause at the chest': 'Локти прижаты, пауза у груди',
  'Every duration, switch, target and default across all three sections goes back to how it shipped, and your bodyweight is cleared. Your exercises, routines, history, tasks and amounts are untouched.':
    'Все длительности, переключатели, цели и значения по умолчанию во всех трёх разделах вернутся к исходным, а вес тела будет очищен. Упражнения, программы, история, задачи и суммы останутся нетронутыми.',
  'Every other workout renumbers from this one — the ones before it count down, the ones after it count up. Set it once on any session and the whole log lines up, including the sessions you did before this app existed.':
    'Все остальные тренировки перенумеруются от этой: те, что раньше, идут вниз, те, что позже, — вверх. Задайте номер один раз на любой тренировке, и весь журнал выстроится, включая тренировки до появления приложения.',
  'Every set in this workout moves with it': 'Все подходы этой тренировки переедут вместе с ней',
  'Every setting is back to its default.': 'Все настройки вернулись к исходным.',
  'Every workout you have logged': 'Все записанные тренировки',
  'Every {days} days': 'Каждые {days} дн.',
  'Exercise name': 'Название упражнения',
  'Exercise since deleted': 'Упражнение удалено',
  Expense: 'Расход',
  'Expenses over time': 'Расходы по времени',
  External: 'Внешний',
  Finish: 'Завершить',
  'Finish a workout and it lands here — every set, with what you lifted and how long it took.':
    'Завершите тренировку — и она окажется здесь: каждый подход, вес и время.',
  'Finish a workout and the days you trained appear here.':
    'Завершите тренировку — и дни занятий появятся здесь.',
  'Finish and update the plan': 'Завершить и обновить план',
  'Finish this workout': 'Завершить эту тренировку',
  'Finish two workouts and both graphs draw themselves — reps and weight, session by session.':
    'Завершите две тренировки — и оба графика построятся сами: повторы и вес, тренировка за тренировкой.',
  'Finish workout': 'Завершить тренировку',
  'Finish workout?': 'Завершить тренировку?',
  'First pick is the primary — it decides which section this files under.':
    'Первый выбор — основной: он решает, в каком разделе окажется упражнение.',
  Focus: 'Фокус',
  "Follow the rest setting instead of this exercise's own":
    'Следовать настройке отдыха вместо собственной у упражнения',
  'Follow the setting instead': 'Следовать настройке',
  'Following your setting — it moves when you change it':
    'Следует вашей настройке — меняется вместе с ней',
  'Form cue': 'Подсказка по технике',
  'Give this step its own copy of {name}, so it can hold different exercises':
    'Дать этому шагу свою копию «{name}», чтобы в ней были другие упражнения',
  'Hold {seconds} seconds longer': 'Держать на {seconds} с дольше',
  Holds: 'Удержаний',
  'How did that go': 'Как прошло',
  'How far back the cluster counts reach': 'Насколько далеко назад считаются группы',
  'Import it': 'Загрузить',
  Income: 'Доход',
  'Incomes less expenses, running. It starts from what you already had, so the left edge is where the range opened rather than zero.':
    'Доходы минус расходы, нарастающим итогом. Отсчёт идёт от того, что уже было, поэтому левый край — начало периода, а не ноль.',
  'Incomes over time': 'Доходы по времени',
  'Increase {label}': 'Увеличить «{label}»',
  Increment: 'Шаг веса',
  'It comes out of this routine only. The exercise stays in your library with every set you have ever logged against it.':
    'Оно уйдёт только из этой программы. Упражнение останется в базе со всеми записанными подходами.',
  'It leaves the category, the month, the year and the balance. Nothing else changes.':
    'Сумма уйдёт из категории, из месяца, из года и из баланса. Больше ничего не изменится.',
  'It leaves the grid and the chips. Every amount in it stays in the month, the year and the balance.':
    'Категория уйдёт из сетки и из кнопок. Все её суммы останутся в месяце, в году и в балансе.',
  'Keep going': 'Продолжить',
  'Keep mine': 'Оставить свои',
  'Keep what I have': 'Оставить своё',
  'Keep {minutes} min': 'Оставить {minutes} мин',
  Ladder: 'Лесенка',
  'Ladder · max {max}': 'Лесенка · максимум {max}',
  Later: 'Позже',
  'Leave focus mode': 'Выйти из режима фокуса',
  'Lengthen {what} by {seconds} seconds': 'Увеличить «{what}» на {seconds} с',
  'Load mode': 'Тип нагрузки',
  'Long press for focus mode': 'Долгое нажатие — режим фокуса',
  'Make this a working set': 'Сделать рабочим подходом',
  Manual: 'Вручную',
  'Mark this set as a warm-up': 'Отметить как разминочный',
  'Meet every set and one rep is added, from the bottom up. {count} met sessions and the max becomes {max}.':
    'Выполните все подходы — и снизу добавится один повтор. Ещё {count} выполненных тренировок, и максимум станет {max}.',
  'Meet every set and the max becomes {max}.': 'Выполните все подходы — и максимум станет {max}.',
  Metres: 'Метры',
  'Money out, or money in': 'Деньги наружу или внутрь',
  'Move {name} down': 'Переместить «{name}» вниз',
  'Move {name} up': 'Переместить «{name}» вверх',
  Muscles: 'Мышцы',
  Name: 'Название',
  'Needs a folder': 'Нужна папка',
  'New best': 'Новый рекорд',
  'New {noun}': 'Новый {noun}',
  'No amounts yet': 'Пока нет сумм',
  'No completed sets yet.': 'Пока нет выполненных подходов.',
  'No file picked.': 'Файл не выбран.',
  'No folder picked, so nothing was saved.': 'Папка не выбрана, ничего не сохранено.',
  'No rest between them — rest comes after the pair': 'Между ними без отдыха — отдых после пары',
  'No weight cell renders at all': 'Поля веса не будет вовсе',
  None: 'Нет',
  'Not enough yet': 'Пока мало данных',
  'Nothing finished yet': 'Пока ничего не завершено',
  'Nothing recorded on this day. A whole-month amount is on no day at all, so it is not here either.':
    'В этот день ничего не записано. У суммы за целый месяц дня нет вовсе, поэтому здесь её тоже не будет.',
  'Nothing left to rest for': 'Отдыхать больше не за чем',
  'Nothing recorded in this range. Put something in and the line draws itself.':
    'За этот период ничего не записано. Внесите сумму — и линия построится сама.',
  'Off · no steps yet': 'Выкл · шагов пока нет',
  'Off — every set of this exercise plans the same number':
    'Выкл — во всех подходах этого упражнения одно и то же число',
  'Off — the plan is one number': 'Выкл — в плане одно число',
  'On the bar: {plates} kilograms': 'На штанге: {plates} кг',
  'One max, and every set derived from it — plus a rep every session you meet it':
    'Один максимум, и все подходы выводятся из него — плюс повтор за каждую выполненную тренировку',
  'Open focus mode on your next set': 'Открыть режим фокуса на следующем подходе',
  'Open the history for {name}': 'Открыть историю «{name}»',
  'Open {name} as a workout': 'Открыть «{name}» как тренировку',
  'Overload nudges': 'Подсказки о прогрессии',
  'Pause rest': 'Пауза отдыха',
  'Percent done, day by day': 'Процент выполнения по дням',
  'Pick at least one, or it lands in the library’s Unfiled section.':
    'Выберите хотя бы одну, иначе упражнение попадёт в раздел «Без группы».',
  'Remove exercise': 'Убрать упражнение',
  'Remove set': 'Убрать подход',
  'Remove this set from the workout': 'Убрать этот подход из тренировки',
  'Remove {name} from the sequence': 'Убрать «{name}» из последовательности',
  'Remove {name} from this routine': 'Убрать «{name}» из этой программы',
  'Remove {name} from this workout': 'Убрать «{name}» из этой тренировки',
  'Remove {unit}': 'Убрать {unit}',
  'Remove “{name}”?': 'Убрать «{name}»?',
  'Replace everything with this file?': 'Заменить всё этим файлом?',
  Reps: 'Повторы',
  'Reps per session': 'Повторов за тренировку',
  'Reps per workout': 'Повторов за тренировку',
  'Requires weight': 'Нужен вес',
  'Reset every setting?': 'Сбросить все настройки?',
  'Reset settings': 'Сбросить настройки',
  'Rest after every set, as normal': 'Отдых после каждого подхода, как обычно',
  'Rest between rounds': 'Отдых между кругами',
  'Rest between sets': 'Отдых между подходами',
  'Rest paused with {seconds} seconds left': 'Отдых на паузе, осталось {seconds} с',
  'Rest {clock}': 'Отдых {clock}',
  'Rest {what} {size} seconds longer': 'Отдых {what} на {size} с дольше',
  'Rest {what} {size} seconds shorter': 'Отдых {what} на {size} с короче',
  'Restored {counts}, and your settings.': 'Восстановлено: {counts}, а также настройки.',
  'Restored {counts}.': 'Восстановлено: {counts}.',
  'Resume rest': 'Продолжить отдых',
  Right: 'В самый раз',
  Rounds: 'Круги',
  'Same {held} for {days} days · {sessions} sessions':
    'Одно и то же ({held}) уже {days} дн · тренировок: {sessions}',
  'Saved {name} to {where} — {counts}.': '{name} сохранён в {where} — {counts}.',
  'Session complete': 'Тренировка завершена',
  Sessions: 'Тренировки',
  'Set inputs': 'Поля подхода',
  Sets: 'Подходы',
  'Sets per cluster': 'Подходов по группам',
  'Sets you already logged are saved. Try again first — discard the workout only if it crashes straight back to here.':
    'Записанные подходы сохранены. Сначала попробуйте ещё раз — сбрасывайте тренировку, только если сюда снова возвращает сразу.',
  'Shorten {what} by {seconds} seconds': 'Сократить «{what}» на {seconds} с',
  'Show all {count} sets.': 'Показать все подходы ({count}).',
  Skip: 'Пропустить',
  'Skip rest': 'Пропустить отдых',
  'Slide to move it · position {position} of {total}':
    'Ведите пальцем · позиция {position} из {total}',
  'Something broke': 'Что-то сломалось',
  Start: 'Начать',
  'Start a {clock} rest': 'Запустить отдых {clock}',
  'Start now': 'Начать сейчас',
  'Start now, skip the get-ready count': 'Начать сейчас, без подготовки',
  'Start the hold now, without the count-in': 'Начать удержание сейчас, без отсчёта',
  'Start the sequence over': 'Начать последовательность заново',
  'Start the {count} clock': 'Запустить таймер на {count}',
  'Start the {count} timer': 'Запустить таймер на {count}',
  Started: 'Начало',
  Ended: 'Конец',
  'Ended at {time}': 'Закончилась в {time}',
  'from {start} to {end}': 'с {start} до {end}',
  'Starting in {seconds}': 'Старт через {seconds}',
  'Starting in {seconds} seconds': 'Старт через {seconds} с',
  Stop: 'Стоп',
  'Stop and log {clock}': 'Остановить и записать {clock}',
  'Stop the clock and log what it read': 'Остановить таймер и записать показание',
  'Stop the timer and log this set': 'Остановить таймер и записать подход',
  'Suggests the next routine on the home screen':
    'Подсказывает следующую программу на главном экране',
  'Superset with the exercise above': 'Суперсет с упражнением выше',
  'Swipe down, or tap': 'Проведите вниз или нажмите',
  'Tap to close its sets': 'Нажмите, чтобы свернуть подходы',
  'Tap to close its sets. Long press, then slide to reorder':
    'Нажмите, чтобы свернуть подходы. Долгое нажатие и ведите, чтобы переставить',
  'The ladder is shaped to this many sets': 'Лесенка строится под это число подходов',
  'The ladder’s max is the only number this exercise needs — it derives every set.':
    'Максимум лесенки — единственное нужное число: из него выводится каждый подход.',
  'The only set — delete the workout': 'Единственный подход — удалить тренировку',
  'The order': 'Порядок',
  'The screen below this one crashed.': 'Экран под этим аварийно завершился.',
  'This cannot be undone.': 'Отменить это нельзя.',
  'This exercise only': 'Только это упражнение',
  'This movement, in every routine that has it': 'Это движение во всех программах, где оно есть',
  'This phone has {counts}, and all of it goes.':
    'На этом телефоне: {counts} — и всё это исчезнет.',
  'This workout reads {minutes} min. Restarting the clock makes it 0, and history will record it from this moment — the sets you already logged stay exactly as they are.':
    'Тренировка идёт {minutes} мин. Перезапуск обнулит таймер, и история будет считать её с этого момента — записанные подходы останутся как есть.',
  Time: 'Время',
  'Time per session': 'Время за тренировку',
  Timer: 'Таймер',
  Took: 'Длилась',
  'Top weight per session': 'Максимальный вес за тренировку',
  'Top working weight': 'Максимальный рабочий вес',
  Trend: 'Тренд',
  'Try again': 'Попробовать снова',
  'Try {count} {unit} at the same weight': 'Попробуйте {count} {unit} с тем же весом',
  'Try {what}': 'Попробуйте {what}',
  Type: 'Ввести',
  'Type an exact value': 'Ввести точное значение',
  'Undo set': 'Отменить подход',
  'Undo the last logged set': 'Отменить последний записанный подход',
  'Up to three months the line is one point a day; past that it is one a month. A whole-month amount has no day to sit on, so it only appears once the buckets are months.':
    'До трёх месяцев линия строится по дням, дальше — по месяцам. У суммы за месяц нет своего дня, поэтому она появляется, только когда деления — месяцы.',
  Use: 'Применить',
  'Spent {spent} · received {received}': 'Потрачено {spent} · получено {received}',
  'Use this sequence': 'Использовать последовательность',
  'Warm-up': 'Разминка',
  'Weight per workout': 'Вес за тренировку',
  'Weight {weight} {unit}': 'Вес {weight} {unit}',
  'What a routine plans for this exercise': 'Сколько программа планирует на это упражнение',
  'What amounts are counted in': 'В чём считаются суммы',
  'What it was for': 'На что',
  'Where it went': 'Куда ушло',
  'Which workout was this?': 'Какая это была тренировка?',
  'Whole month': 'Весь месяц',
  'Working set': 'Рабочий подход',
  'Workout name': 'Название тренировки',
  'Workout {number}': 'Тренировка {number}',
  'You type the number after the set. No clock runs.':
    'Число вводится после подхода. Таймер не идёт.',
  'Your workouts are still on disk — this is a failure to READ them, not a loss. Close the app and open it again. Settings states how many are down there, and “Export data” still works.':
    'Тренировки по-прежнему на диске: не удалось их ПРОЧИТАТЬ, они не потеряны. Закройте приложение и откройте снова. В настройках указано, сколько их там, и «Выгрузить всё» по-прежнему работает.',
  'added bodyweight': 'с весом тела',
  amount: 'сумма',
  amounts: 'сумм',
  assisted: 'с помощью',
  brutal: 'жёстко',
  'count up': 'отсчёт вверх',
  countdown: 'обратный отсчёт',
  'counting out loud · lands on a long tone': 'отсчёт вслух · заканчивается длинным тоном',
  'default {unit}': 'вес по умолчанию, {unit}',
  distance: 'дистанция',
  'distance + duration': 'дистанция + время',
  done: 'выполнено',
  missed: 'пропущено',
  unanswered: 'без ответа',
  duration: 'длительность',
  'duration only': 'только длительность',
  'each side': 'на каждую сторону',
  easy: 'легко',
  'edit exercises': 'изменить упражнения',
  'every set logged': 'все подходы записаны',
  exercise: 'упражнение',
  expense: 'расход',
  external: 'внешний',
  'get ready': 'подготовка',
  'hold · not running': 'удержание · не запущено',
  holding: 'держим',
  income: 'доход',
  'ladder reps': 'повторы лесенкой',
  'last session · {count} sessions plotted': 'последняя тренировка · точек на графике: {count}',
  'last set logged': 'последний подход записан',
  'last: {what}': 'прошлый раз: {what}',
  level: 'без изменений',
  'up {amount}': 'рост на {amount}',
  'down {amount}': 'снижение на {amount}',
  '{count} {matches}': '{matches}: {count}',
  match: 'совпадение',
  matches: 'совпадений',
  'As many as you can — set in the exercise, not in the plan':
    'Сколько сможете — задаётся в упражнении, а не в плане',
  'Miss one and nothing moves — the same numbers come back next time. Shown at {sets} sets, which is what the Sets row above plans; five is the scheme as it is written.':
    'Не выполнили один подход — ничего не меняется, в следующий раз те же числа. Показано для {sets} подходов — столько планирует строка «Подходы» выше; схема рассчитана на пять.',
  'logs itself at the bell': 'запишется само по сигналу',
  'make it different': 'сделать другой',
  max: 'максимум',
  'meet it and the max becomes {max}': 'выполните — и максимум станет {max}',
  metres: 'метры',
  month: 'месяц',
  months: 'месяцев',
  'most on {label}, {value}': 'больше всего {label}, {value}',
  next: 'следующая',
  'next exercise': 'следующее упражнение',
  'no note': 'без заметки',
  'no rest': 'без отдыха',
  'no target, no drain line, no bell': 'без цели, без полосы, без сигнала',
  'no workout': 'тренировок нет',
  'not started': 'не начата',
  'nothing left to rest for': 'отдыхать больше не за чем',
  'of {target}': 'из {target}',
  'part of a superset': 'часть суперсета',
  paused: 'пауза',
  reps: 'повторы',
  'reps only · duration · distance + duration':
    'только повторы · длительность · дистанция + длительность',
  rest: 'отдых',
  'rest {clock}': 'отдых {clock}',
  right: 'в самый раз',
  round: 'круг',
  'round length': 'длина круга',
  rounds: 'круги',
  routine: 'программа',
  routines: 'программ',
  'same weight for {days} days': 'тот же вес уже {days} дн',
  session: 'тренировка',
  sessions: 'тренировок',
  set: 'подход',
  'set {n} of {total}': 'подход {n} из {total}',
  setting: 'настройка',
  'skip the clock to finish the workout': 'пропустите таймер, чтобы завершить тренировку',
  'suggestion waiting': 'есть подсказка',
  'supersetted with the exercise above': 'в суперсете с упражнением выше',
  'target distance': 'целевая дистанция',
  'target reps': 'целевые повторы',
  'target time': 'целевое время',
  task: 'задача',
  tasks: 'задач',
  'this exercise': 'это упражнение',
  time: 'время',
  'top {weight} {unit}': 'максимум {weight} {unit}',
  'undo last set': 'отменить последний подход',
  'unit:kg': 'кг',
  'unit:m': 'м',
  'unit:min': 'мин',
  'unit:reps': 'повт',
  'unit:round': 'круг',
  'up next': 'далее',
  'warm-up': 'разминка',
  'weight + ladder': 'вес + лесенка',
  'weight + {noun}': 'вес + {noun}',
  'whole month': 'весь месяц',
  working: 'работа',
  'your next set is in here': 'ваш следующий подход здесь',
  '{clock} held': 'продержано {clock}',
  '{clock} left': 'осталось {clock}',
  '{count} met sessions to a max of {max}': 'ещё {count} выполненных тренировок до максимума {max}',
  '{count} rounds': 'кругов: {count}',
  '{count} set is': '{count} подход',
  '{count} sets are': 'подходов: {count}',
  '{count} sets logged in this workout will be thrown away, and nothing will reach your history. Use Finish instead if you want to keep them.':
    'Записанные в этой тренировке подходы ({count}) будут выброшены, и в историю ничего не попадёт. Нажмите «Завершить», если хотите их сохранить.',
  '{count} still unlogged. They won’t be saved.': '{count} ещё не записано. Они не сохранятся.',
  '{count} to hold': 'держать {count}',
  '{count} {amounts}': '{amounts}: {count}',
  '{count} {days}': '{days}: {count}',
  '{count} {days} trained': 'тренировок по дням: {count} {days}',
  '{count} {exercises}': '{exercises}: {count}',
  '{count} {noun}': '{noun}: {count}',
  '{count} {sessions}': '{sessions}: {count}',
  '{count} {sets} logged': 'записано: {count} {sets}',
  '{count} {steps}': '{steps}: {count}',
  '{count} {workouts}': '{workouts}: {count}',
  '{date} · {count} sets. This is the record of a workout you did — deleting it also removes those sets from what the overload suggestions read.':
    '{date} · подходов: {count}. Это запись о проведённой тренировке — удаление уберёт эти подходы и из того, что читают подсказки о прогрессии.',
  '{days} days': '{days} дн.',
  '{delta} since {date}': '{delta} с {date}',
  '{done} of {total} sets': 'подходов: {done} из {total}',
  '{file} holds {counts}.': 'В файле {file}: {counts}.',
  '{minutes} min': '{minutes} мин',
  '{minutes} minutes': '{minutes} мин',
  '{name}, next up': '{name}, следующая',
  '{name}, step {position}. Make it the next one up.': '{name}, шаг {position}. Сделать следующей.',
  '{name}, {done} of {total} sets done': '{name}, выполнено подходов: {done} из {total}',
  '{noun} only': 'только {noun}',
  '{seconds} sec': '{seconds} с',
  '{seconds} seconds held': 'продержано {seconds} с',
  '{seconds} seconds left': 'осталось {seconds} с',
  '{seconds} seconds of rest left': 'отдыха осталось {seconds} с',
  '{suggestion} — apply to every remaining set':
    '{suggestion} — применить ко всем оставшимся подходам',
  '{total} over {count} {buckets} · about {average} each':
    '{total} за {count} {buckets} · примерно {average} на каждый',
  '{total} sets planned · not started': 'запланировано подходов: {total} · не начата',
  '{weight} {unit} by': '{weight} {unit} на',
  '{what} total': 'всего {what}',

  /* --- 1.9.0: the strings the screens were still printing in English --- */
  adjust: 'изменить',
  '{name} (copy)': '{name} (копия)',
  '{name} (copy {n})': '{name} (копия {n})',
  Almost: 'Почти',
  '5 seconds left.': 'Осталось 5 секунд.',
  'Set logged — rest.': 'Подход записан — отдых.',
  'Get set': 'Приготовьтесь',
  'Rest ends in 5 seconds.': 'Отдых закончится через 5 секунд.',
  'Rest over': 'Отдых окончен',
  'Next set.': 'Следующий подход.',
  'Timer finished': 'Таймер закончился',
  'Rest is over, or a timed set rang its bell.': 'Отдых окончен или прозвенел подход на время.',
  'A tick {seconds} seconds before a timer ends.': 'Сигнал за {seconds} с до конца таймера.',
  'A task, or a workout, at the time you asked to be reminded.':
    'Задача или тренировка — в то время, о котором вы просили напомнить.',
  'Add to workout': 'Добавить в тренировку',
  'Add to that workout': 'Добавить в ту тренировку',
  'Show the log or the graphs': 'Показать журнал или графики',
  'It is in {count} {routines}, and will be removed from them.':
    'Входит в {count} {routines} — и будет оттуда удалено.',
  'It is not in any routine.': 'Не входит ни в одну программу.',
  'Sets you already logged stay in your history.': 'Записанные подходы останутся в истории.',
  'It is gone': 'Его больше нет',
  'This was deleted while you were looking at it.': 'Это удалили, пока вы на него смотрели.',
  Yesterday: 'Вчера',
  '{days} {daysWord} ago': '{days} {daysWord} назад',
  '{count} sessions at {weight} {unit} without a rep. One session at {suggested} {unit} resets it.':
    '{count} тренировок на {weight} {unit} без прибавки. Одна тренировка на {suggested} {unit} это сбросит.',
  'That is not valid JSON — the file or the paste is incomplete.':
    'Это не валидный JSON — файл или вставленный текст неполный.',
  'That file holds something other than a backup.': 'В этом файле не резервная копия.',
  'That backup was written by a newer version of the app (format {version}). Update the app first.':
    'Эта копия записана более новой версией приложения (формат {version}). Сначала обновите приложение.',
  'That file has no exercises, routines or workouts in it.':
    'В этом файле нет ни упражнений, ни программ, ни тренировок.',
  'That backup is empty — there is nothing in it to restore.':
    'Эта копия пуста — восстанавливать нечего.',
  'the folder you picked': 'выбранная папка',
  'This device has no writable app folder.': 'На этом устройстве нет папки для записи.',
  'Something went wrong reaching the file system.':
    'Что-то пошло не так при обращении к файловой системе.',
  'The log could not be read, so a backup would be missing it. Nothing is lost — close the app and open it again.':
    'Журнал не удалось прочитать, поэтому копия была бы неполной. Ничего не потеряно — закройте приложение и откройте снова.',
  Random: 'Случайная',
  '{weight} set': 'подход {weight}',
  '{name} did {done} {sets}, not {planned}': '{name}: {done} {sets}, а не {planned}',
  '{head}, and {count} {others} changed too': '{head}, и ещё {count} {others} изменилось',
  '{name} · new max {max} · {plan} next time': '{name} · новый максимум {max} · дальше {plan}',
  '{name} · {plan} next time': '{name} · дальше {plan}',
  '{head}, and {count} {others} moved up too': '{head}, и ещё {count} {others} поднялось',
  other: 'другое',
  others: 'других',
  'One day at a time': 'По одному дню',
  'One line, shown on the card while you are doing this exercise. A seat height, a pin number, the thing you keep forgetting.':
    'Одна строка, видна на карточке во время упражнения. Высота сиденья, номер фиксатора — то, что вы всё время забываете.',
  'Off · the ladder owns the reps': 'Выкл · повторения задаёт лестница',
  'Off · no load to add': 'Выкл · нечего добавлять к весу',
  'Reps, time and metres swap the same two wells:':
    'Повторения, время и метры меняют одни и те же два поля:',
  'Current maximum': 'Текущий максимум',
  'No workout in progress': 'Нет активной тренировки',
  'Nothing to log': 'Нечего записывать',
  'This workout has no exercises in it right now.': 'Сейчас в этой тренировке нет упражнений.',
  'Replace everything': 'Заменить всё',
  'makes this phone look like the file, so export first if there is anything here you would miss. A backup written by an older version carries no tasks and no amounts, and restoring one leaves both of those exactly where they are rather than emptying them. A workout in progress is not part of a backup: it carries a running clock.':
    'делает телефон таким, как файл, — поэтому сначала выгрузите то, что жалко потерять. В копии из старой версии нет ни задач, ни сумм, и восстановление такой копии оставит и то и другое как есть, а не очистит. Идущая тренировка в копию не входит: в ней работают часы.',
  'Reset every setting': 'Сбросить все настройки',
  'puts all three sections’ settings back to their defaults at once. It does not touch a single thing you have logged — not an exercise, not a routine, not an answered day, not an amount.':
    'разом возвращает настройки всех трёх разделов к исходным. Ничего из записанного это не трогает — ни упражнение, ни программу, ни отвеченный день, ни сумму.',
  'Add a set to {name}': 'Добавить подход — {name}',
  '+ Add a set': '+ Добавить подход',
  '+ Add an exercise': '+ Добавить упражнение',
  'Edit the name, date and length of {title}': 'Изменить название, дату и длительность — {title}',
  'Edit name, date and length': 'Изменить название, дату и длительность',
  'Change the number of workout {number}': 'Изменить номер тренировки {number}',
  'Set this workout’s number': 'Задать номер этой тренировки',
  'Workout number: {number}': 'Номер тренировки: {number}',
  'Set the workout number': 'Задать номер тренировки',
  'Delete the {title} workout': 'Удалить тренировку «{title}»',
  'A label, not a conversion. Every amount is stored as a plain number, so changing this changes what is printed after each figure and nothing else — no rate, no rewriting of what you already recorded. Up to four characters; points and tokens are as valid here as a currency.':
    'Это подпись, а не пересчёт. Каждая сумма хранится обычным числом, поэтому меняется только то, что печатается после цифры, — ни курса, ни переписывания записанного. До четырёх символов; баллы и токены здесь так же уместны, как валюта.',
  'Opens on': 'Открывается на',
  'The window and the direction the expenses section starts at. Both still change on that screen; this is only where it begins.':
    'Период и направление, с которых открывается раздел расходов. И то и другое по-прежнему меняется на самом экране; здесь — только начало.',
  'Which range the ⟲ in the corner of the expenses opens on.':
    'На каком диапазоне открывается ⟲ в углу расходов.',
  'There are no routines to put in a sequence yet. Make one in Routines, at the foot of the workout screen, first.':
    'Пока нет программ, которые можно поставить в последовательность. Сначала создайте программу в разделе «Программы», внизу экрана тренировки.',
  'Nothing recorded this month': 'В этом месяце ничего не записано',
  '{done} of {asked} done · {days} {dayWord}': '{done} из {asked} сделано · {days} {dayWord}',
  'The fuller the bubble, the more of that day was done. Tap one to open it and answer its tasks.':
    'Чем полнее кружок, тем больше сделано в тот день. Нажмите, чтобы открыть день и ответить на его задачи.',
  Less: 'Меньше',
  More: 'Больше',
  '{day}, nothing asked': '{day}, ничего не спрашивалось',
  '{day}, {done} of {asked}': '{day}, {done} из {asked}',
  '{from} to {to} · {done} of {asked} answered done':
    '{from} — {to} · отвечено «сделано»: {done} из {asked}',
  'A line needs two days to have a direction. Answer today and tomorrow and it draws itself.':
    'Чтобы у линии было направление, нужно два дня. Ответьте сегодня и завтра — и она нарисуется.',
  'Days that asked for nothing are left out rather than plotted as zero — a day off is not a day you failed. A task you marked missed on purpose leaves the denominator.':
    'Дни, в которые ничего не спрашивалось, не рисуются нулём, а просто выпадают — выходной это не провал. Задача, отмеченная как пропущенная намеренно, уходит из знаменателя.',
  'Max {max} · {total} reps · one rep is added every session you meet it':
    'Максимум {max} · {total} повт · по одному повторению за каждую выполненную тренировку',
  'Superset with the one above': 'Суперсет с упражнением выше',
  'Open its history': 'Открыть его историю',
  'Nothing in {window}.': 'Ничего за {window}.',
  '4 weeks': '4 недели',
  '12 weeks': '12 недель',
  All: 'Всё',
  'unit:rounds': 'кругов',
  'unit:sec': 'с',
  'My gym': 'Мой зал',
  'Morning Bible/Narek reading': 'Утреннее чтение Библии / Нарека',
  'In-Work Task Report': 'Отчёт по рабочим задачам',
  'Gym / Boxing': 'Зал / бокс',
  'Productivity/Day Tasks': 'Продуктивность / задачи дня',
  'Evening Bible reading': 'Вечернее чтение Библии',
  "Plan tomorrow's tasks": 'Запланировать задачи на завтра',
  'Book reading before sleep': 'Чтение книги перед сном',
  'Sleep before midnight': 'Лечь спать до полуночи',
  'Track expenses': 'Записать расходы',

  /* ── The Liquid Glass redesign's own strings ──────────────────────────
     The hero's nudge chip, the three counts under the day dial, the three
     doors at the top of Settings, and the keypad. */
  nudge: 'подсказка',
  nudges: 'подсказок',
  '{count} done': '{count} сделано',
  '{count} left': '{count} осталось',
  '{count} on purpose': '{count} намеренно',
  'streak kept': 'серия сохранена',
  'Rest, plates, weekly targets': 'Отдых, блины, недельные цели',
  'The automatic tick': 'Автоматическая отметка',
  'Automatic backups are off': 'Автокопии выключены',
  'Nothing you have logged is touched.': 'Ничего из записанного не трогается.',
  Amount: 'Сумма',
  'Type an amount first': 'Сначала введите сумму',
  'Delete the last digit': 'Удалить последнюю цифру',
  Saved: 'Сохранено',
  'Written down': 'Записано',

  /* ── The motion pass: session edit mode, the bubbles, the launch screen ── */
  'Editing plan': 'Редактирование плана',
  'Edit the plan of {name}': 'Изменить план: {name}',
  'Done editing the plan': 'Закончить редактирование плана',
  'Rest, targets and cue': 'Отдых, цели и подсказка',
  'Remove this set': 'Удалить этот подход',
  'Removed {name}': 'Удалено: {name}',
  'Removed a logged set from {name}': 'Удалён выполненный подход: {name}',
  'Removed a set': 'Подход удалён',
  'Discard your changes?': 'Отменить изменения?',
  'Discard changes?': 'Отменить изменения?',
  'This task hasn’t been saved.': 'Эта задача ещё не сохранена.',
  'Your changes to this task aren’t saved yet.': 'Изменения этой задачи ещё не сохранены.',
  'This routine goes back to how it was when you opened it.':
    'Программа вернётся к тому виду, в котором вы её открыли.',
  'Your edits to this exercise are not saved yet.': 'Изменения этого упражнения ещё не сохранены.',
  'Discard changes': 'Отменить изменения',
  'Keep editing': 'Продолжить',
  Undo: 'Отменить',
  'Kg moved': 'Кг поднято',
  'Save workout': 'Сохранить тренировку',
  'Workout {number} saved': 'Тренировка {number} сохранена',
  'Workout saved': 'Тренировка сохранена',
  'Could not save the workout. It is still here: try Finish again.':
    'Не удалось сохранить тренировку. Она на месте — нажмите «Завершить» ещё раз.',
  Resting: 'Отдых',
  resting: 'отдых',
  'Up next': 'Далее',
  'Up next, new machine': 'Далее, другой тренажёр',
  'new machine': 'другой тренажёр',
  'Back to the top': 'Наверх',
  'Back to the dial': 'Назад к циферблату',
  'Switch to this subsection': 'Перейти в этот раздел',
  '{category} · {amount} saved': '{category} · {amount} сохранено',
  'Back to {name}': 'Назад: {name}',
  'Loading your training log': 'Загрузка журнала тренировок',
  Loading: 'Загрузка',
  Open: 'Открыть',
  Last: 'Последняя',
  '{percent} percent': '{percent} процентов',
  account: 'раздел',
  accounts: 'разделов',
  'Train · tick · count': 'Тренируйся · отмечай · считай',

  /* ── The AI assistant ────────────────────────────────────────────────
     Settings → AI assistant, the key test, the three chats, the routine
     suggestions and their review screen. Gemini answers in the app's own
     language (`lib/ai/aiPrompts.ts`); these are the words around it. */
  AI: 'ИИ',
  'AI assistant': 'ИИ-помощник',
  'Open the AI assistant': 'Открыть ИИ-помощника',
  'Ask about your training': 'Спросите о тренировках',
  'Ask about your habits': 'Спросите о привычках',
  'Ask about your money': 'Спросите о деньгах',
  'Gemini · summaries, trends, suggestions': 'Gemini · сводки, динамика, советы',
  'Connect a Google AI key to start': 'Подключите ключ Google AI, чтобы начать',
  'Not connected': 'Не подключено',
  'Google Gemini · ready': 'Google Gemini · готов',
  'Key failed the test': 'Ключ не прошёл проверку',
  'Connect a Google AI key to use AI in your workouts.':
    'Подключите ключ Google AI, чтобы пользоваться ИИ в тренировках.',
  'Connect a Google AI key to use AI in your daily tasks.':
    'Подключите ключ Google AI, чтобы пользоваться ИИ в ежедневных задачах.',
  'Connect a Google AI key to use AI in your expenses.':
    'Подключите ключ Google AI, чтобы пользоваться ИИ в расходах.',
  Connected: 'Подключено',
  'tested {time}': 'проверено в {time}',
  '{s} s': '{s} с',
  Disconnect: 'Отключить',
  'Disconnect the AI?': 'Отключить ИИ?',
  'The key is removed from this phone. Your chats stay, and nothing in your log changes.':
    'Ключ будет удалён с телефона. Чаты останутся, а в ваших записях ничего не изменится.',
  Provider: 'Провайдер',
  soon: 'скоро',
  'API key': 'API-ключ',
  'A new key replaces the one in use': 'Новый ключ заменит текущий',
  'Clear the key': 'Очистить ключ',
  Paste: 'Вставить',
  'That key didn’t work.': 'Этот ключ не подошёл.',
  'Create one in Google AI Studio → Get API key. It is stored on this phone only and sent to nobody but Google.':
    'Создайте его в Google AI Studio → Get API key. Он хранится только на этом телефоне и не передаётся никому, кроме Google.',
  Model: 'Модель',
  'Fast · recommended': 'Быстрая · рекомендуется',
  'Asking Google which models this key can use…':
    'Спрашиваю у Google, какие модели доступны этому ключу…',
  'Changing the model is tested on your next question.':
    'Новая модель проверится на следующем вопросе.',
  'Connect a key to see every model it can use.':
    'Подключите ключ, чтобы увидеть все доступные ему модели.',
  'What it reads': 'Что он читает',
  'Only the section you ask from: your workouts, your tasks or your amounts, summarised on the phone first. Nothing is changed until you press Add or Apply.':
    'Только раздел, из которого вы спрашиваете: тренировки, задачи или суммы, — и сначала в виде сводки, собранной на телефоне. Ничего не меняется, пока вы не нажмёте «Добавить» или «Применить».',
  'Test & connect': 'Проверить и подключить',
  'Test again': 'Проверить снова',
  'Testing your key': 'Проверяю ключ',
  'Reaching Google': 'Связываюсь с Google',
  'Checking your key': 'Проверяю ключ',
  'Asking {model} to say hello': 'Прошу {model} поздороваться',
  'Gemini answered in {s} s': 'Gemini ответил за {s} с',
  'Your AI is ready.': 'ИИ готов.',
  'Workout, Tasks and Expenses each have their own chat now. Look for the sparkle in the corner.':
    'У тренировок, задач и расходов теперь свой чат. Ищите звёздочку в углу.',
  'Try it on your workouts': 'Попробовать на тренировках',
  'Open Tasks AI': 'Открыть ИИ задач',
  'Open Expenses AI': 'Открыть ИИ расходов',
  'Paste a Google AI key first.': 'Сначала вставьте ключ Google AI.',
  'Google keys start with "AIza". Check that the whole key was copied.':
    'Ключи Google начинаются с «AIza». Проверьте, что ключ скопирован целиком.',
  'This key cannot use {model}.': 'Этому ключу недоступна модель {model}.',
  'The key works but is over its quota right now.': 'Ключ рабочий, но сейчас его лимит исчерпан.',
  'Google said: {message}': 'Ответ Google: {message}',
  'Google refused the key.': 'Google отклонил ключ.',
  'Google had a problem answering. Try again in a minute.':
    'У Google не получилось ответить. Попробуйте через минуту.',
  'Google answered with error {status}.': 'Google ответил ошибкой {status}.',
  'Google took too long to answer. Try again.': 'Google слишком долго отвечал. Попробуйте ещё раз.',
  'Could not reach Google. Check your connection.':
    'Не удалось связаться с Google. Проверьте подключение.',
  'Gemini declined to answer that.': 'Gemini отказался отвечать на это.',
  'The answer came back in a shape I could not read. Try asking again.':
    'Ответ пришёл в виде, который не получилось прочитать. Спросите ещё раз.',
  'The key works, but this phone could not store it.':
    'Ключ рабочий, но телефон не смог его сохранить.',
  'Connect a Google AI key in Settings first.': 'Сначала подключите ключ Google AI в настройках.',
  'AI · Workout': 'ИИ · Тренировки',
  'AI · Daily tasks': 'ИИ · Ежедневные задачи',
  'AI · Expenses': 'ИИ · Расходы',
  'Gemini · reads your training log on this phone':
    'Gemini · читает журнал тренировок на этом телефоне',
  'Gemini · reads your task answers on this phone':
    'Gemini · читает ответы по задачам на этом телефоне',
  'Gemini · reads your amounts on this phone': 'Gemini · читает суммы на этом телефоне',
  'Answers come from your own log on this phone. Suggested routines and edits wait for your OK before anything changes.':
    'Ответы строятся по вашему журналу на этом телефоне. Предложенные программы и правки ждут вашего согласия — сами ничего не меняют.',
  'Reads your daily tasks and how each day was answered, including the days you excused on purpose.':
    'Читает ваши ежедневные задачи и ответы по каждому дню, включая дни, пропущенные намеренно.',
  'Reads your amounts by day and month, with categories. Whole-month amounts like rent are counted per month, never per day.':
    'Читает суммы по дням и месяцам, с категориями. Суммы на весь месяц, вроде аренды, считаются за месяц, а не за день.',
  'Ask about your workouts…': 'Спросите о тренировках…',
  'Ask about your tasks…': 'Спросите о задачах…',
  'Ask about your expenses…': 'Спросите о расходах…',
  'Reading {count} {noun}…': 'Читаю: {count} {noun}…',
  'Reading {count} {noun} of tasks…': 'Читаю задачи: {count} {noun}…',
  'Reading {count} {noun} of amounts…': 'Читаю суммы: {count} {noun}…',
  Send: 'Отправить',
  'Start a new chat': 'Начать новый чат',
  'Summarize my last 4 weeks': 'Подведи итоги последних 4 недель',
  'Last 4 weeks': 'Последние 4 недели',
  'How is my {lift} going?': 'Как продвигается «{lift}»?',
  '{lift} trend': 'Динамика: {lift}',
  'Suggest a new routine': 'Предложи новую программу',
  'Suggest a routine': 'Предложить программу',
  'Improve my {routine} routine': 'Улучши программу «{routine}»',
  'Improve {routine}': 'Улучшить «{routine}»',
  'How did {month} go?': 'Как прошёл {month}?',
  'Which habit slips most?': 'Какая привычка срывается чаще всего?',
  'What slips most?': 'Что срывается чаще?',
  'Suggest a better schedule': 'Предложи расписание получше',
  'Better schedule': 'Расписание получше',
  'Summarize the last 5 months': 'Подведи итоги последних 5 месяцев',
  'Last 5 months': 'Последние 5 месяцев',
  'Where did {month} go?': 'Куда ушёл {month}?',
  'Where can I cut back?': 'Где можно сэкономить?',
  'Where to cut back': 'Где сэкономить',
  summary: 'сводка',
  trend: 'динамика',
  new: 'новое',
  edit: 'правка',
  insight: 'вывод',
  plan: 'план',
  breakdown: 'разбор',
  changed: 'изменено',
  removed: 'убрано',
  'new to library': 'новое в базе',
  'Suggested routine': 'Предложенная программа',
  'Suggested edit · {name}': 'Предложенная правка · {name}',
  '{count} change': 'изменений: {count}',
  '{count} changes': 'изменений: {count}',
  Applied: 'Применено',
  Discarded: 'Отклонено',
  'Review & edit': 'Проверить и изменить',
  'Add to routines': 'Добавить в программы',
  'Apply changes': 'Применить изменения',
  Discard: 'Отклонить',
  'Added {name} to routines': '«{name}» добавлена в программы',
  'Updated {name}': '«{name}» обновлена',
  'Suggestion discarded': 'Предложение отклонено',
  'Nothing left to apply': 'Применять нечего',
  'AI suggestion': 'Предложение ИИ',
  'AI suggestion · new routine': 'Предложение ИИ · новая программа',
  'AI suggestion · edit': 'Предложение ИИ · правка',
  Why: 'Почему',
  'A weight here is where the exercise starts. Once it has been logged, each session opens on what you last lifted.':
    'Вес здесь — это стартовый вес упражнения. Когда оно уже записано, каждая тренировка начинается с того, что вы подняли в прошлый раз.',
  'was {value}': 'было {value}',
  Keep: 'Оставить',
  Kg: 'Кг',
  kg: 'кг',
  BW: 'СВ',
  'Less {label}': 'Меньше: {label}',
  'More {label}': 'Больше: {label}',
  // Notifications
  'Allow notifications': 'Разрешить уведомления',

  // After-workout questions (lib/debrief.ts, components/DebriefSheet.tsx)
  'How did the weights feel?': 'Как ощущались веса?',
  'Too light': 'Слишком легко',
  'A bit light': 'Легковато',
  'Just right': 'В самый раз',
  'A bit heavy': 'Тяжеловато',
  'Too heavy': 'Слишком тяжело',
  'How was your energy?': 'Как было с энергией?',
  Low: 'Мало сил',
  Normal: 'Нормально',
  High: 'Много сил',
  'Any pain or discomfort?': 'Была боль или дискомфорт?',
  Shoulder: 'Плечо',
  Elbow: 'Локоть',
  Wrist: 'Запястье',
  Neck: 'Шея',
  'Lower back': 'Поясница',
  Hip: 'Тазобедренный',
  Knee: 'Колено',
  'Somewhere else': 'Другое место',
  'Which exercise was the hardest?': 'Какое упражнение было самым тяжёлым?',
  'None stood out': 'Ничего особенного',
  'What should happen to this routine next time?': 'Что сделать с программой в следующий раз?',
  'Keep it as is': 'Оставить как есть',
  'Make it harder': 'Сделать тяжелее',
  'Make it easier': 'Сделать легче',
  'Swap some exercises': 'Заменить упражнения',
  'Make it shorter': 'Сделать короче',
  'Would you do this workout again?': 'Повторили бы эту тренировку?',
  Yes: 'Да',
  Maybe: 'Возможно',
  No: 'Нет',
  'Anything else the coach should know?': 'Что ещё стоит знать тренеру?',
  'After the workout': 'После тренировки',
  '{n} of {total}': '{n} из {total}',
  'Pick all that apply': 'Можно выбрать несколько',
  'Sleep, stress, what worked, what did not…': 'Сон, стресс, что получилось, что нет…',
  'Add a detail (optional)': 'Подробность (необязательно)',
  'Add a note': 'Добавить заметку',
  'Save answers': 'Сохранить ответы',
  Next: 'Далее',
  'Not this time': 'Не сейчас',
  'Thanks — noted': 'Спасибо, записано',
  'The assistant reads these answers whenever you ask about your training or a routine.':
    'Ассистент учитывает эти ответы, когда вы спрашиваете о тренировках или программе.',
  'Ask the assistant about it': 'Спросить ассистента',
  'How did my {routine} workout go, and should I change anything?':
    'Как прошла тренировка «{routine}» и стоит ли что-то изменить?',
  'How did my last workout go, and should I change anything?':
    'Как прошла последняя тренировка и стоит ли что-то изменить?',
  'How did {routine} go?': 'Как прошла «{routine}»?',
  'How did the workout go?': 'Как прошла тренировка?',
  '{answered} of {total} answered · pick up where you left off':
    'Отвечено {answered} из {total} · продолжить',
  '{total} quick questions for the assistant': 'Вопросов для ассистента: {total}',
  'Questions after a workout': 'Вопросы после тренировки',
  'A few taps on how it went, so the assistant knows more than the numbers':
    'Пара касаний о том, как всё прошло, — чтобы ассистент знал больше, чем цифры',

  'Google is busy — asking again…': 'Google занят — спрашиваю ещё раз…',
  'Gemini is overloaded right now. Try again in a minute.':
    'Gemini сейчас перегружен. Попробуйте через минуту.',

  'Past chats': 'Прошлые чаты',
  'Your AI chats and past chats travel with it too; the AI key never does.':
    'Чаты с ИИ и прошлые чаты тоже сохраняются в копии; ключ ИИ — никогда.',
  'Suggested training loop': 'Предложенный цикл тренировок',
  'Now: {loop}': 'Сейчас: {loop}',
  'Apply loop': 'Применить цикл',
  'Training loop updated': 'Цикл тренировок обновлён',
  'AI chat': 'чат с ИИ',
  'AI chats': 'чатов с ИИ',
  'No past chats yet.': 'Прошлых чатов пока нет.',
  '{count} messages': 'сообщений: {count}',
  'Delete chat': 'Удалить чат',
  'Past chats are kept on this phone and in your backups. Opening one puts the chat you have open now into this list.':
    'Прошлые чаты хранятся на этом телефоне и в резервных копиях. Если открыть один из них, текущий чат попадёт в этот список.',

  // Success popups
  'Export successful': 'Экспорт выполнен',
  'Import successful': 'Импорт выполнен',
  'Backup saved': 'Копия сохранена',

  // AI
  'The answer ran out of room before it finished. Try a narrower question.':
    'Ответ не поместился целиком. Попробуйте задать вопрос уже.',
  Finance: 'Финансы',
  'Finance settings': 'Настройки финансов',
  'Finance history': 'История финансов',
  'Tap to add an amount here. Long press or tap the arrow to open the category.':
    'Нажмите, чтобы добавить сумму. Долгое нажатие или стрелка — открыть категорию.',
  Appearance: 'Оформление',
  Presets: 'Готовые темы',
  Custom: 'Свой',
  'Pick your own three colours': 'Выберите свои три цвета',
  'The three colours tint the buttons, the rings, the lit cards and the light behind every section. The AI button keeps its own colours so it always stands out.':
    'Три цвета окрашивают кнопки, кольца, подсвеченные карточки и свет за каждым разделом. Кнопка ИИ сохраняет свои цвета, чтобы всегда выделяться.',
  'A backup is plain JSON, so you can read it, keep it anywhere, and move it to another phone. It holds all three sections — training, the daily tasks and the finance — and every setting.':
    'Копия — это обычный JSON: её можно прочитать, хранить где угодно и перенести на другой телефон. В ней все три раздела — тренировки, ежедневные задачи и финансы — и все настройки.',
  'Colour {n}': 'Цвет {n}',
  Hue: 'Оттенок',
  'Hex colour': 'Цвет в HEX',
  Apply: 'Применить',
  'Fintech Lime': 'Финтех лайм',
  Emerald: 'Изумруд',
  'Electric Violet': 'Электрик фиолет',
  'Aqua Tech': 'Аква тех',
  'Sunset Pulse': 'Закатный пульс',
  'Deep Sapphire': 'Глубокий сапфир',
  Aurora: 'Аврора',
  Ember: 'Уголь',
  'Default · money and growth': 'По умолчанию · деньги и рост',
  'The original green, plus teal': 'Прежний зелёный и бирюза',
  'Blue, violet, pink': 'Синий, фиолетовый, розовый',
  'The 2026 blue-green': 'Сине-зелёный 2026 года',
  'Workout energy': 'Энергия тренировки',
  'Calm and trust': 'Спокойствие и доверие',
  'Acid, cyan, violet': 'Кислотный, циан, фиолетовый',
  'Warm focus': 'Тёплый фокус',
  'On purpose': 'Намеренно',
  '4w': '4н',
  '12w': '12н',
  'Good morning': 'Доброе утро',
  'Good afternoon': 'Добрый день',
  'Good evening': 'Добрый вечер',
  'Good night': 'Доброй ночи',
  'Every task done': 'Все задачи выполнены',
  '{done} of {total} tasks done': '{done} из {total} задач выполнено',
  '{name} is in progress': '{name} — идёт тренировка',
  '{name} is up next': '{name} — следующая',
  'No routine yet': 'Программ пока нет',
  'No routines yet': 'Программ пока нет',
  'Make your first routine': 'Создайте первую программу',
  'It appears here, one tap from starting.': 'Она появится здесь — в одном касании от старта.',
  'Put some exercises in one of your routines and it shows up here, ready to open.':
    'Добавьте упражнения в одну из программ, и она появится здесь, готовая к запуску.',
  'Open routines': 'Открыть программы',
  'Finance · {account} · {spent} spent in {month}':
    'Финансы · {account} · потрачено {spent} за {month}',
  'Done: {name}': 'Выполнено: {name}',
  'Mark {name} done': 'Отметить «{name}» как выполненную',
  'Resume workout · {time}': 'Продолжить тренировку · {time}',
  'No accounts yet': 'Счетов пока нет',
  Theme: 'Тема',
  'last backup {age}': 'копия: {age}',
  Home: 'Главная',
  'Press back again to exit': 'Нажмите «назад» ещё раз, чтобы выйти',
  Repeats: 'Повтор',
  Weekdays: 'Будни',
  'Pick days': 'Выбрать дни',
  'Save task': 'Сохранить задачу',
  'Next: set {number}': 'Далее: подход {number}',
  'Next: warm-up': 'Далее: разминка',
  'Next: {name}': 'Далее: {name}',
  'All sets logged': 'Все подходы записаны',
  'Routines & exercises': 'Программы и упражнения',
  'Routines or exercises': 'Программы или упражнения',
  'Options for {name}': 'Действия для «{name}»',
  'Long press or tap the dots to edit the subsection':
    'Удерживайте или нажмите на точки, чтобы изменить раздел',
  'Random routine options': 'Настройки случайной программы',
  'Editing the library': 'Правка базы',
  'Can’t be undone': 'Нельзя отменить',
  'Chat deleted': 'Чат удалён',
  'Remove {name}?': 'Удалить «{name}»?',
  'Its plate list goes with it. Your workouts are untouched.':
    'Вместе с ним удалится список блинов. Тренировки не изменятся.',
  'Decimal point': 'Десятичная точка',
  'The keypad has a decimal key: amounts here are kept in cents.':
    'На клавиатуре есть десятичная точка: суммы хранятся в сотых долях.',
  'This log was started in whole units, so the keypad keeps its 000 key. Nothing already recorded is ever rescaled.':
    'Этот журнал начат в целых единицах, поэтому на клавиатуре остаётся клавиша 000. Уже записанные суммы никогда не пересчитываются.',
  'Up {delta} since {date}, to {latest}.': 'Плюс {delta} с {date}, до {latest}.',
  'Down {delta} since {date}, to {latest}.': 'Минус {delta} с {date}, до {latest}.',
  'Level since {date}, at {latest}.': 'Без изменений с {date}: {latest}.',
  'Estimated 1-rep max': 'Расчётный максимум на 1 повтор',
  'An estimate, from your best set each session.':
    'Это оценка по лучшему подходу каждой тренировки.',
  'e1RM = weight × (1 + reps / 30); a single counts as its own weight.':
    'e1RM = вес × (1 + повторы / 30); одиночный повтор считается своим весом.',
  'Your estimated 1-rep max is drawn here from your second session with a weighted set of reps.':
    'Со второй тренировки с подходом на повторы с весом здесь появится график расчётного максимума.',
  Records: 'Рекорды',
  'Best e1RM': 'Лучший e1RM',
  Heaviest: 'Самый тяжёлый',
  'Most reps': 'Больше всего повторов',
  Longest: 'Дольше всего',
  Furthest: 'Дальше всего',
  'Most rounds': 'Больше всего раундов',
  'the set: {set}': 'подход: {set}',
  'A record appears here when a session beats your best so far: the heaviest set, the most reps, or the best e1RM. Your first session sets the bar.':
    'Рекорд появится здесь, когда тренировка превзойдёт ваш лучший результат: самый тяжёлый подход, больше всего повторов или лучший e1RM. Первая тренировка задаёт планку.',
  // T3 · vacation mode
  'Pause for a while': 'Пауза на время',
  "Paused days don't count: no streak lost, no misses.":
    'Дни паузы не считаются: серия не прерывается, пропусков нет.',
  'Tap the first and last day.': 'Нажмите на первый и последний день.',
  'No days picked yet': 'Дни ещё не выбраны',
  'All tasks': 'Все задачи',
  'Tick the ones to pause': 'Отметьте, какие поставить на паузу',
  'Pause 1 day': 'Пауза на 1 день',
  'Pause {n} days': 'Пауза на {n} дн.',
  'Nothing to pause: those days are already answered.':
    'Ставить на паузу нечего: на эти дни уже есть ответ.',
  "Paused 1 day. It won't count.": 'Пауза на 1 день. Он не считается.',
  "Paused {n} days. They won't count.": 'Пауза на {n} дн. Эти дни не считаются.',
  'Pause for a vacation…': 'Пауза на отпуск…',
  'Pause for a while…': 'Пауза на время…',
  'Excuse a run of days, for every task or a few':
    'Освободить несколько дней — для всех задач или некоторых',
  Pausing: 'Пауза',
  'Excuse a run of days for every task, or a few: the streak walks over them and they leave the percentage. Days ahead are marked now and stay yours to tick.':
    'Освободите несколько дней для всех задач или некоторых: серия их перешагнёт, а в процент они не войдут. Будущие дни отмечаются сразу, и их всё равно можно отметить сделанными.',
  'Resumed. The days ahead are back on the list.': 'Пауза снята. Будущие дни снова в списке.',
  'Paused until {day}': 'Пауза до {day}',
  'Resume now': 'Снять паузу',
  '{n} excused': 'освобождено: {n}',
  '{n} paused': 'на паузе: {n}',
  '{day}, paused · not counted': '{day}, пауза · не считается',
  'Hatched days were paused: every task excused, and out of the count.':
    'Заштрихованные дни — пауза: все задачи освобождены, и в счёт они не входят.',
  // T4 · habit strength
  'Habit strength': 'Сила привычки',
  'Recent days weigh more than old ones. A skipped or paused day counts as neither.':
    'Недавние дни весят больше старых. Пропуск или пауза не считаются ни в плюс, ни в минус.',
  'Last 90 days': 'Последние 90 дней',
  today: 'сегодня',
  Strong: 'Крепкая',
  Steady: 'Устойчивая',
  Building: 'Растёт',
  Forming: 'Формируется',
  'Habit strength {n}%': 'Сила привычки {n}%',
  // T5 · year in pixels
  'Month, year or trend': 'Месяц, год или тренд',
  'Year in pixels': 'Год в пикселях',
  'The year before': 'Предыдущий год',
  'The year after': 'Следующий год',
  'Which tasks the year shows': 'Какие задачи показывает год',
  '{day} · not yet': '{day} · ещё не наступил',
  '{day} · excused · not counted': '{day} · освобождён · не считается',
  '{day} · paused · not counted': '{day} · пауза · не считается',
  '{day} · before this task started': '{day} · до начала задачи',
  '{day} · nothing asked': '{day} · ничего не было',
  '{day} · done': '{day} · сделано',
  '{day} · not answered yet': '{day} · ещё без ответа',
  '{day} · not done': '{day} · не сделано',
  '{day} · {done} of {asked} done': '{day} · {done} из {asked} сделано',
  'Tap any square to see that day.': 'Нажмите на квадрат, чтобы увидеть этот день.',
  'Open this day': 'Открыть день',
  '{year}: {done} of {asked} done. Tap a square to see that day.':
    '{year}: {done} из {asked} сделано. Нажмите на квадрат, чтобы увидеть день.',
  'One row a month, one square a day. Hatched days were excused and are out of the count; empty squares asked for nothing.':
    'Строка — месяц, квадрат — день. Заштрихованные дни освобождены и в счёт не входят; пустые квадраты — дни без задач.',
  // W6 · records this session
  'Records this session': 'Рекорды этой тренировки',
  'new best e1RM, {value}': 'новый лучший e1RM, {value}',
  'heaviest yet, {value}': 'самый большой вес, {value}',
  'most reps yet, {value}': 'больше всего повторов, {value}',
  'longest yet, {value}': 'дольше всего, {value}',
  'furthest yet, {value}': 'дальше всего, {value}',
  'most rounds yet, {value}': 'больше всего раундов, {value}',
  // X1 · wrapped
  'the year before': 'годом раньше',
  'the month before': 'месяцем раньше',
  and: 'и',
  t: 'т',
  d: 'дн.',
  car: 'машины',
  cars: 'машин',
  'task done': 'выполненная задача',
  'tasks done': 'выполненных задач',
  times: 'раз',
  card: 'карточка',
  cards: 'карточек',
  'About as heavy as a car.': 'Это примерно вес одной машины.',
  'About as heavy as {n} {cars}.': 'Это примерно вес {n} {cars}.',
  'Same as {before}.': 'Столько же, сколько {before}.',
  '{n} more than {before}.': 'На {n} больше, чем {before}.',
  '{n} fewer than {before}.': 'На {n} меньше, чем {before}.',
  'Your year': 'Ваш год',
  'Your month': 'Ваш месяц',
  'Tap the right side to step through.': 'Нажимайте справа, чтобы листать дальше.',
  Tonnage: 'Тоннаж',
  'Every working set. Warm-ups are left out.': 'Все рабочие подходы. Разминка не считается.',
  'Working sets with a known load. Warm-ups are left out.':
    'Рабочие подходы с известным весом. Разминка не считается.',
  'Workout {first} to workout {last}.': 'С тренировки {first} по тренировку {last}.',
  'Best record': 'Лучший рекорд',
  '{name} · {set} on {date}.': '{name} · {set}, {date}.',
  'e1RM is an estimate (Epley).': 'e1RM — оценка (по формуле Эпли).',
  'Longest streak': 'Самая длинная серия',
  'Counted on the days it was asked for.': 'Считаются только дни, когда задача была в плане.',
  'Top category': 'Главная категория',
  '{category} · all of it.': '{category} · всё целиком.',
  '{category} · {percent}% of everything that went out.': '{category} · {percent}% всех расходов.',
  'Whole-month amounts are counted in their month.': 'Суммы за весь месяц учтены в своём месяце.',
  'Expenses only. Transfers between accounts are not spending.':
    'Только расходы. Переводы между счетами — не траты.',
  'Busiest weekday': 'Самый активный день недели',
  '{percent}% of tasks done': '{percent}% задач выполнено',
  'Quietest for tasks: {weekday}, {percent}%.': 'Меньше всего задач: {weekday}, {percent}%.',
  Summary: 'Итог',
  'Tasks done': 'Задачи',
  'My year in numbers': 'Мой год в цифрах',
  'My month in numbers': 'Мой месяц в цифрах',
  '{period}, wrapped': '{period} в итогах',
  '{cards} · your year in numbers': '{cards} · ваш год в цифрах',
  '{cards} · your month in numbers': '{cards} · ваш месяц в цифрах',
  'Nothing to wrap up for this period.': 'За этот период подводить нечего.',
  'Tap right for next · left to go back': 'Справа — дальше · слева — назад',
  'no account · on my phone': 'без аккаунта · на моём телефоне',
  // M4 · money calendar
  Calendar: 'Календарь',
  'The day or the calendar': 'День или календарь',
  '{total} spent': 'Потрачено {total}',
  'Whole month · not on any day': 'За весь месяц · без привязки к дню',
  'Record an amount and its day fills in here, darker the more it cost.':
    'Запишите сумму — день закрасится, тем темнее, чем дороже.',
  'Tap a day for its amounts.': 'Нажмите на день, чтобы увидеть его суммы.',
  '{day} · nothing spent': '{day} · ничего не потрачено',
  'mostly {name}': 'в основном {name}',
  '{day}, {amount} spent': '{day}, потрачено {amount}',
  '{day}, nothing spent': '{day}, ничего не потрачено',
  'Expenses only: incomes, and transfers between your accounts, are not spending. The dearest day of the month is the darkest; every other day is shaded against it.':
    'Только расходы: доходы и переводы между счетами — это не траты. Самый дорогой день месяца — самый тёмный, остальные закрашены относительно него.',
  // W1 · RIR per set
  '{rir} in reserve · RPE {rpe}': '{rir} в запасе · RPE {rpe}',
  'Reps in reserve': 'Повторов в запасе',
  'Add reps in reserve': 'Указать повторы в запасе',
  'Opens the reps-in-reserve scale': 'Открывает шкалу повторов в запасе',
  'Set {n}': 'Подход {n}',
  Clear: 'Очистить',
  'How many more reps you could have done. The small number is the same answer as RPE.':
    'Сколько ещё повторов вы могли бы сделать. Маленькое число — тот же ответ по шкале RPE.',
  'A set at 0 or 0.5 was at the limit: it is not taken as a reason to add weight.':
    'Подход на 0 или 0.5 — на пределе: он не считается поводом добавить вес.',
  // W2 · set types (design copy set.type.*)
  'Drop set': 'Дроп-сет',
  'To failure': 'До отказа',
  AMRAP: 'Максимум повторов',
  'Set type': 'Тип',
  'Set {n}, {kind}': 'Подход {n}, {kind}',
  'Opens the set type and reps in reserve': 'Открывает тип подхода и повторы в запасе',
  'Drop, failure and AMRAP sets are working sets: they count as volume. A warm-up counts for nothing.':
    'Дроп-сет, до отказа и максимум повторов — рабочие подходы, они идут в объём. Разминка не считается.',
  // T1 · counted tasks (design copy editor.target)
  'A target, counted in parts': 'Цель по частям',
  'The circle fills by parts · +1 per tap': 'Круг заполняется по частям · +1 за нажатие',
  Target: 'Цель',
  unit: 'единица',
  Unit: 'Единица',
  glasses: 'стаканов',
  pages: 'страниц',
  minutes: 'минут',
  'e.g. km, push-ups, pages': 'например, км, отжиманий, страниц',
  '{count} {unit} a day': '{count} {unit} в день',
  '{n} of {count} {unit}': '{n} из {count} {unit}',
  'Tap to add one.': 'Нажмите, чтобы добавить одну.',
  'Tap to start again.': 'Нажмите, чтобы начать заново.',
  'Set a number': 'Указать число',
  'Set a number…': 'Указать число…',
  'Type how many, instead of a tap each': 'Ввести сколько, а не нажимать по одному',
  '{name} · the target is {count} {unit}': '{name} · цель — {count} {unit}',
  // T2 · N times a week (design copy editor.week)
  'A number of times per week': 'Несколько раз в неделю',
  'Any days you like · the streak counts weeks': 'В любые дни · серия считается неделями',
  'Times a week': 'Раз в неделю',
  'A day not done is not a miss; the week is what counts.':
    'Невыполненный день — не пропуск: считается неделя.',
  '{n} × a week': '{n} × в неделю',
  '{done} / {times} this week': '{done} / {times} на этой неделе',
  week: 'неделя',
  weeks: 'недель',
  wk: 'нед',
  'of {asked} weeks met': 'из {asked} недель',
  // T7 · habits to avoid (design copy editor.avoid)
  'Avoid this': 'Избегать',
  'A habit to not do · tap when you held off':
    'Привычка, которой не следовать · отметьте, если удержались',
  Avoided: 'Удалось избежать',
  avoided: 'удалось избежать',
  'avoid this': 'избегать',
  'Avoided: {name}': 'Удалось избежать: {name}',
  'Mark {name} avoided': 'Отметить: удалось избежать — {name}',
  // M1 · budgets (design copy budget.*)
  Budgets: 'Бюджеты',
  Budget: 'Бюджет',
  '{amount} over budget': '{amount} сверх бюджета',
  'ahead of the month': 'быстрее, чем идёт месяц',
  '{amount} left': 'осталось {amount}',
  '{percent}% of {amount}': '{percent}% от {amount}',
  '{month} · day {day} of {total}.': '{month} · день {day} из {total}.',
  'The tick on each bar is how much of the month has passed.':
    'Отметка на каждой полосе — сколько месяца уже прошло.',
  'No budget': 'Без бюджета',
  'Tap to set one': 'Нажмите, чтобы задать',
  'Opens the budget': 'Открывает бюджет',
  'Monthly budget': 'Бюджет на месяц',
  'Save budget': 'Сохранить бюджет',
  'Budget in {currency}': 'Бюджет в {currency}',
  'Less by {amount}': 'Меньше на {amount}',
  'More by {amount}': 'Больше на {amount}',
  'The ring on the tile turns coral only once the month goes past 100%.':
    'Кольцо на плитке становится коралловым, только когда месяц переходит за 100%.',
  'Set it to 0 to remove the budget.': 'Поставьте 0, чтобы убрать бюджет.',
  'Tell me at 80% and 100%': 'Сообщить при 80% и 100%',
  'One notification each, once a month. Off unless you turn it on.':
    'По одному уведомлению, раз в месяц. Выключено, пока вы не включите.',
  'Budgets count every subsection, so food bought by card is still food. Each month starts at its own figure: what is left over does not carry into the next.':
    'Бюджет считает все подразделы: еда, купленная картой, — всё равно еда. Каждый месяц начинается со своей суммы: остаток на следующий не переносится.',
  '{n} over': 'превышено: {n}',
  '{n} set': 'задано: {n}',
  'A monthly figure per category': 'Сумма на месяц для категории',
  '{name}: the budget is spent': '{name}: бюджет исчерпан',
  '{name}: 80% of the budget': '{name}: 80% бюджета',
  '{spent} of {limit} this month.': '{spent} из {limit} в этом месяце.',
  // M2 · recurring payments (design copy money.due*)
  'Monthly on the {day}': 'Ежемесячно, {day}',
  'Weekly on {weekday}': 'Еженедельно: {weekday}',
  'Yearly on {date}': 'Ежегодно, {date}',
  'Skip this month': 'Пропустить в этом месяце',
  'Skip this week': 'Пропустить на этой неделе',
  'Skip this year': 'Пропустить в этом году',
  'counts for {month}': 'за {month}',
  'Due today': 'Сегодня к оплате',
  'Due {date}': 'К оплате {date}',
  '{amount} a month': '{amount} в месяц',
  '{amount} a week': '{amount} в неделю',
  '{amount} a year': '{amount} в год',
  Weekly: 'Еженедельно',
  Monthly: 'Ежемесячно',
  Yearly: 'Ежегодно',
  Repeat: 'Повтор',
  Confirm: 'Подтвердить',
  'e.g. Rent': 'например, Аренда',
  'On day': 'В день',
  'In a shorter month, on its last day.': 'В коротком месяце — в его последний день.',
  'Counts for the whole month': 'За весь месяц',
  'Recorded as a whole-month amount, on no single day — the way rent is.':
    'Записывается суммой за весь месяц, без привязки к дню, — как аренда.',
  'On that day a “Due today” card asks you to confirm. Nothing is recorded on its own.':
    'В этот день карточка «Сегодня к оплате» попросит подтвердить. Само ничего не записывается.',
  'Delete this payment': 'Удалить этот платёж',
  'What it already recorded stays recorded.': 'То, что уже записано, останется записанным.',
  'Recurring payments': 'Регулярные платежи',
  'Rent, a phone plan, a gym membership: add one, and on its day a card on Finance asks whether it was paid.':
    'Аренда, связь, абонемент в зал: добавьте платёж, и в его день карточка в Финансах спросит, оплачен ли он.',
  'Opens the payment': 'Открывает платёж',
  'Add a payment': 'Добавить платёж',
  'Recurring payment': 'Регулярный платёж',
  'Delete “{name}”?': 'Удалить «{name}»?',
  'It stops being asked about. Everything it already recorded stays recorded.':
    'О нём больше не будут спрашивать. Всё, что он уже записал, останется записанным.',
  '{name} · {amount} recorded · {when}': '{name} · {amount} записано · {when}',
  '{name} skipped. Nothing was recorded.': '{name}: пропущено. Ничего не записано.',
  '{n} due': 'к оплате: {n}',
  'Rent, subscriptions': 'Аренда, подписки',
  '+{n} more due': 'Ещё к оплате: {n}',
  // M3 · forecast (design copy money.forecast)
  '≈ {amount} on {date} · estimate': '≈ {amount} к {date} · оценка',
  // M5 · savings goals (design copy goals.per)
  'Savings goals': 'Накопления',
  'Savings goal': 'Цель накоплений',
  'A target for a subsection': 'Цель для подраздела',
  Reached: 'Достигнуто',
  'by {date}': 'к {date}',
  '{saved} of {target}': '{saved} из {target}',
  'The date has passed · {amount} to go': 'Срок прошёл · осталось {amount}',
  'Paused · {name} is archived': 'На паузе · «{name}» в архиве',
  '{amount} a month to get there': '{amount} в месяц, чтобы успеть',
  'e.g. New laptop': 'например, Новый ноутбук',
  'Target in {currency}': 'Цель в {currency}',
  'Its balance is the progress: move money in with a transfer and the goal fills.':
    'Его баланс — это прогресс: переведите туда деньги, и цель заполнится.',
  'A date to reach it by': 'Срок',
  'Then it says what a month needs.': 'Тогда будет видно, сколько нужно в месяц.',
  By: 'К',
  'Delete this goal': 'Удалить эту цель',
  'The money stays where it is.': 'Деньги останутся на месте.',
  'A goal reads one subsection’s balance. Move money into it with a transfer on Finance, and the goal fills.':
    'Цель смотрит на баланс одного подраздела. Переведите туда деньги в Финансах — и цель заполнится.',
  'Opens the goal': 'Открывает цель',
  'Shares {name} with another goal.': '«{name}» общий с другой целью.',
  'Add a goal': 'Добавить цель',
  'Only the goal goes. The money stays in its subsection.':
    'Удалится только цель. Деньги останутся в своём подразделе.',
  // W9 · body measurements (design 16)
  'unit:cm': 'см',
  'unit:in': 'дюйм',
  'measure:Waist': 'Талия',
  'measure:Hips': 'Бёдра',
  'measure:Chest': 'Грудь',
  'measure:Arm': 'Рука',
  'measure:Thigh': 'Бедро',
  'measure:Calf': 'Голень',
  'measure:Neck': 'Шея',
  'One reading': 'Одно измерение',
  '{change} since {date}': '{change} с {date}',
  reading: 'измерение',
  readings: 'измерений',
  'Body measurements': 'Замеры тела',
  'Tap a measurement for its readings, and a reading to correct it.':
    'Нажмите на замер, чтобы увидеть измерения, и на измерение, чтобы исправить его.',
  'Nothing measured yet. Add a reading — waist, chest, arm… — on any date, so older notes can go in too.':
    'Пока ничего не измерено. Добавьте измерение — талия, грудь, рука… — на любую дату, так что старые записи тоже можно внести.',
  'Add a reading': 'Добавить измерение',
  'Delete the {name} reading from {date}?': 'Удалить измерение «{name}» от {date}?',
  'Only this reading goes. The others stay as they are.':
    'Удалится только это измерение. Остальные останутся как есть.',
  Weight: 'Вес',
  'Set in Workout settings': 'Задаётся в настройках тренировок',
  'Opens the reading': 'Открывает измерение',
  'First reading': 'Первое измерение',
  'New reading': 'Новое измерение',
  'This day already has a reading; saving replaces it.':
    'За этот день уже есть измерение; сохранение заменит его.',
  'Any past day, so older notes can go in too.':
    'Любой прошедший день — старые записи тоже можно внести.',
  'Save changes': 'Сохранить изменения',
  'Save {name}': 'Сохранить: {name}',
  'Between {min} and {max} {unit}.': 'От {min} до {max} {unit}.',
  'Delete this reading': 'Удалить это измерение',
  '{n} measured': 'измерено: {n}',
  'Waist, chest, arm…': 'Талия, грудь, рука…',
  // W3 · muscle map (design 17, copy muscles.tap)
  'Muscle map': 'Карта мышц',
  'Muscle map · this week': 'Карта мышц · эта неделя',
  'Previous week': 'Предыдущая неделя',
  'Next week': 'Следующая неделя',
  'This week': 'Эта неделя',
  'working sets': 'рабочие подходы',
  Front: 'Спереди',
  'Back view': 'Сзади',
  'Tap a muscle for its weekly sets.': 'Нажмите на мышцу, чтобы увидеть подходы за неделю.',
  'Not on the map: {list}': 'Не на карте: {list}',
  'Working sets, Monday to Sunday; warm-ups are left out. Secondary muscles count half: a set of bench press is 1 for chest and ½ for triceps and shoulders.':
    'Рабочие подходы с понедельника по воскресенье, без разминки. Вспомогательные мышцы считаются за половину: подход жима лёжа — это 1 для груди и ½ для трицепса и плеч.',
  '{muscle} · {n} / {target} sets this week': '{muscle} · {n} / {target} подходов за неделю',
  '{muscle} · {n} sets this week': '{muscle} · подходов за неделю: {n}',
  'Clear selection': 'Снять выбор',
  'No weekly target set for {cluster}': 'Для группы «{cluster}» цель на неделю не задана',
  '{n} sets to your target': 'До цели подходов: {n}',
  'Target met · {n} over': 'Цель достигнута · сверх: {n}',
  'Target met': 'Цель достигнута',
  // X2 · insights (design 18, copy insights.note)
  'On training days you finish more of your tasks: {a} vs {b} on rest days.':
    'В дни тренировок вы выполняете больше задач: {a} против {b} в дни отдыха.',
  'On training days you finish fewer of your tasks: {a} vs {b} on rest days.':
    'В дни тренировок вы выполняете меньше задач: {a} против {b} в дни отдыха.',
  'In weeks with 3+ workouts you finish more of your tasks: {a} vs {b} in weeks with fewer.':
    'В недели с 3+ тренировками вы выполняете больше задач: {a} против {b} в недели с меньшим числом.',
  'In weeks with 3+ workouts you finish fewer of your tasks: {a} vs {b} in weeks with fewer.':
    'В недели с 3+ тренировками вы выполняете меньше задач: {a} против {b} в недели с меньшим числом.',
  'You spend {effect}% more a day on training days than on rest days.':
    'В дни тренировок вы тратите в день на {effect}% больше, чем в дни отдыха.',
  'You spend {effect}% less a day on training days than on rest days.':
    'В дни тренировок вы тратите в день на {effect}% меньше, чем в дни отдыха.',
  'You spend {effect}% more a day on weekends than on weekdays.':
    'В выходные вы тратите в день на {effect}% больше, чем в будни.',
  'You spend {effect}% less a day on weekends than on weekdays.':
    'В выходные вы тратите в день на {effect}% меньше, чем в будни.',
  'Training days': 'Дни тренировок',
  'Rest days': 'Дни отдыха',
  '3+ workouts': '3+ тренировки',
  Fewer: 'Меньше',
  Weekends: 'Выходные',
  '{amount} a day': '{amount} в день',
  'based on {a} and {b}': 'выборка: {a} и {b}',
  'based on {a} with 3+ workouts and {b} with fewer':
    'выборка: {a} с 3+ тренировками и {b} с меньшим числом',
  '{n} training day': '{n} тренировочный день',
  '{n} training days': '{n} тренировочных дней',
  '{n} rest day': '{n} день отдыха',
  '{n} rest days': '{n} дней отдыха',
  '{n} weekend day': '{n} выходной день',
  '{n} weekend days': '{n} выходных дней',
  '{n} weekday': '{n} будний день',
  '{n} weekdays': '{n} будних дней',
  Insights: 'Наблюдения',
  'Correlation, not cause.': 'Это связь, а не причина.',
  'Patterns across your three logs.': 'Закономерности между тремя журналами.',
  'Nothing to show yet': 'Пока нечего показать',
  'Cards appear here when one log moves with another: tasks done on training days against rest days, and in weeks with 3+ workouts against weeks with fewer; spending on training days, and at weekends against weekdays.':
    'Карточки появятся, когда один журнал меняется вместе с другим: задачи в дни тренировок и в дни отдыха, в недели с 3+ тренировками и в недели с меньшим числом; траты в дни тренировок, а также в выходные и в будни.',
  'A card needs at least {days} days in each group ({weeks} weeks for weeks) over the last {window} weeks, and a gap of {points} points in tasks or {relative}% in spending. Smaller gaps are not shown.':
    'Для карточки нужно хотя бы {days} дней в каждой группе ({weeks} недели для сравнения недель) за последние {window} недель и разница в {points} пунктов по задачам или {relative}% по тратам. Меньшие различия не показываются.',
  '{n} found': 'найдено: {n}',
  'Not enough data yet': 'Пока мало данных',
  // E1 · achievements (design 19a/19b, Wave 3 — behind the one switch)
  'Achievements and levels': 'Достижения и уровни',
  'Off by default. Quiet badges and levels, worked out from your logs.':
    'По умолчанию выключено. Тихие значки и уровни, посчитанные по вашим журналам.',
  Badges: 'Значки',
  '{n} of {total} earned.': 'Получено {n} из {total}.',
  'Worked out from your logs, so days before the switch count too.':
    'Считаются по вашим журналам, поэтому дни до включения тоже идут в зачёт.',
  Bronze: 'Бронза',
  Silver: 'Серебро',
  Gold: 'Золото',
  Locked: 'Ещё не получен',
  'Not yet': 'Пока нет',
  'Earned {date}': 'Получен {date}',
  'badge:task': 'задача',
  'badge:record': 'рекорд',
  'badge:records': 'рекордов',
  'badge:t': 'т',
  'badge:perfect day': 'идеальный день',
  'badge:perfect days': 'идеальных дней',
  'badge:amount': 'сумма',
  'badge:amounts': 'сумм',
  'badge:day logged': 'день с записями',
  'badge:days logged': 'дней с записями',
  'badge:goal': 'цель',
  'badge:goals': 'целей',
  'First workout': 'Первая тренировка',
  'Save your first workout.': 'Сохраните первую тренировку.',
  '10 workouts': '10 тренировок',
  'Save 10 workouts.': 'Сохраните 10 тренировок.',
  '50 workouts': '50 тренировок',
  'Save 50 workouts.': 'Сохраните 50 тренировок.',
  '100 workouts': '100 тренировок',
  'Save 100 workouts.': 'Сохраните 100 тренировок.',
  '250 workouts': '250 тренировок',
  'Save 250 workouts.': 'Сохраните 250 тренировок.',
  '500 workouts': '500 тренировок',
  'Save 500 workouts.': 'Сохраните 500 тренировок.',
  '1 tonne in a session': '1 тонна за тренировку',
  'Move 1,000 kg in the working sets of one workout.':
    'Поднимите 1000 кг в рабочих подходах одной тренировки.',
  '5 tonnes in a session': '5 тонн за тренировку',
  'Move 5,000 kg in the working sets of one workout.':
    'Поднимите 5000 кг в рабочих подходах одной тренировки.',
  '10 tonnes in a session': '10 тонн за тренировку',
  'Move 10,000 kg in the working sets of one workout.':
    'Поднимите 10 000 кг в рабочих подходах одной тренировки.',
  '10 tonnes moved': '10 тонн поднято',
  'Move 10 tonnes in working sets, all workouts together.':
    'Поднимите 10 тонн в рабочих подходах, все тренировки вместе.',
  '100 tonnes moved': '100 тонн поднято',
  'Move 100 tonnes in working sets, all workouts together.':
    'Поднимите 100 тонн в рабочих подходах, все тренировки вместе.',
  '1,000 tonnes moved': '1000 тонн поднято',
  'Move 1,000 tonnes in working sets, all workouts together.':
    'Поднимите 1000 тонн в рабочих подходах, все тренировки вместе.',
  'First record': 'Первый рекорд',
  'Beat a previous best: a new e1RM, heaviest set or most reps.':
    'Побейте прежний лучший результат: новый e1RM, самый тяжёлый подход или больше всего повторений.',
  '10 records': '10 рекордов',
  'Beat a previous best in 10 exercise sessions.':
    'Побейте прежний лучший результат в упражнении на 10 тренировках.',
  '50 records': '50 рекордов',
  'Beat a previous best in 50 exercise sessions.':
    'Побейте прежний лучший результат в упражнении на 50 тренировках.',
  '1,000 working sets': '1000 рабочих подходов',
  'Log 1,000 working sets. Warm-ups are not counted.':
    'Запишите 1000 рабочих подходов. Разминка не считается.',
  'First task done': 'Первая выполненная задача',
  'Tick a task on a day it asks.': 'Отметьте задачу в день, когда она запланирована.',
  '100 tasks done': '100 выполненных задач',
  'Tick 100 tasks, on the days they ask.': 'Отметьте 100 задач в дни, когда они запланированы.',
  '1,000 tasks done': '1000 выполненных задач',
  'Tick 1,000 tasks, on the days they ask.': 'Отметьте 1000 задач в дни, когда они запланированы.',
  '7 days in a row': '7 дней подряд',
  'Do one daily task 7 asked days in a row. A day skipped on purpose is stepped over, not counted.':
    'Выполняйте одну ежедневную задачу 7 запланированных дней подряд. День, пропущенный намеренно, не прерывает и не засчитывается.',
  '30-day streak': 'Серия 30 дней',
  'Do one daily task 30 asked days in a row. A day skipped on purpose is stepped over, not counted.':
    'Выполняйте одну ежедневную задачу 30 запланированных дней подряд. День, пропущенный намеренно, не прерывает и не засчитывается.',
  '100-day streak': 'Серия 100 дней',
  'Do one daily task 100 asked days in a row. A day skipped on purpose is stepped over, not counted.':
    'Выполняйте одну ежедневную задачу 100 запланированных дней подряд. День, пропущенный намеренно, не прерывает и не засчитывается.',
  'A full week': 'Полная неделя',
  'Every task done on every day of a Monday–Sunday week, at least 5 days of it. A paused day does not count.':
    'Все задачи выполнены в каждый день недели с понедельника по воскресенье, минимум 5 дней. День на паузе не засчитывается.',
  '30 perfect days': '30 идеальных дней',
  'Finish every task 30 days. Days skipped on purpose are left out.':
    'Выполните все задачи за 30 дней. Намеренно пропущенные задачи не учитываются.',
  'First amount': 'Первая сумма',
  'Record your first amount. Transfers are not counted.':
    'Запишите первую сумму. Переводы не считаются.',
  '100 amounts': '100 сумм',
  'Record 100 amounts. Transfers are not counted.': 'Запишите 100 сумм. Переводы не считаются.',
  '30 days of logging': '30 дней записей',
  'Record spending on 30 different days.': 'Записывайте расходы в 30 разных дней.',
  '100 days of logging': '100 дней записей',
  'Record spending on 100 different days.': 'Записывайте расходы в 100 разных дней.',
  'A year of logging': 'Год записей',
  'Record spending on 365 different days.': 'Записывайте расходы в 365 разных дней.',
  'Budget kept': 'Бюджет соблюдён',
  'A whole month inside every budget you have set.': 'Целый месяц в рамках всех заданных бюджетов.',
  'Budget kept 3 months': 'Бюджет соблюдён 3 месяца',
  'Three whole months inside every budget you have set.':
    'Три целых месяца в рамках всех заданных бюджетов.',
  'Budget kept a year': 'Бюджет соблюдён год',
  'Twelve whole months inside every budget you have set.':
    'Двенадцать целых месяцев в рамках всех заданных бюджетов.',
  'Goal reached': 'Цель достигнута',
  'A savings goal’s subsection reaches its target.':
    'Подраздел цели накопления достигает целевой суммы.',
  // E2 · XP and levels (design 20)
  'Log a working set': 'Рабочий подход',
  'Finish a workout': 'Завершённая тренировка',
  'Tick a task': 'Отмеченная задача',
  'A day with every task done': 'День, когда сделаны все задачи',
  'Record an amount': 'Записанная сумма',
  'A personal record': 'Личный рекорд',
  'of {xp} XP to level {level}': 'из {xp} опыта до уровня {level}',
  'Level {n}': 'Уровень {n}',
  'Lv {n}': 'Ур. {n}',
  'How XP is earned': 'Как начисляется опыт',
  '{n} so far': 'пока: {n}',
  'XP only goes up. A missed day earns nothing and takes nothing.':
    'Опыт только растёт. Пропущенный день ничего не даёт и ничего не отнимает.',
  'Level {n}, {xp} XP. Open the level': 'Уровень {n}, опыт {xp}. Открыть уровень',
  XP: 'опыт',
  // E3 · streak freezes (design 21)
  '{n} streak freeze': '{n} заморозка серии',
  '{n} streak freezes': '{n} заморозок серии',
  "A freeze covers one day you didn't answer, so the streak carries on.":
    'Заморозка закрывает один неотмеченный день — серия продолжается.',
  'It’s used for you, the morning after.': 'Она срабатывает сама, на следующее утро.',
  'Earn one for every {n} days in a row. Hold up to {max}. Skipping on purpose never needs one.':
    'Одна за каждые {n} дней подряд. Можно держать до {max}. Осознанному пропуску она не нужна.',
  'Used on {days}.': 'Дни под заморозкой: {days}.',
  '{n} streak freezes held. Open': 'Заморозок серии: {n}. Открыть',
};

/** Test hook: the strings this build can translate. Not read by the app. */
export function translatedKeys(): string[] {
  return Object.keys(RU);
}
