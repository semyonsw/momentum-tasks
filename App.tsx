/**
 * App entry — providers, the boundary, the notification handler, and the shell.
 *
 * Everything about WHICH screen is showing lives in `src/navigation/AppShell`;
 * everything about WHAT the data is lives in the stores under `src/state` (the
 * tasks, the settings, the assistant's chats).
 *
 * The side effects set up here are all "make the phone able to reach the user",
 * and every one of them is allowed to fail:
 *
 *   • the notification handler, which decides what a reminder does when it
 *     arrives with the app already on screen
 *   • the Android notification channel, without which a scheduled reminder on
 *     Android 8+ has nowhere to be posted
 *   • the REMINDER SYNC, which makes Android's notification queue match the tasks
 *     that asked to speak. Here rather than in a screen, and silent: a reminder
 *     that cannot be armed — no permission, exact alarms refused — must not
 *     become a dialog in front of somebody who opened the app to tick a task,
 *     and the task's own editor reports it instead.
 *   • the AUTOMATIC BACKUP, which rewrites the day's backup file in the folder the
 *     user granted once, two seconds after any change to the data it carries (and
 *     at once when the app goes to the background with a write still waiting).
 *     Here because it must watch the stores whichever screen is open, and silent
 *     because a backup that cannot write must not become a modal — the Settings
 *     hero reports the age of the last copy instead. `hooks/useAutoBackup.ts`
 *     has the rest.
 *
 * None of them are load-bearing: the tasks on disk are read before the first
 * render whatever any of this does.
 *
 * ── AND THE LAUNCH SCREEN ─────────────────────────────────────────────────
 *
 * `components/LaunchScreen.tsx`, drawn OVER everything else on a cold start: it
 * opens on the native splash's own picture — the green ✓ on the page colour — so
 * the handover from Android's splash to JS is not a cut, and it leaves once the
 * tasks have really loaded (2.3 s at the least, 6 s at the most;
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
import { LaunchScreen } from './src/components/LaunchScreen';
import { AppShell } from './src/navigation/AppShell';
import { LanguageChoiceScreen } from './src/screens/LanguageChoiceScreen';
import { useSettingsHydrated } from './src/hooks/useHydrated';
import { reportRootHeight } from './src/hooks/useKeyboard';
import { useSettings } from './src/state/settingsStore';
import { rgbChannels, themeColors } from './src/lib/theme';
import { applyTheme } from './src/theme/tokens';
import { ensureChannels, requestNotificationPermission } from './src/lib/notify';
import { useAutoBackup } from './src/hooks/useAutoBackup';
import { useReminders } from './src/hooks/useReminders';

/*
 * A reminder always shows, whatever is in front: "Read before sleep" firing at
 * 22:30 while the app happens to be open is still the thing the user asked for,
 * and nothing on screen says it instead.
 *
 * Wrapped because this runs at module scope, before any boundary exists. A throw
 * here would be a crash on launch with no screen to report it on.
 */
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  // Reminders will be silent-but-scheduled, or absent. The tasks are unaffected.
}

/**
 * Whether the launch screen has already played in this JS process. Module scope,
 * so a remount of `App` — a fast refresh, an error boundary recovering — cannot
 * replay it; only a cold start, which is a new process, can.
 */
let launchPlayed = false;

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
    void ensureChannels();
  }, []);

  return (
    <SafeAreaProvider>
      <Reminders />
      <Themed>
        {(themeKey) => (
          <>
            {/*
              Inside the provider, outside the shell: a crash in any screen lands on a
              readable error with a way out, instead of taking the process down — see
              `ErrorBoundary`.

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
  return <AppShell />;
}

/**
 * The reminder sync, mounted with `App` for the same reason the backup is: a
 * reminder the user set has to be armed on every launch, whichever screen is
 * open. `hooks/useReminders.ts` has the rest.
 *
 * A sibling rendering nothing rather than a hook in `App`, because it subscribes
 * to the tasks and the settings — and in `App` every tick of a task re-rendered
 * the whole tree, shell and all, to arm a debounced timer.
 */
function Reminders() {
  useReminders();
  return null;
}
