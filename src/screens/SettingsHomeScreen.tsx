/**
 * SettingsHomeScreen — the look, three doors, one export, one import, one reset.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ SETTINGS                            РУ  EN   │
 *   │ APPEARANCE                                   │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ ▓▓▓▓▓▓▓ Fintech Lime ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ◐  │ │  ← the live gradient
 *   │ │ PRESETS  [▓▓ Lime ✓] [▓▓ Emerald]        │ │
 *   │ │          [▓▓ …     ] [▓▓ …      ]        │ │
 *   │ │ Custom · pick your own three   ● ● ●     │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ SECTIONS                                     │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ ▣ Workout settings                     › │ │
 *   │ │ ▣ Daily tasks settings                 › │ │
 *   │ │ ▣ Finance settings                     › │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ AI · EVERYTHING, IN ONE FILE · reset         │
 *   └──────────────────────────────────────────────┘
 *
 * ── APPEARANCE FIRST, AND WHY ─────────────────────────────────────────────
 *
 * The theme is the one setting that changes every screen at once, and the only
 * one whose effect can be SEEN from here — so it leads, as a preview of itself
 * rather than as a row naming it. A preset is one tap. Custom's three dots open
 * `ColorPickerSheet`, which writes nothing until `Apply`: a theme change remounts
 * the whole app, and a picker that wrote per tap would close itself under the
 * thumb. The theme names are data in `lib/theme.ts` and go through `t()` here.
 *
 * ── THREE ROWS AT THE TOP, AND WHY THEY ARE THE WHOLE STRUCTURE ────────────
 *
 * The app is three logs. Settings used to be one scroll holding all three logs'
 * preferences in whatever order they were added, so the rest step and the plate
 * list sat between the user and anything about their money. A row per section
 * means the question "where do I change this" has the same answer as "which part
 * of the app is it about", which is the only mapping anybody has to learn.
 *
 * ── AND ONE OF EACH, UNDERNEATH ────────────────────────────────────────────
 *
 * There were eight data rows across this screen and three more elsewhere: a
 * whole-phone export, a CSV export, a replace, a merge, a CSV import, and an
 * export-and-import pair for each of the three sections. Every one of them
 * worked. Together they made the one that matters — everything, out to a file
 * you can read — just another row in a list of things to be careful about, and a
 * backup you have to choose between is a backup you put off.
 *
 * So: one file holds all three logs and the settings. `Export everything` writes
 * it, `Replace everything from a file` reads it back, and `Reset every setting`
 * puts the preferences back to their defaults WITHOUT touching a single logged
 * row. That last distinction is the reason the reset is here rather than in a
 * section: it resets all three sections' settings at once, which is a sentence
 * only this screen can honestly say.
 *
 * ONE QUIET ROW MORE, for spreadsheets (M7): `Export a spreadsheet (CSV)` opens
 * a sheet offering the amounts or the workouts. One row and a sheet rather than
 * two rows, so the data card still reads as one export, one import; muted rather
 * than green, because it is a way to READ the logs in a spreadsheet, not a way to
 * keep them — a CSV restores nothing, and there is no CSV import (`lib/csv.ts`).
 *
 * The automatic backup stays, above them, because it is not an export — it is the
 * thing that makes remembering to export optional, and `lib/backup.ts` is right
 * that protection depending on the user's memory of a menu is not protection.
 *
 * ── ONE SWITCH FOR THE GAME LAYER (Wave 3) ────────────────────────────────
 *
 * `Achievements and levels` sits under the assistant, off by default, as one
 * switch rather than one per piece (`lib/engagement.ts` has the argument). It
 * is here and not in a section because it spans all three logs. The badge
 * gallery's door appears under it only while it is on.
 *
 * ── AND THE LANGUAGE IS IN THE CORNER, NOT IN A ROW ────────────────────────
 *
 * It is the one setting whose whole job is to be findable by somebody who cannot
 * read the screen it is on. A row saying `Язык` is invisible to exactly the
 * person who needs it, and so is one saying `Language`. Two letters in the
 * corner, each in its own script, are legible either way — and they are in the
 * corner rather than in the list because the corner is the same place on every
 * section root, which is where somebody who cannot read the app will look.
 */

import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';

import { ColorPickerSheet } from '../components/ColorPickerSheet';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { Icon } from '../components/Icon';
import { MaterialSymbol, type SymbolName } from '../components/MaterialSymbol';
import { FADE_ON, RunningText } from '../components/RunningText';
import { Sheet } from '../components/Sheet';
import { LanguageToggle, SectionTopBar } from '../components/SectionTopBar';
import { BubblePressable } from '../components/bubbles';
import {
  FloatingAction,
  GlassSurface,
  Lamps,
  SpecularEdge,
  useBarInsets,
} from '../components/glass';
import { pressedStyle } from '../components/motion';
import {
  DangerFootAction,
  Kicker,
  Separator,
  StepperRow,
  SwitchRow,
  TextButton,
  Toggle,
} from '../components/primitives';
import { useBadges } from '../hooks/useEngagement';
import { describeGallery } from '../lib/achievements';
import { engagementOn, engagementView } from '../lib/engagement';
import { SparkleCircle } from '../components/AiEntryCard';
import { useAi } from '../state/aiStore';
import { runBackupNow } from '../hooks/useAutoBackup';
import { describeBackupAge } from '../lib/autoBackup';
import {
  backupBaseName,
  countPayload,
  describeCounts,
  parseBackup,
  staleExports,
  type BackupCounts,
  type BackupEnvelope,
} from '../lib/backup';
import {
  deleteFile,
  describeError,
  folderLabel,
  listFolder,
  pickFolder,
  pickJsonFile,
  readTextFile,
  saveCsvFile,
  saveJsonFile,
} from '../lib/backupFile';
import { csvBaseName } from '../lib/csv';
import { useLanguage, useT } from '../hooks/useT';
import { commit, tap } from '../lib/feedback';
import { LANGUAGES, LANGUAGE_LABELS, LANGUAGE_NAMES, type Language } from '../lib/i18n';
import {
  applyBackup,
  currentSnapshot,
  exportBackupText,
  exportCsvText,
} from '../state/dataTransfer';
import { SuccessPopup } from '../components/SuccessPopup';
import { SETTING_LIMITS, useSettings } from '../state/settingsStore';
import { THEME_PRESETS, themeColors, themeName, type ThemePreset } from '../lib/theme';
import { ai, gradientBar, palette, radius, tint } from '../theme/tokens';

/** A file that has been read and understood, waiting for a yes. */
interface PendingImport {
  file: string;
  envelope: BackupEnvelope;
  counts: BackupCounts;
}

/** The one line under the rows. `quiet` is "nothing happened", not an alarm. */
interface Status {
  tone: 'ok' | 'quiet';
  text: string;
}

/**
 * What is on this phone right now, counted the same way a file is.
 *
 * Read at the moment it is needed rather than subscribed to: it is only ever used
 * inside a sentence about something the user just did, and a count that re-rendered
 * this screen on every logged set would be a subscription bought for nothing.
 */
function onThisPhone(): BackupCounts {
  return countPayload(currentSnapshot());
}

interface SettingsHomeScreenProps {
  onOpenWorkoutSettings: () => void;
  onOpenTaskSettings: () => void;
  onOpenMoneySettings: () => void;
  /** `AI assistant` — the key, the model, the test. */
  onOpenAiSettings: () => void;
  /** E1: the badge gallery. Only reachable while the Wave 3 switch is on. */
  onOpenAchievements: () => void;
}

export function SettingsHomeScreen({
  onOpenWorkoutSettings,
  onOpenTaskSettings,
  onOpenMoneySettings,
  onOpenAiSettings,
  onOpenAchievements,
}: SettingsHomeScreenProps) {
  const settings = useSettings();
  const t = useT();
  const language = useLanguage();
  const bars = useBarInsets();

  const [status, setStatus] = useState<Status | null>(null);
  /**
   * The same news as `status`, in the middle of the screen for three seconds.
   * The status line sits at the foot of the scroll, under the reset box, and an
   * export that landed while the button's owner was looking at the top of the
   * screen was an export they did again. See `components/SuccessPopup.tsx`.
   */
  const [popup, setPopup] = useState<{ title: string; detail: string } | null>(null);
  const succeed = (title: string, text: string) => {
    setStatus({ tone: 'ok', text });
    setPopup({ title, detail: text });
  };
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  /** Which of Custom's three dots has its picker open. */
  const [picking, setPicking] = useState<0 | 1 | 2 | null>(null);
  /** The two spreadsheet exports' sheet. */
  const [choosingCsv, setChoosingCsv] = useState(false);
  /** A picker is open or a file is being read. Stops a second tap racing it. */
  const [busy, setBusy] = useState(false);

  /**
   * EXPORT — write everything to one JSON file, in a folder the user picks.
   *
   * The folder picker rather than a silent write: a file the user cannot find is
   * not a backup, and app-private storage is exactly where Android hides files
   * from its own file manager. What comes back is stated by name, so the next step
   * ("move it off the phone") is something the user can actually do.
   */
  const exportEverything = async () => {
    if (busy) return;
    tap();
    setBusy(true);
    setStatus(null);
    try {
      const outcome = await saveJsonFile(backupBaseName(), exportBackupText(), language);
      if (!outcome.saved) {
        setStatus({ tone: 'quiet', text: t('No folder picked, so nothing was saved.') });
        return;
      }
      commit();
      /*
       * ONE EXPORT IN THE FOLDER, not one per tap: the earlier exports go once the
       * new file exists. Best-effort and after the write, so a delete that fails
       * leaves an extra copy and never no copy at all.
       */
      if (outcome.folderUri && outcome.uri) {
        const justWritten = outcome.uri;
        for (const old of staleExports(await listFolder(outcome.folderUri), justWritten)) {
          await deleteFile(old);
        }
      }
      /*
       * A MANUAL EXPORT COUNTS AS A BACKUP, and it also teaches the automatic one
       * where to write. Both matter: without the first, "last backup 40 days ago"
       * would be a lie told to somebody who exported this morning; without the
       * second, the app would ask for a folder permission it was just handed.
       */
      settings.recordBackup(new Date().toISOString());
      const adopted = outcome.folderUri != null && settings.autoBackupFolderUri == null;
      if (adopted) settings.setAutoBackupFolder(outcome.folderUri);

      succeed(
        t('Export successful'),
        `${t('Saved {name} to {where} — {counts}.', {
          name: outcome.name,
          where: outcome.where,
          counts: describeCounts(onThisPhone(), language),
        })}${adopted ? ` ${t('Automatic backups will go to that folder from now on.')}` : ''}`,
      );
    } catch (error) {
      setStatus({ tone: 'quiet', text: describeError(error, language) });
    } finally {
      setBusy(false);
    }
  };

  /**
   * A SPREADSHEET — one log as CSV (`lib/csv.ts`), through the same folder picker.
   *
   * Not a backup, so none of the backup's bookkeeping: no rotation of earlier
   * files, no `lastBackupAt`, no adopting the folder for automatic copies. Saying
   * "backed up" over a file that cannot be restored would be the one lie this
   * screen must not tell.
   */
  const exportCsv = async (kind: 'amounts' | 'workouts') => {
    setChoosingCsv(false);
    if (busy) return;
    tap();
    setBusy(true);
    setStatus(null);
    try {
      const outcome = await saveCsvFile(csvBaseName(kind), exportCsvText(kind), language);
      if (!outcome.saved) {
        setStatus({ tone: 'quiet', text: t('No folder picked, so nothing was saved.') });
        return;
      }
      commit();
      succeed(
        t('Export successful'),
        t('Saved {name} to {where}.', { name: outcome.name, where: outcome.where }),
      );
    } catch (error) {
      setStatus({ tone: 'quiet', text: describeError(error, language) });
    } finally {
      setBusy(false);
    }
  };

  /**
   * IMPORT — the phone's own file browser, then a question.
   *
   * Reading the file and APPLYING it are deliberately two steps: this is the only
   * irreversible action in the app that isn't a delete, so the sheet gets to state
   * what is in the file and what is on the phone before anything is replaced.
   */
  const importEverything = async () => {
    if (busy) return;
    tap();
    setBusy(true);
    setStatus(null);
    try {
      const file = await pickJsonFile();
      if (!file) {
        setStatus({ tone: 'quiet', text: t('No file picked.') });
        return;
      }
      const result = parseBackup(await readTextFile(file.uri), language);
      if (!result.ok) {
        setStatus({ tone: 'quiet', text: `${file.name}: ${result.error}` });
        return;
      }
      setPending({ file: file.name, envelope: result.envelope, counts: result.counts });
    } catch (error) {
      setStatus({ tone: 'quiet', text: describeError(error, language) });
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = () => {
    if (!pending) return;
    let applied: ReturnType<typeof applyBackup>;
    try {
      applied = applyBackup(pending.envelope);
    } catch (error) {
      // A throw out of a press handler is a crash in a release build; this says
      // what went wrong instead, and the log step runs first so nothing changed.
      setPending(null);
      setStatus({ tone: 'quiet', text: describeError(error, language) });
      return;
    }
    commit();
    setPending(null);
    succeed(
      t('Import successful'),
      // What LANDED, not what the file claimed: rows that fail validation are
      // dropped on the way in, and a restore that reports the file's own numbers
      // is how someone learns not to trust the feature.
      applied.settingsApplied
        ? t('Restored {counts}, and your settings.', { counts: describeCounts(applied, language) })
        : t('Restored {counts}.', { counts: describeCounts(applied, language) }),
    );
  };

  /**
   * `Back up now`, and `Choose a folder` when there isn't one.
   *
   * The same write path the unattended one uses (`runBackupNow`), so the rotation
   * and the stamp cannot disagree between the two. Where no folder has been granted
   * this asks for one first, because that grant is the whole difference between a
   * backup that survives an uninstall and one that dies with it.
   */
  const backUpNow = async () => {
    if (busy) return;
    tap();
    setBusy(true);
    setStatus(null);
    try {
      let folder = settings.autoBackupFolderUri;
      if (!folder) {
        const picked = await pickFolder();
        if (!picked) {
          setStatus({ tone: 'quiet', text: t('No folder picked, so nothing was saved.') });
          return;
        }
        settings.setAutoBackupFolder(picked);
        folder = picked;
      }

      let result = await runBackupNow(true);
      /*
       * A FOLDER THAT STOPPED WORKING IS RE-PICKED HERE. The message used to say
       * "pick it again", and nothing on the screen could: the picker only ever
       * opened when there was no folder at all. Now the failed write asks for one
       * — the same folder re-grants access, a new one replaces it — and tries once
       * more.
       */
      if (!result.wrote) {
        const picked = await pickFolder();
        if (picked) {
          settings.setAutoBackupFolder(picked);
          folder = picked;
          result = await runBackupNow(true);
        }
      }
      if (!result.wrote) {
        setStatus({
          tone: 'quiet',
          text: t('Could not write to that folder. Pick it again to re-grant access.'),
        });
        return;
      }
      commit();
      succeed(
        t('Backup saved'),
        t('Backed up {name} to {folder} — {counts}.', {
          name: result.name ?? '',
          folder: folderLabel(folder, language),
          counts: describeCounts(onThisPhone(), language),
        }),
      );
    } catch (error) {
      setStatus({ tone: 'quiet', text: describeError(error, language) });
    } finally {
      setBusy(false);
    }
  };

  const asking = pending != null || confirmingReset || picking != null || choosingCsv;

  return (
    <View className="flex-1 bg-bg">
      <Lamps section="Settings" />
      <View className="flex-1" style={asking ? { opacity: 0.28 } : undefined}>
        <StatusBar style="light" />
        <SectionTopBar
          title={t('Settings')}
          trailing={
            <LanguageToggle
              options={LANGUAGES.map((value) => ({
                value,
                label: LANGUAGE_LABELS[value],
                name: LANGUAGE_NAMES[value],
              }))}
              active={language}
              onSelect={(value) => {
                tap();
                settings.setLanguage(value as Language);
              }}
            />
          }
        />

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingTop: bars.top + 8, paddingBottom: bars.bottom }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!asking}
        >
          {/* APPEARANCE — see the file header for why it leads. */}
          <Kicker className="mx-lg mb-kicker-gap">{t('Appearance')}</Kicker>
          <GlassSurface tier="card" radius={radius.card} shadow="e1" flat className="mx-lg">
            <View style={{ padding: 14 }}>
              <ThemePreview name={t(themeName(settings.themeId))} />
              <Text
                maxFontSizeMultiplier={1.3}
                style={{ marginTop: 14, fontSize: 12.5, letterSpacing: 1.1 }}
                className="font-semibold uppercase text-ink-faint"
              >
                {t('Presets')}
              </Text>
              {/* Two columns, as rows of pairs: a flex-wrap grid cannot give
                  two cards an exact half each with an 8 dp gutter between. */}
              <View style={{ marginTop: 8, gap: 8 }}>
                {pairs(THEME_PRESETS).map((pair) => (
                  <View key={pair[0].id} className="flex-row" style={{ gap: 8 }}>
                    {pair.map((preset) => (
                      <PresetCard
                        key={preset.id}
                        preset={preset}
                        selected={settings.themeId === preset.id}
                        onPress={() => {
                          if (settings.themeId === preset.id) return;
                          tap();
                          settings.setTheme(preset.id);
                        }}
                      />
                    ))}
                  </View>
                ))}
              </View>
              <CustomCard
                colors={settings.customColors}
                selected={settings.themeId === 'custom'}
                onSelect={() => {
                  if (settings.themeId === 'custom') return;
                  tap();
                  settings.setTheme('custom');
                }}
                onPickDot={(index) => {
                  tap();
                  setPicking(index);
                }}
              />
            </View>
          </GlassSurface>
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ marginTop: 8, fontSize: 14, lineHeight: 20 }}
            className="mx-lg text-ink-faint"
          >
            {t(
              'The three colours tint the buttons, the rings, the lit cards and the light behind every section. The AI button keeps its own colours so it always stands out.',
            )}
          </Text>

          <Kicker className="mx-lg mb-kicker-gap mt-kicker">{t('Sections')}</Kicker>
          {/* The three rows that ARE the app, each behind its own section's
              mark — the same Material Symbol the nav bar draws for it. The
              badge is what makes this list read as a map.

              ONE card, split by hairlines inset 68 so they start where the
              words do: three panes stacked with air between them read as three
              separate things, and these are one map of the app. */}
          <GlassSurface tier="card" radius={radius.row} shadow="e1" flat className="mx-lg">
            <SectionRow
              label={t('Workout settings')}
              hint={t('Rest, plates, weekly targets')}
              symbol="fitness_center"
              onPress={onOpenWorkoutSettings}
            />
            <View className="ml-[68px] h-hairline bg-hairline" />
            <SectionRow
              label={t('Daily tasks settings')}
              hint={t('The automatic tick')}
              symbol="task_alt"
              onPress={onOpenTaskSettings}
            />
            <View className="ml-[68px] h-hairline bg-hairline" />
            <SectionRow
              label={t('Finance settings')}
              hint={t('What amounts are counted in')}
              symbol="account_balance_wallet"
              onPress={onOpenMoneySettings}
            />
          </GlassSurface>

          {/* THE ASSISTANT, between the sections it reads and the general
              block. One row, whose second line is the one fact about it that
              matters — whether a key has passed its test — and a lit dot when
              it has. */}
          <Kicker className="mx-lg mb-kicker-gap mt-kicker">{t('AI')}</Kicker>
          <AiSettingsRow onPress={onOpenAiSettings} />

          {/* WAVE 3's ONE SWITCH (lib/engagement.ts), off by default. Off, the
              card is this one row and nothing else in the app changes; on, the
              doors to what it turned on open underneath it. */}
          <Kicker className="mx-lg mb-kicker-gap mt-kicker">{t('Achievements and levels')}</Kicker>
          <EngagementCard onOpenAchievements={onOpenAchievements} />

          {/* ----------------------------------------------------------
              AUTOMATIC BACKUP — the row that makes the one below it optional.

              `lib/backup.ts` says a backup is "the only thing standing between a
              year of training and a factory reset", and then made it a button:
              protection only as good as the user's memory of a screen they have no
              other reason to open. So it happens on its own, and this row is the
              receipt — the AGE of the last copy, in words, because "is it recent
              enough" is the only question it answers and a date makes the reader do
              the arithmetic.

              It cannot be on without a folder: Android's only durable destination
              is a granted directory, and the app's own sandbox dies with the app —
              which is one of the exact events a backup exists to survive. So the
              row states which of the two facts is missing. */}
          <Kicker className="mx-lg mb-kicker-gap mt-kicker">{t('Everything, in one file')}</Kicker>

          {/* THE HERO. The one fact on this screen anybody opens it to check —
              how old the last copy is — at a size nothing else here comes near.
              A phrase rather than a bare numeral, because "Never" and "Today"
              are both answers and neither is a number. */}
          <GlassSurface
            tier="lit"
            radius={radius.card}
            className="mx-lg mb-sm"
            tint={tint(0.1)}
            borderColor={tint(0.24)}
          >
            <View className="p-[18px]">
              <Kicker tone="green">{t('Last backup')}</Kicker>
              <Text
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={{ fontSize: 28, lineHeight: 32, letterSpacing: -0.8 }}
                className="mt-xs font-semibold tabular-nums text-ink"
              >
                {describeBackupAge(settings.lastBackupAt, undefined, language)}
              </Text>
              <Text className="mt-[2px] text-label font-medium text-ink-muted">
                {settings.autoBackupEnabled
                  ? t('Every {days} days', { days: settings.autoBackupIntervalDays })
                  : t('Automatic backups are off')}
              </Text>
            </View>
          </GlassSurface>

          <GlassSurface tier="well" radius={radius.row} flat className="mx-lg">
            {/* A REAL SWITCH now, with the state in words under the label — it
                was a row that toggled when tapped, which is a switch nobody could
                see was one. */}
            <View className="min-h-[64px] flex-row items-center px-lg py-[10px]">
              <View className="flex-1 pr-md">
                <Text className="text-body font-medium text-ink">{t('Back up automatically')}</Text>
                <Text
                  numberOfLines={2}
                  className={[
                    'mt-[2px] text-label',
                    settings.autoBackupEnabled && settings.autoBackupFolderUri == null
                      ? 'text-ink-muted'
                      : 'text-ink-faint',
                  ].join(' ')}
                >
                  {!settings.autoBackupEnabled
                    ? t('Off')
                    : settings.autoBackupFolderUri == null
                      ? t('Needs a folder')
                      : `${t('Every {days} days', { days: settings.autoBackupIntervalDays })} · ${folderLabel(settings.autoBackupFolderUri, language)}`}
                </Text>
              </View>
              <Toggle
                value={settings.autoBackupEnabled}
                accessibilityLabel={t('Back up automatically')}
                onChange={(next) => {
                  tap();
                  settings.setAutoBackupEnabled(next);
                }}
              />
            </View>
            {settings.autoBackupEnabled ? (
              <>
                <Separator inset={0} />
                <StepperRow
                  label={t('Backup every')}
                  value={t('{days} days', { days: settings.autoBackupIntervalDays })}
                  onDecrease={() => {
                    tap();
                    settings.bumpNumber(
                      'autoBackupIntervalDays',
                      -SETTING_LIMITS.autoBackupIntervalDays.step,
                    );
                  }}
                  onIncrease={() => {
                    tap();
                    settings.bumpNumber(
                      'autoBackupIntervalDays',
                      SETTING_LIMITS.autoBackupIntervalDays.step,
                    );
                  }}
                />
              </>
            ) : null}
            <Separator inset={0} />
            <TextButton
              label={t('Export everything')}
              tone="green"
              onPress={() => void exportEverything()}
            />
            <Separator inset={0} />
            <TextButton
              label={t('Replace everything from a file')}
              tone="green"
              onPress={() => void importEverything()}
            />
            <Separator inset={0} />
            {/* Muted: a way to READ the logs elsewhere, not a way to keep them. */}
            <TextButton
              label={t('Export a spreadsheet (CSV)')}
              onPress={() => {
                tap();
                setChoosingCsv(true);
              }}
            />
            <Separator inset={0} />
          </GlassSurface>

          {status ? (
            <Text
              className={[
                'mx-lg mt-md text-label',
                status.tone === 'ok' ? 'text-green-bright' : 'text-ink-muted',
              ].join(' ')}
            >
              {status.text}
            </Text>
          ) : null}

          <Text className="mx-lg mt-md text-label text-ink-faint">
            {t(
              'A backup is plain JSON, so you can read it, keep it anywhere, and move it to another phone. It holds all three sections — training, the daily tasks and the finance — and every setting.',
            )}{' '}
            {t('Your AI chats and past chats travel with it too; the AI key never does.')}{' '}
            <Text className="text-ink-muted">{t('Replace everything')}</Text>{' '}
            {t(
              'makes this phone look like the file, so export first if there is anything here you would miss. A backup written by an older version carries no tasks and no amounts, and restoring one leaves both of those exactly where they are rather than emptying them. A workout in progress is not part of a backup: it carries a running clock.',
            )}
          </Text>

          <Text className="mx-lg mt-md text-label text-ink-faint">
            <Text className="text-ink-muted">{t('Reset every setting')}</Text>{' '}
            {t(
              'puts all three sections’ settings back to their defaults at once. It does not touch a single thing you have logged — not an exercise, not a routine, not an answered day, not an amount.',
            )}
          </Text>

          {/* THE FOOT OF THE SCREEN (U19): the one action here that cannot be
              undone is the last thing on the page, muted, and it asks in the
              danger sheet. A reset should cost a scroll, not a flick. */}
          <DangerFootAction
            label={t('Reset every setting')}
            hint={t('Nothing you have logged is touched.')}
            onPress={() => setConfirmingReset(true)}
            className="mx-md mt-xl"
          />
        </ScrollView>
      </View>

      {/* THE ONE NON-FILLED INSTANCE of the floating slot, and it earns the
          exception: a maintenance task should not shout in the same voice as
          `Add expense`. Same coordinates, same geometry, ghost glass. */}
      {asking ? null : (
        <FloatingAction
          label={
            settings.autoBackupFolderUri == null ? t('Choose a backup folder') : t('Back up now')
          }
          round
          variant="ghost"
          symbol="cloud_upload"
          onPress={() => void backUpNow()}
        />
      )}

      {pending ? (
        <ConfirmSheet
          tone="danger"
          title={t('Replace everything with this file?')}
          body={[
            t('{file} holds {counts}.', {
              file: pending.file,
              counts: describeCounts(pending.counts, language),
            }),
            t('This phone has {counts}, and all of it goes.', {
              counts: describeCounts(onThisPhone(), language),
            }),
            t('This cannot be undone.'),
          ].join(' ')}
          confirmLabel={t('Import it')}
          cancelLabel={t('Keep what I have')}
          onConfirm={confirmImport}
          onCancel={() => setPending(null)}
        />
      ) : null}

      {confirmingReset ? (
        <ConfirmSheet
          tone="danger"
          title={t('Reset every setting?')}
          body={t(
            'Every duration, switch, target and default across all three sections goes back to how it shipped, and your bodyweight is cleared. Your exercises, routines, history, tasks and amounts are untouched.',
          )}
          confirmLabel={t('Reset settings')}
          cancelLabel={t('Keep mine')}
          onConfirm={() => {
            settings.resetToDefaults();
            setConfirmingReset(false);
            setStatus({ tone: 'ok', text: t('Every setting is back to its default.') });
          }}
          onCancel={() => setConfirmingReset(false)}
        />
      ) : null}

      {choosingCsv ? (
        <Sheet title={t('Export as a spreadsheet')} onDismiss={() => setChoosingCsv(false)}>
          <View className="overflow-hidden rounded-surface bg-surface-alt">
            <ExportRow
              label={t('Export amounts (CSV)')}
              detail={t('One row per amount, transfers included.')}
              onPress={() => void exportCsv('amounts')}
            />
            <Separator inset={16} />
            <ExportRow
              label={t('Export workouts (CSV)')}
              detail={t('One row per set, warm-ups marked.')}
              onPress={() => void exportCsv('workouts')}
            />
          </View>
          <Text className="mx-xs mt-md text-label text-ink-faint">
            {t(
              'A spreadsheet export is for reading a log in Excel or Google Sheets. It is not a backup and cannot be read back in — only the JSON file restores.',
            )}
          </Text>
          <TextButton label={t('Cancel')} onPress={() => setChoosingCsv(false)} />
        </Sheet>
      ) : null}

      {picking != null ? (
        <ColorPickerSheet
          index={picking}
          colors={settings.customColors}
          onDismiss={() => setPicking(null)}
          onDone={(hex) => {
            const index = picking;
            setPicking(null);
            // The one write, and it remounts the app: see `ColorPickerSheet`.
            useSettings.getState().setCustomColor(index, hex);
          }}
        />
      ) : null}

      {popup ? (
        <SuccessPopup title={popup.title} detail={popup.detail} onDone={() => setPopup(null)} />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Appearance                                                          */
/* ------------------------------------------------------------------ */

/** One choice in the spreadsheet sheet: what it writes, and what a row of it is. */
function ExportRow({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      style={pressedStyle}
      className="h-row-lg justify-center px-lg"
    >
      <Text className="text-body text-ink">{label}</Text>
      <Text numberOfLines={1} className="mt-[2px] text-label text-ink-faint">
        {detail}
      </Text>
    </Pressable>
  );
}

/** A list in twos, for the two-column preset grid. */
function pairs<T>(list: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += 2) out.push(list.slice(i, i + 2));
  return out;
}

/** The CSS a designer would write for the current theme — shown, not used. */
function cssFor(colors: readonly [string, string, string]): string {
  return `linear-gradient(90deg, ${colors[0]} 0%, ${colors[1]} 50%, ${colors[2]} 100%)`;
}

/**
 * The live theme as a 96 dp bar: the 90° gradient, the name, and the gradient
 * written out. (A sheen used to cross it every 4 s; it went with the rest of the
 * app's never-ending loops in 2.1.0.)
 */
function ThemePreview({ name }: { name: string }) {
  const themeId = useSettings((s) => s.themeId);
  const custom = useSettings((s) => s.customColors);
  return (
    <View style={{ height: 96, borderRadius: 18 }}>
      <LinearGradient
        {...gradientBar()}
        style={{
          flex: 1,
          borderRadius: 18,
          overflow: 'hidden',
          paddingVertical: 14,
          paddingHorizontal: 16,
          justifyContent: 'space-between',
        }}
      >
        <View className="flex-row items-center justify-between">
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            style={{ flex: 1, fontSize: 19, fontWeight: '600', color: palette.onAcc }}
          >
            {name}
          </Text>
          <MaterialSymbol name="palette" size={24} color={palette.onAcc} filled />
        </View>
        <RunningText
          text={cssFor(themeColors(themeId, custom))}
          maxFontSizeMultiplier={1.3}
          fadeColor={FADE_ON.gradient}
          style={{ fontFamily: 'monospace', fontSize: 12.5, color: palette.onAcc, opacity: 0.88 }}
        />
      </LinearGradient>
    </View>
  );
}

/** Behind a preset card's tag: the card's own wash over the outer card glass. */
const PRESET_FADE = { selected: '#1A1E1D', idle: '#151918' } as const;

/**
 * One preset: its own gradient (not the live theme's — that is the point of a
 * swatch), the name, and a running tag. The selected one is outlined in the
 * accent and ticked.
 */
function PresetCard({
  preset,
  selected,
  onPress,
}: {
  preset: ThemePreset;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useT();
  const name = t(preset.name);
  return (
    <BubblePressable
      onPress={onPress}
      radius={16}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name}. ${t(preset.tag)}`}
      style={(state) => [
        pressedStyle(state),
        {
          flex: 1,
          minWidth: 0,
          padding: 10,
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: selected ? palette.acc : 'rgba(236,241,238,0.045)',
          backgroundColor: selected ? 'rgba(236,241,238,0.06)' : 'rgba(236,241,238,0.028)',
        },
      ]}
    >
      <View
        style={{
          height: 36,
          borderRadius: 12,
        }}
      >
        <LinearGradient
          colors={[...preset.colors]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1, borderRadius: 12 }}
        />
      </View>
      <View className="flex-row items-center" style={{ marginTop: 8, gap: 6 }}>
        <Text
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          style={{ flex: 1, fontSize: 14.5, lineHeight: 19 }}
          className="font-medium text-ink"
        >
          {name}
        </Text>
        {selected ? <Icon name="check" size={16} color={palette.acc} /> : null}
      </View>
      <RunningText
        text={t(preset.tag)}
        maxFontSizeMultiplier={1.3}
        fadeColor={selected ? PRESET_FADE.selected : PRESET_FADE.idle}
        containerStyle={{ marginTop: 1 }}
        style={{ fontSize: 12.5, lineHeight: 16, color: palette.inkFaint }}
      />
    </BubblePressable>
  );
}

/**
 * Custom: three dots that each open the picker, and a strip of the three.
 * Solid accent outline when it is the theme in use; dashed when it is only an
 * offer. Tapping the card itself (not a dot) selects it as it stands.
 */
function CustomCard({
  colors,
  selected,
  onSelect,
  onPickDot,
}: {
  colors: readonly [string, string, string];
  selected: boolean;
  onSelect: () => void;
  onPickDot: (index: 0 | 1 | 2) => void;
}) {
  const t = useT();
  return (
    <BubblePressable
      onPress={onSelect}
      radius={16}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${t('Custom')}. ${t('Pick your own three colours')}`}
      style={(state) => [
        pressedStyle(state),
        {
          marginTop: 8,
          padding: 12,
          borderRadius: 16,
          borderWidth: 1.5,
          borderStyle: selected ? 'solid' : 'dashed',
          borderColor: selected ? palette.acc : 'rgba(236,241,238,0.12)',
          backgroundColor: selected ? 'rgba(236,241,238,0.06)' : 'rgba(236,241,238,0.028)',
        },
      ]}
    >
      <View className="flex-row items-center" style={{ gap: 10 }}>
        <View className="flex-1" style={{ minWidth: 0 }}>
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            style={{ fontSize: 15.5, lineHeight: 20 }}
            className="font-medium text-ink"
          >
            {t('Custom')}
          </Text>
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={2}
            style={{ marginTop: 2, fontSize: 13, lineHeight: 17, color: palette.inkFaint }}
          >
            {t('Pick your own three colours')}
          </Text>
        </View>
        {([0, 1, 2] as const).map((index) => (
          <BubblePressable
            key={index}
            onPress={() => onPickDot(index)}
            radius="pill"
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={t('Colour {n}', { n: index + 1 })}
            style={(state) => [
              pressedStyle(state),
              {
                width: 38,
                height: 38,
                borderRadius: radius.pill,
                backgroundColor: colors[index],
                borderWidth: 2,
                borderColor: 'rgba(236,241,238,0.22)',
              },
            ]}
          />
        ))}
      </View>
      <LinearGradient
        colors={[...colors]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ marginTop: 10, height: 30, borderRadius: 10 }}
      />
    </BubblePressable>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The assistant's door. Its dot and its line are the AI's own fixed colours
 * (`tokens.ai`), not the theme's — the footnote above promises the AI keeps
 * its colours so it always stands out, and this row is where that is seen.
 */
function AiSettingsRow({ onPress }: { onPress: () => void }) {
  const t = useT();
  const status = useAi((s) => s.status);
  const ready = status === 'ready';
  const line = ready
    ? t('Google Gemini · ready')
    : status === 'error'
      ? t('Key failed the test')
      : t('Not connected');
  return (
    <GlassSurface tier="card" radius={radius.row} shadow="e1" flat className="mx-lg">
      <BubblePressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${t('AI assistant')}. ${line}`}
        style={(state) => [
          pressedStyle(state),
          {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 14,
            paddingHorizontal: 16,
          },
        ]}
      >
        <View style={{ marginRight: 12 }}>
          <SparkleCircle size={44} />
        </View>
        <View className="flex-1 pr-md">
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ fontSize: 17, lineHeight: 22 }}
            className="font-medium text-ink"
          >
            {t('AI assistant')}
          </Text>
          <View className="mt-[2px] flex-row items-center">
            {ready ? (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  marginRight: 6,
                  backgroundColor: ai.ready,
                }}
              />
            ) : null}
            <Text
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
              style={{ fontSize: 13.5, color: ready ? ai.subline[1] : palette.inkFaint }}
            >
              {line}
            </Text>
          </View>
        </View>
        <Icon name="chevron-right" size={18} color={palette.inkFaint} />
      </BubblePressable>
    </GlassSurface>
  );
}

/**
 * One of the three doors, as a row of the one card.
 *
 * The leading tile is the section's own Material Symbol in a 40 dp lit square —
 * the glyph the nav bar and the Home tile draw for it — which is what makes
 * this list read as the app's map rather than as three more rows. A door inside
 * a section does not get one; there is nothing for it to be a mark of.
 */
/**
 * The switch, and — only while it is on — the badge door with its count. The
 * count is worked out here (`useBadges`), which costs nothing with the switch
 * off: the hook computes nothing then.
 */
function EngagementCard({ onOpenAchievements }: { onOpenAchievements: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const on = useSettings((s) => engagementOn(s));
  const setEngagement = useSettings((s) => s.setEngagement);
  const view = engagementView(on);
  const badges = useBadges();
  return (
    <GlassSurface tier="well" radius={radius.row} flat className="mx-lg">
      <SwitchRow
        label={t('Achievements and levels')}
        hint={t('Off by default. Quiet badges and levels, worked out from your logs.')}
        value={on}
        onChange={setEngagement}
      />
      {view.badges ? (
        <>
          <Separator inset={0} />
          <SectionRow
            label={t('Badges')}
            hint={describeGallery(badges, lang)}
            symbol="task_alt"
            onPress={onOpenAchievements}
          />
        </>
      ) : null}
    </GlassSurface>
  );
}

function SectionRow({
  label,
  hint,
  symbol,
  onPress,
}: {
  label: string;
  hint: string;
  symbol: SymbolName;
  onPress: () => void;
}) {
  return (
    <View>
      <BubblePressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${hint}`}
        style={(state) => [
          pressedStyle(state),
          {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 14,
            paddingHorizontal: 16,
          },
        ]}
      >
        <View
          style={{
            height: 40,
            width: 40,
            marginRight: 12,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 13,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: tint(0.24),
            backgroundColor: tint(0.16),
          }}
        >
          <SpecularEdge color="rgba(236,241,238,0.12)" radius={13} />
          <MaterialSymbol name={symbol} size={22} color={palette.acc} filled />
        </View>
        <View className="flex-1 pr-md" style={{ minWidth: 0 }}>
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
            style={{ fontSize: 17, lineHeight: 22 }}
            className="font-medium text-ink"
          >
            {label}
          </Text>
          <RunningText
            text={hint}
            maxFontSizeMultiplier={1.3}
            fadeColor={FADE_ON.card}
            containerStyle={{ marginTop: 2 }}
            style={{ fontSize: 13.5, lineHeight: 18, color: palette.inkFaint }}
          />
        </View>
        <Icon name="chevron-right" size={18} color={palette.inkFaint} />
      </BubblePressable>
    </View>
  );
}
