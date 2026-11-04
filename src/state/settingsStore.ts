/**
 * Settings store — the look, the language, the history's default range, the
 * backup folder and the game layer: everything the user chooses about the app
 * rather than writes into it.
 *
 * Two rules this store follows:
 *
 *  1. EVERY VALUE IS CHECKED ON THE WAY IN (`sanitizeSettings`). A persisted blob
 *     from an older build, a half-finished write, or a field typed by hand into a
 *     backup must never reach a screen as something it cannot draw.
 *  2. IT REHYDRATES TOTAL. `merge` fills every key from `DEFAULT_SETTINGS`, so a
 *     setting added in a later version is never `undefined` on a device that
 *     upgraded rather than installed fresh.
 *
 * ── THE BLOB IS MOMENTUM'S ────────────────────────────────────────────────
 *
 * This app was split out of Momentum at 3.0.0, and the `settings` key on disk —
 * and the `settings` object in a backup — is the one that app wrote, with its
 * rest timers, plates and currency alongside the fields below. Those are read
 * without complaint and dropped: `sanitizeSettings` builds its result from the
 * keys listed here only. Every key it does keep has the name and the shape it
 * had there, so a backup this app writes still opens in Momentum 3.0.0.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_CUSTOM_COLORS,
  DEFAULT_THEME_ID,
  normalizeHex,
  usableCustomColors,
  usableThemeId,
  type ThemeColors,
  type ThemeId,
} from '../lib/theme';
import { usableBackupFile, type BackupFileRecord } from '../lib/autoBackup';
import { usableLanguage, type Language } from '../lib/i18n';
import { TREND_RANGES, type TrendRange } from '../lib/trends';
import { usableEngagement } from '../lib/engagement';

/**
 * How the assistant's entry card is recorded as closed: a list of section names,
 * because Momentum kept one card per section. This app has one card, filed under
 * the name Momentum gave the tasks' card, so a phone that closed it in 3.0.0
 * still has it closed.
 */
const AI_CARD = 'Tasks';

export interface Settings {
  /**
   * Which language the app speaks. Russian by default — see `lib/i18n.ts`.
   *
   * A setting rather than the phone's locale, because the phone's locale is a
   * fact about the phone and this is a fact about the person holding it: the same
   * device is handed to somebody who reads Russian and somebody who does not, and
   * the toggle in the corner of Settings is one tap either way.
   */
  language: Language;

  /**
   * Whether the language above was CHOSEN, or is just the default sitting there.
   *
   * The two are indistinguishable in `language` itself and they mean opposite
   * things: `ru` because the app ships in Russian is a guess, and `ru` because
   * somebody picked РУ on the first screen is an answer. Only the guess earns a
   * question, and the flag is what lets it be asked exactly once — a launch
   * screen that reappears after it has been answered is worse than never asking.
   */
  languageChosen: boolean;

  /* --- appearance: see `lib/theme.ts` -------------------------------- */
  /**
   * Which of the eight presets the app wears, or `custom`. Fintech Lime by
   * default, which is also the colour the icon is exported in.
   */
  themeId: ThemeId;
  /**
   * The three stops Custom uses. Kept while a preset is selected, so switching
   * back to Custom returns the colours somebody picked rather than the defaults.
   */
  customColors: ThemeColors;

  /** Which range the task history opens on. A default, not a lock. */
  tasksTrendRange: TrendRange;

  /* --- automatic backup: see `lib/autoBackup.ts` --------------------- */
  /**
   * Rewrite the backup file after every change, without being asked.
   *
   * ON by default, and inert until a folder is granted — see `autoBackupFolderUri`.
   * The default is on because the alternative default is a year of answered days
   * protected by the user remembering a menu item.
   */
  autoBackupEnabled: boolean;
  /**
   * The SAF tree URI the copies are written into, or absent.
   *
   * Absent is the normal state on a fresh install and it means automatic backup
   * cannot run: Android's only writable-and-durable destination is a folder the
   * user grants, and the app's own sandbox dies with the app — which is one of the
   * events a backup exists to survive.
   */
  autoBackupFolderUri?: string;
  /** When the last backup — automatic or manual — actually landed. */
  lastBackupAt?: string;
  /**
   * The day's backup file — its URI and the day it belongs to — so the next write
   * that day overwrites it in place and the first write of a new day knows which
   * file to retire. SAF reaches files by URI only, so the name alone is not enough.
   * See `lib/autoBackup.ts`. Absent until the first write into the folder.
   */
  autoBackupFile?: BackupFileRecord;

  /* --- the assistant's entry card (U2) ------------------------------- */
  /**
   * `['Tasks']` once the card is gone for good: the ✕ was pressed, or a chat was
   * had. After that the ✦ in the corner is the way in. A list for the reason
   * given at `AI_CARD`; absent means "not closed".
   */
  aiCardsDismissed?: string[];

  /* --- the engagement layer ------------------------------------------- */
  /**
   * "Achievements and levels": the ONE switch behind badges, the level chip and
   * streak freezes. See `lib/engagement.ts`.
   *
   * OPTIONAL `true`, absent = off. Never a stored `false`.
   */
  engagement?: true;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'ru',
  languageChosen: false,
  themeId: DEFAULT_THEME_ID,
  customColors: DEFAULT_CUSTOM_COLORS,
  tasksTrendRange: 'month',
  autoBackupEnabled: true,
  /*
   * Listed, and `undefined`. Rule 2 of this store is that it rehydrates TOTAL —
   * `merge` fills every key from here — so a key that is absent from this object
   * is a key a device that upgraded never gets filled.
   */
  autoBackupFolderUri: undefined,
  lastBackupAt: undefined,
  autoBackupFile: undefined,
  aiCardsDismissed: undefined,
  // Off by default: nothing keeps score unasked.
  engagement: undefined,
};

/**
 * A complete, valid `Settings` from anything at all — including `undefined`.
 *
 * Every field is named explicitly rather than spread through. This function is
 * also `partialize`, so it is handed the LIVE STORE STATE, which carries the
 * action functions alongside the values: a spread would put `setTheme` and
 * friends into the object written to disk. Listing the keys keeps the result
 * exactly `Settings` — and is what drops the keys Momentum kept for the training
 * and the money.
 */
export function sanitizeSettings(input: Partial<Settings> | undefined | null): Settings {
  const raw: Settings = { ...DEFAULT_SETTINGS, ...(input ?? {}) };
  return {
    language: usableLanguage(raw.language),
    languageChosen: raw.languageChosen === true,
    themeId: usableThemeId(raw.themeId),
    customColors: usableCustomColors(raw.customColors),
    tasksTrendRange: usableRange(raw.tasksTrendRange),
    autoBackupEnabled: raw.autoBackupEnabled !== false,
    autoBackupFolderUri: usableFolderUri(raw.autoBackupFolderUri),
    lastBackupAt: usableInstant(raw.lastBackupAt),
    autoBackupFile: usableBackupFile(raw.autoBackupFile),
    aiCardsDismissed: usableCardList(raw.aiCardsDismissed),
    // Only a literal `true` is on, so junk and an old blob both read as off.
    engagement: usableEngagement(raw.engagement),
  };
}

/** A folder URI that could plausibly have been granted, or undefined. */
function usableFolderUri(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** A parseable instant, or undefined — a `NaN` date would make every backup due. */
function usableInstant(value: unknown): string | undefined {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
}

/** A trend range this build knows, or the middle one. */
function usableRange(value: unknown): TrendRange {
  return TREND_RANGES.includes(value as TrendRange) ? (value as TrendRange) : 'month';
}

/** `['Tasks']` if the card was closed, otherwise absent — see `aiCardsDismissed`. */
function usableCardList(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.includes(AI_CARD) ? [AI_CARD] : undefined;
}

/** Whether the assistant's entry card has been closed for good. */
export function aiCardDismissed(settings: Pick<Settings, 'aiCardsDismissed'>): boolean {
  return (settings.aiCardsDismissed ?? []).includes(AI_CARD);
}

interface SettingsState extends Settings {
  /**
   * The one write behind the РУ / EN toggle in the corner of Settings, and
   * behind the first-launch picker.
   *
   * Writing a language ALWAYS answers the question, whichever control did it:
   * somebody who reaches the toggle in Settings has plainly made a choice, and
   * asking them again on the next launch would be the app not listening.
   */
  setLanguage: (language: Language) => void;
  /** Wear a preset. */
  setTheme: (themeId: ThemeId) => void;
  /** Change one of Custom's three dots — which also SELECTS Custom. */
  setCustomColor: (index: 0 | 1 | 2, hex: string) => void;
  setTasksTrendRange: (range: TrendRange) => void;

  /* --- automatic backup: see `lib/autoBackup.ts` --------------------- */
  setAutoBackupEnabled: (enabled: boolean) => void;
  /** Remember the granted folder. `undefined` forgets it, which turns backup off. */
  setAutoBackupFolder: (folderUri: string | undefined) => void;
  /**
   * Record that a backup landed, and which file it is now in.
   *
   * Called by every write — the automatic one, `Back up now` and `Export
   * everything` all go through `runBackupNow` — so "last backup" means the last
   * time the data actually left the phone, whoever asked for it. Neither field is
   * watched by the automatic backup (`lib/backupWatch.ts`), which is what stops a
   * write recording itself from asking for another write.
   */
  recordBackup: (at: string, file?: BackupFileRecord) => void;

  /** Hide the assistant's entry card for good (U2). */
  dismissAiCard: () => void;

  /** The game layer's one switch. Off writes nothing (the key goes absent). */
  setEngagement: (on: boolean) => void;

  /** `Reset every setting` — see the comment at the action. */
  resetToDefaults: () => void;
  /**
   * Replace every setting from a restored backup.
   *
   * Takes `unknown` and leans on `sanitizeSettings`, which is total: a backup
   * missing a field added in a later build gets that field's default.
   */
  importSettings: (raw: unknown) => void;
}

/** Set by the persist error callback below — declared first so it exists by then. */
let settingsReadFailed = false;
const readFailedListeners = new Set<() => void>();

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,

      setLanguage: (language) => set({ language: usableLanguage(language), languageChosen: true }),

      setTheme: (themeId) => set({ themeId: usableThemeId(themeId) }),

      setCustomColor: (index, hex) => {
        const next = [...get().customColors] as string[];
        next[index] = normalizeHex(hex) ?? next[index];
        set({ themeId: 'custom', customColors: usableCustomColors(next) });
      },

      setTasksTrendRange: (tasksTrendRange) => set({ tasksTrendRange }),

      setAutoBackupEnabled: (autoBackupEnabled) => set({ autoBackupEnabled }),

      setAutoBackupFolder: (folderUri) => {
        const next = usableFolderUri(folderUri);
        /*
         * The day's file belongs to a folder. Pointing somewhere else makes that
         * URI a file in the old folder, and overwriting or deleting it would be
         * wrong — the new folder gets its own file on the next write. Re-granting
         * the SAME folder (access was lost and the user picked it again) keeps it,
         * so the next write overwrites that file rather than creating a twin.
         */
        set(
          next === get().autoBackupFolderUri
            ? { autoBackupFolderUri: next }
            : { autoBackupFolderUri: next, autoBackupFile: undefined },
        );
      },

      recordBackup: (at, file) => {
        const stamp = usableInstant(at) ?? new Date().toISOString();
        const record = usableBackupFile(file);
        set(record ? { lastBackupAt: stamp, autoBackupFile: record } : { lastBackupAt: stamp });
      },

      dismissAiCard: () => set({ aiCardsDismissed: [AI_CARD] }),

      setEngagement: (on) => set({ engagement: usableEngagement(on) }),

      resetToDefaults: () =>
        /*
         * The granted folder and the record of the last backup are NOT settings in
         * the sense this button means: resetting them would be a folder permission
         * the user has to grant again, for nothing.
         *
         * THE LANGUAGE IS THE SAME KIND OF EXCEPTION, and it is the sharpest one.
         * Defaulting it would flip the app to Russian under somebody who just
         * pressed a button in English — and defaulting `languageChosen` with it
         * would drop them onto the first-launch picker, which is a launch screen
         * arriving in the middle of a session. The РУ / EN toggle is right there.
         */
        set({
          ...DEFAULT_SETTINGS,
          language: get().language,
          languageChosen: get().languageChosen,
          // Appearance is not what "every switch and default" means either.
          themeId: get().themeId,
          customColors: get().customColors,
          autoBackupFolderUri: get().autoBackupFolderUri,
          lastBackupAt: get().lastBackupAt,
          autoBackupFile: get().autoBackupFile,
          // A card the user closed is not a switch; a reset is no reason for it
          // to come back.
          aiCardsDismissed: get().aiCardsDismissed,
        }),

      importSettings: (raw) =>
        set({ ...sanitizeSettings(raw as Partial<Settings> | undefined | null) }),
    }),
    {
      name: 'settings',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      /*
       * Actions are recreated by the initializer on every launch; only the values
       * are worth writing to disk, and writing the functions would break the
       * JSON round-trip.
       */
      partialize: (state) => sanitizeSettings(state),
      merge: (persisted, current) => ({
        ...current,
        ...sanitizeSettings(persisted as Partial<Settings> | undefined),
      }),
      /*
       * A read that FAILS (storage error, a blob that is not JSON) never marks the
       * store hydrated, and never fires `onFinishHydration` — and the root waits
       * on exactly that, so the app was a blank screen on every launch with no
       * way out but clearing its data. Say it failed, and let the root go on
       * with the defaults.
       */
      onRehydrateStorage: () => (_state, error) => {
        if (error == null) return;
        settingsReadFailed = true;
        for (const listener of [...readFailedListeners]) listener();
      },
    },
  ),
);

/** Whether reading the settings from disk failed this launch. */
export function settingsHydrationFailed(): boolean {
  return settingsReadFailed;
}

/** Called once if the settings read fails; returns the unsubscribe. */
export function onSettingsHydrationFailed(listener: () => void): () => void {
  readFailedListeners.add(listener);
  return () => readFailedListeners.delete(listener);
}

/** The settings as a plain object — what a backup carries. */
export function currentSettings(): Settings {
  return sanitizeSettings(useSettings.getState());
}
