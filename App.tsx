/**
 * App entry — providers, the boundary, the notification handler, and the shell.
 *
 * ── ONE ENTRY, THREE APPS (3.0) ───────────────────────────────────────────
 *
 * This file is the entry of the Workout, Tasks and Expenses APKs alike
 * (`lib/appVariant.ts`), and the background work below is mounted only in the
 * app it belongs to — `mountsFor` in `lib/appEntry.ts` decides, so the rule is
 * tested for all three without a build. The session clock, the history re-read
 * and migration are the training log's, so Workout's; the budget alerts are the
 * money's, so Expenses'. The reminder sync runs everywhere and decides inside
 * `useReminders` which reminders are this app's. Backups and notifications are
 * every app's. Mounting them all everywhere would have been wasteful at best —
 * and at worst the Workout app, which still holds the old money on disk,
 * raising a budget alert for an app the user is not in.
 *
 * Everything about WHICH screen is showing lives in `src/navigation/AppShell`;
 * everything about WHAT the data is lives in the three stores under `src/state`
 * (the library and routines, the settings, the finished workouts).
 *
 * That paragraph used to end "swap those for SQLite queries and neither this file
 * nor any screen below it changes". As of 0.12.0 the finished workouts DID move to
 * SQLite (`src/state/historyDb.ts`) and the claim held: no screen changed, and the
 * only line this file gained is the one below that brings the old AsyncStorage log
 * across. The other two stores are a few dozen rows and stay where they are.
 *
 * The side effects set up here are all "make the phone able to reach the user" —
 * plus, now, one storage migration — and every one of them is allowed to fail:
 *
 *   • the notification handler, which decides what a timer alert does when it
 *     arrives with the app already on screen
 *   • the Android notification channels, without which a scheduled alert on
 *     Android 8+ has no sound, no vibration, and nothing the user can tune — and
 *     which is where the app's own two tones are attached, because on Android the
 *     sound belongs to the channel and not to the notification
 *   • the audio session, so the countdown's beeps play over their music and
 *     through a silent switch
 *   • the HISTORY RE-READ, which gives the log a second chance to load from a point
 *     where every native module is up — see the note on it below, and
 *     `workoutHistoryStore.loadWorkouts`
 *   • the HISTORY MIGRATION, which brings a log written by 0.10.0 or earlier out of
 *     AsyncStorage and into the database. It runs once, it never deletes the old
 *     key, and it stays quiet either way: a migration that could not run tries
 *     again next launch, and a dialog on launch about a storage system the user has
 *     never heard of is worse than a History tab that fills itself in tomorrow.
 *   • the REMINDER SYNC, which makes Android's notification queue match the tasks
 *     that asked to speak and the workout schedule. Also here rather than in a
 *     screen, and also silent: a reminder that cannot be armed — no permission,
 *     exact alarms refused — must not become a dialog in front of somebody who
 *     opened the app to train, and the settings screen reports it instead.
 *   • the AUTOMATIC BACKUP, which rewrites the day's backup file in the folder the
 *     user granted once, two seconds after any change to the data it carries (and
 *     at once when the app goes to the background with a write still waiting).
 *     Here because it must watch the stores whichever screen is open, and silent
 *     because a backup that cannot write must not become a modal in front of
 *     somebody who opened the app to train — the Settings hero reports the age of
 *     the last copy instead. `hooks/useAutoBackup.ts` has the rest.
 *
 * None of them are load-bearing: the on-screen pill derives from a stored
 * deadline and is correct whether or not any of this works, and the log already on
 * disk is read synchronously before the first render whatever the migration does.
 *
 * ── AND THE LAUNCH SCREEN ─────────────────────────────────────────────────
 *
 * `components/LaunchScreen.tsx`, drawn OVER everything else on a cold start: it
 * opens on the native splash's own picture — the green ✓ on the page colour — so
 * the handover from Android's splash to JS is not a cut, and it leaves once the
 * store this app is built on has really loaded (2.3 s at the least, 6 s at the most;
 * `lib/launchReady.ts`). The app renders UNDER it from the first frame, so by
 * the time it dissolves the screen behind it is already there. It is keyed to
 * this JS process, not to the app coming to the foreground: a resume never shows
 * it.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { vars } from 'nativewind';

import './global.css';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { DebriefHost } from './src/components/DebriefSheet';
import { LaunchScreen } from './src/components/LaunchScreen';
import { AppShell } from './src/navigation/AppShell';
import { LanguageChoiceScreen } from './src/screens/LanguageChoiceScreen';
import { useSettingsHydrated } from './src/hooks/useHydrated';
import { reportRootHeight } from './src/hooks/useKeyboard';
import { useSettings } from './src/state/settingsStore';
import { prepareAudio } from './src/lib/beeper';
import { rgbChannels, themeColors } from './src/lib/theme';
import { APP_VARIANT } from './src/lib/appVariant';
import { mountsFor } from './src/lib/appEntry';
import { applyTheme } from './src/theme/tokens';
import {
  REMINDER_KIND,
  BUDGET_KIND,
  dismissTimerAlerts,
  ensureTimerChannels,
  notificationKind,
  requestNotificationPermission,
} from './src/lib/notify';
import { migrateHistoryIfNeeded, useWorkoutHistory } from './src/state/workoutHistoryStore';
import { useAutoBackup } from './src/hooks/useAutoBackup';
import { useAutoRounds } from './src/hooks/useAutoRounds';
import { useReminders } from './src/hooks/useReminders';
import { useBudgetAlerts } from './src/hooks/useBudgetAlerts';
import { useTimerAlerts } from './src/hooks/useTimerAlerts';
import { useSetTimerCommit } from './src/hooks/useSetTimerCommit';

/*
 * Timer alerts — rest ending, and the bell on a timed hold.
 *
 * The alert is a BACKUP for a phone that isn't being looked at, so it stays
 * silent while the app is in the foreground: the pill already counted the last
 * seconds out loud and buzzed at zero, and adding the notification's own sound on
 * top of that is the same event announced twice — which is heard as the countdown
 * beeping more times than it counted.
 *
 * Backgrounded, it is the only thing that can reach the user, so it gets the
 * banner, the sound, and a place in the shade (`shouldShowList` was false for
 * both states, which on a phone where the handler runs with the app in the
 * background left the alert as a banner that vanished — a rest-over nobody
 * could find once they looked down).
 *
 * A REMINDER IS NOT A TIMER. It used to go through the same rule, so "Read
 * before sleep" firing at 22:30 while the app happened to be open was swallowed
 * whole — no banner, no list entry, nothing. Nothing on screen said it either:
 * the pill only counts rests. So a reminder always shows, whatever is in front.
 *
 * Wrapped because this runs at module scope, before any boundary exists. A throw
 * here would be a crash on launch with no screen to report it on.
 */
try {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const kind = notificationKind(notification.request.content.data);
      // A budget alert (M1) is a message too, raised by a save made in the app.
      const reminder = kind === REMINDER_KIND || kind === BUDGET_KIND;
      const foreground = AppState.currentState === 'active';
      const show = reminder || !foreground;
      return {
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: show,
        shouldSetBadge: false,
      };
    },
  });
} catch {
  // Alerts will be silent-but-scheduled, or absent. The pill is unaffected.
}

/**
 * Whether the launch screen has already played in this JS process. Module scope,
 * so a remount of `App` — a fast refresh, an error boundary recovering — cannot
 * replay it; only a cold start, which is a new process, can.
 */
let launchPlayed = false;

/** What this app mounts in the background — see `lib/appEntry.ts`. */
const MOUNTS = mountsFor(APP_VARIANT);

export default function App() {
  const [launching, setLaunching] = useState(() => !launchPlayed);
  useEffect(() => {
    launchPlayed = true;
  }, []);

  /*
   * Mounted here, at the top, rather than inside a screen: it watches the stores
   * for the whole session, on the days the user never opens Settings, which is
   * all of them.
   */
  useAutoBackup();

  useEffect(() => {
    void requestNotificationPermission();
    void ensureTimerChannels();
    // Warmed here rather than on the first beep, so 0:05 of a plank isn't where
    // the audio session gets configured.
    void prepareAudio();
    /*
     * READ THE LOG AGAIN, now that React is running.
     *
     * The log is read once at module scope, during bundle evaluation, so that
     * History does not flicker from empty to full on every launch — see
     * `historyDb.ts`. The cost of reading it that early is that it is the one
     * moment a native module may not be ready: a release build resolves its
     * TurboModules lazily, nothing has mounted, and if the open throws there is
     * nobody to tell. The store caught that throw and started empty, which is
     * indistinguishable on screen from having never trained.
     *
     * This is the second attempt, from a point where that cannot happen — and
     * only when the first one failed. On a launch where it worked, re-reading
     * every row, re-parsing every workout and handing the store a new array that
     * equals the old one re-rendered every history subscriber and re-ran every
     * overload verdict in the middle of the launch animation, to learn nothing.
     */
    if (MOUNTS.history && useWorkoutHistory.getState().loadFailed) {
      useWorkoutHistory.getState().reloadHistory();
    }
    /*
     * Once, on the first launch after upgrading. In an effect rather than at module
     * scope because it is async and it touches two storage systems, and a side
     * effect that size hiding inside an import is how a launch crash becomes hard
     * to place. Only the Workout app has a 0.10-era log to bring across: it is the
     * one install that ever ran 0.10.
     */
    if (MOUNTS.history) void migrateHistoryIfNeeded();

    /*
     * Back in front: the timer alerts in the shade are stale news — the session
     * on screen already says the rest is over. See `dismissTimerAlerts`.
     */
    void dismissTimerAlerts();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void dismissTimerAlerts();
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      {MOUNTS.reminders ? <Reminders /> : null}
      {MOUNTS.budgetAlerts ? <BudgetAlerts /> : null}
      <Themed>
        {(themeKey) => (
          <>
            {/*
              Inside the provider, outside the shell: a crash in any screen lands on a
              readable error with a way out, instead of taking the process down. The
              session is persisted, so without this a crash on the logging screen
              repeats on every launch — see `ErrorBoundary`.

              KEYED ON THE THEME. Every colour in the app is read from the tokens at
              render time (`theme/tokens.ts`), so a new theme is a remount of the
              tree under this line and nothing else. The launch is outside the key,
              so the one moment the theme changes on its own — settings hydrating
              under the launch mark — does not restart the mark.
            */}
            <View
              key={themeKey}
              className="flex-1"
              onLayout={(event) => reportRootHeight(event.nativeEvent.layout.height)}
            >
              <ErrorBoundary>
                <Root />
              </ErrorBoundary>
            </View>
            {launching ? <LaunchScreen onDone={() => setLaunching(false)} /> : null}
          </>
        )}
      </Themed>
    </SafeAreaProvider>
  );
}

/**
 * The theme, poured into the two places colour is read from: the token getters
 * (`applyTheme`) and NativeWind's CSS variables (`vars`), so `text-green-bright`
 * and `palette.greenBright` can never disagree about what the accent is.
 *
 * `applyTheme` runs during render, inside the memo, on purpose: it has to have
 * happened before any child reads a token, and an effect would run after.
 */
function Themed({ children }: { children: (themeKey: string) => ReactNode }) {
  const themeId = useSettings((s) => s.themeId);
  const customColors = useSettings((s) => s.customColors);
  const { themeKey, cssVars } = useMemo(() => {
    const colors = themeColors(themeId, customColors);
    const theme = applyTheme(colors);
    return {
      themeKey: `${themeId}:${colors.join(',')}`,
      cssVars: vars({
        '--green-wash': rgbChannels(theme.wash),
        '--green-dim': rgbChannels(theme.dim),
        '--green': rgbChannels(theme.c2),
        '--green-bright': rgbChannels(theme.acc),
        '--acc': rgbChannels(theme.acc),
        '--on-acc': rgbChannels(theme.onAcc),
        '--c1': rgbChannels(theme.c1),
        '--c2': rgbChannels(theme.c2),
        '--c3': rgbChannels(theme.c3),
      }),
    };
  }, [themeId, customColors]);
  return (
    <View className="flex-1 bg-bg" style={cssVars}>
      {children(themeKey)}
    </View>
  );
}

/**
 * The language question, then the app.
 *
 * Its own component rather than a branch in `App`, because the branch has to
 * re-render when the store hydrates and when the language is answered — and
 * `App` is where the launch effects live, which must run once and not again.
 *
 * NOTHING until the store has been read: the picker's whole correctness rests on
 * `languageChosen`, and that flag reads false for a frame or two on every launch
 * while `persist` is still reading from disk (`useSettingsHydrated`). A bare
 * background for those two frames is the app's own colour, so it reads as the
 * splash rather than as a blank screen.
 *
 * ── IT IS A LAUNCH SCREEN, SO IT ONLY EVER APPEARS AT LAUNCH ──────────────
 *
 * The question is asked because of what was on disk when the app opened, and
 * that answer is latched the moment hydration finishes. Reading the flag live
 * instead would let it go false again mid-session — importing a backup written
 * before the picker existed does exactly that — and a launch screen arriving on
 * top of somebody who is three taps into Settings is worse than asking them
 * again next time they open the app, which is what latching gets us.
 */
function Root() {
  const hydrated = useSettingsHydrated();
  /** Null until hydration; then fixed for the life of this launch. */
  const [asking, setAsking] = useState<boolean | null>(null);

  useEffect(() => {
    if (hydrated) setAsking((current) => current ?? !useSettings.getState().languageChosen);
  }, [hydrated]);

  const chosen = useSettings((s) => s.languageChosen);

  if (!hydrated || asking === null) return <View className="flex-1 bg-bg" />;
  // `chosen` is still read live, for the one transition that has to be instant:
  // the tap on the picker itself.
  if (asking && !chosen) return <LanguageChoiceScreen />;
  return (
    <>
      {MOUNTS.sessionClock ? <SessionClock /> : null}
      <AppShell />
      {/* Above the shell, so it outlives whichever route is on top. */}
      <DebriefHost />
    </>
  );
}

/**
 * The reminder sync, mounted with `App` for the same reason the backup is: a
 * reminder the user set has to be armed on the launches where they never open
 * the tasks section, which is most of them. `hooks/useReminders.ts` has the rest.
 *
 * A sibling rendering nothing rather than a hook in `App`, because it subscribes
 * to the tasks and the settings — and in `App` every tick of a task re-rendered
 * the whole tree, shell and all, to arm a debounced timer.
 */
function Reminders() {
  useReminders();
  return null;
}

/**
 * The budget alerts (M1), mounted beside the reminders for the same reason: an
 * amount saved anywhere — the keypad, a confirmed recurring payment — can be
 * the one that crosses 80%. Off unless a budget opted in. Expenses only: the
 * Workout app keeps the old money on disk, and an alert about it would be for
 * an app the user is not in.
 */
function BudgetAlerts() {
  useBudgetAlerts();
  return null;
}

/**
 * The parts of a running workout that must not depend on which screen is up.
 *
 * The shell renders only the top of its stack, so anything mounted inside the
 * session screen stops the moment `Add an exercise` is pushed over it or the user
 * backs out to the section mid-rest. Two things cannot afford that: the pocket alarms
 * (`useTimerAlerts`), the boxing round chain (`useAutoRounds`) and the bell that
 * logs a countdown set (`useSetTimerCommit`) — all read the store and the clock
 * and nothing on screen. A sibling rendering nothing rather
 * than hooks inside `AppShell`, so a rest starting re-renders this and not the
 * whole app.
 */
function SessionClock() {
  useTimerAlerts();
  useAutoRounds();
  useSetTimerCommit();
  return null;
}
