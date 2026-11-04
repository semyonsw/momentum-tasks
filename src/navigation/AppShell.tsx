/**
 * AppShell — the tasks, Settings, and a stack.
 *
 *   tab:   Tasks | Settings
 *   stack: tasksHistory · taskDetail · taskSettings · wrapped · achievements
 *          · aiSettings · aiChat
 *
 * ── THE TASKS ARE THE LANDING ─────────────────────────────────────────────
 *
 * The app opens on the day's tasks, Back on them arms the exit, and Settings is
 * the only other root. Everything else is pushed over a root and popped off it.
 *
 * ── A LOG'S PAST IS NOT A SECTION ──────────────────────────────────────────
 *
 * The tasks carry a ⟲ in their corner that pushes their own history — the month
 * grid, the habit line, the year — rather than a root of its own: it is the past
 * of the one log, not a second thing to switch to.
 *
 * ── THE BAR IS THE ONE WAY BETWEEN THEM ────────────────────────────────────
 *
 * A horizontal swipe used to step along the bar too, with the screen following
 * the finger. It was removed: the finger's offset reached the screen over the
 * JS thread, so the drag trembled whenever anything rendered, and the one thing
 * it saved — a reach to the bottom edge — the bar already does in one tap. The
 * order still lives in `lib/sectionNav.ts`, which is what makes a slide go the
 * way the blob does.
 *
 * Why not a router library: the app has two roots and a handful of pushable
 * screens, none of them deep-linked, none of them needing URL state.
 * `expo-router` would add a dependency, a file-system convention and a navigator
 * config to express a `Route[]` and two functions. When deep links or a native
 * back-stack are actually needed, every screen below this file is already a
 * plain component taking props and callbacks — they port without edits.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { BackHandler, Text, View } from 'react-native';
import { runOnJS, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

import { BlurGate, Toast, type ToastAction } from '../components/glass';
import { isOverlayOpen } from '../components/overlay';
import { PrimaryButton } from '../components/primitives';
import { NavBar } from '../components/NavBar';
import { SettingsHomeScreen } from '../screens/SettingsHomeScreen';
import { AchievementsScreen } from '../screens/AchievementsScreen';
import { WrappedScreen } from '../screens/WrappedScreen';
import type { WrappedPeriod } from '../lib/wrapped';
import { Hold } from './Hold';
import { ShellStage, TRANSITION_MS, type ShellTransition } from './ShellStage';
import { PushHost } from './PushHost';
import { mayLeave } from './leaveGuard';
import { TaskSettingsScreen } from '../screens/TaskSettingsScreen';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { TasksHistoryScreen } from '../screens/TasksHistoryScreen';
import { AiChatScreen } from '../screens/AiChatScreen';
import { AiSettingsScreen } from '../screens/AiSettingsScreen';
import { applyChanges } from '../state/aiActions';
import { useAi } from '../state/aiStore';
import { useTasks } from '../state/tasksStore';
import { useT } from '../hooks/useT';
import { useToday } from '../hooks/useToday';
import { ROOT, backAction, slideDir, type SectionTab, type ShellRoute } from '../lib/sectionNav';
import type { ID } from '../types/models';

/** Screens pushed on top of a tab. */
type Route =
  /* The tasks' own past, pushed by the ⟲ in their corner. */
  | { name: 'tasksHistory' }
  /* X1: a month or a year of the log, pushed from the foot of the history. */
  | { name: 'wrapped'; period: WrappedPeriod }
  /* The tasks' settings, pushed from Settings and from the history's foot. */
  | { name: 'taskSettings' }
  /* E1: the badge gallery, from Settings and the level sheet. */
  | { name: 'achievements' }
  | { name: 'taskDetail'; taskId: ID }
  /* The assistant. Settings is reached from the sparkle when no key is
     connected, and carries the question along so that passing the test lands
     on the chat with it asked. */
  | { name: 'aiSettings'; fromTasks?: boolean; prompt?: string }
  | { name: 'aiChat'; prompt?: string };

/**
 * Where the shell was standing, outside React. The tree remounts when the theme
 * changes (`App.tsx`), and this is what lands it back on the same screen rather
 * than on the tasks — see `route` in the shell.
 */
const remembered: { route: ShellRoute } = { route: ROOT };

/** How long a toast with an Undo stays: long enough to read and reach. */
const UNDO_TOAST_MS = 4500;

export function AppShell() {
  const t = useT();
  /**
   * What the last commit said, for about two seconds.
   *
   * It lives HERE and not in the screen that raised it, because the whole point
   * of it is that it appears over the screen you land BACK on: a toast rendered
   * by a component that has just unmounted is a toast nobody sees.
   */
  const [toast, setToastState] = useState<{
    text: string;
    key: number;
    action?: ToastAction;
  } | null>(null);
  /* Keyed, so a second toast with the same words still replays its entrance. */
  const setToast = useCallback(
    (text: string, action?: ToastAction) => setToastState({ text, key: Date.now(), action }),
    [],
  );
  useEffect(() => {
    if (toast == null) return undefined;
    const timer = setTimeout(() => setToastState(null), toast.action ? UNDO_TOAST_MS : 1900);
    return () => clearTimeout(timer);
  }, [toast]);
  /**
   * Where the shell is: the tasks or Settings.
   *
   * Seeded from module scope rather than a constant, because the tree under
   * `App.tsx` REMOUNTS when the theme changes — and a theme is chosen in
   * Settings, where the user should still be standing when the colours land.
   */
  const [route, setRoute] = useState<ShellRoute>(() => remembered.route);
  useEffect(() => {
    remembered.route = route;
  }, [route]);
  const [transition, setTransition] = useState<ShellTransition | null>(null);
  const progress = useSharedValue(0);
  const covered = useSharedValue(0);
  const [rootsVisible, setRootsVisible] = useState(true);
  /**
   * A past day the user has WALKED TO in the tasks, or null for today.
   *
   * Held here and not in `TasksScreen` because the month grid — the one control
   * that makes walking back three weeks one tap instead of twenty-one — is a
   * PUSHED screen, and a day picked in it has to outlive the screen that picked
   * it. Everything else about the tasks belongs to the store.
   *
   * NULL RATHER THAN TODAY'S KEY, and it is not a detail. A stored `2026-09-13`
   * would go stale in two ways: the app left open past midnight would keep
   * offering yesterday's circles to tick, and coming back to the tasks days
   * later would land on whatever day was last read rather than on today. Null is
   * "follow the clock", so both answer themselves, and `navigate` below drops
   * the pin on the way out to Settings — leave the tasks, come back to today.
   */
  const [pinnedTaskDay, setPinnedTaskDay] = useState<string | null>(null);
  /* STATE, not `dayKey(new Date())` inline: "follow the clock" only follows it
     if something re-renders when the date turns. See `hooks/useToday.ts`. */
  const today = useToday();
  const taskDay = pinnedTaskDay ?? today;
  const [stack, setStack] = useState<Route[]>([]);

  /* The assistant: whether a key has passed its test. */
  const aiReady = useAi((s) => s.status) === 'ready';

  /* Read here only where a PUSHED route needs to resolve its subject. */
  const tasks = useTasks((s) => s.tasks);

  const push = useCallback((next: Route) => setStack((s) => [...s, next]), []);
  /**
   * Swap the top of the stack for another route: the AI settings' ready screen
   * becomes the chat, and a chat drops its question once asked, so back lands
   * where the trip began.
   */
  const replaceTop = useCallback(
    (next: Route) => setStack((s) => (s.length === 0 ? [next] : [...s.slice(0, -1), next])),
    [],
  );
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);

  /**
   * Changing root, by the bar or back — the one path, so neither can leave
   * different state behind.
   *
   * It does one thing beyond changing the route: LEAVING the tasks unpins the
   * day. Walking back to last Tuesday is a thing you do inside the tasks, not a
   * place you want the app to still be sitting in the next time you open it.
   * Pushing a screen (the month grid, a task's own screen) is not leaving, so
   * the pin survives the trip that sets it.
   */
  const navigate = useCallback(
    (next: ShellRoute) => {
      if (next === route) return;
      if (route === 'Tasks') setPinnedTaskDay(null);
      /* The way the bar's blob goes. */
      setTransition({ kind: 'slide', from: route, to: next, dir: slideDir(route, next) });
      setRoute(next);
    },
    [route],
  );
  /*
   * The transition starts when it is ON STAGE, not when it is asked for: a
   * clock started in `navigate` would run while the incoming root rendered, and
   * a slow render ate the first part of the 640 ms.
   */
  useLayoutEffect(() => {
    if (!transition) return;
    progress.value = 0;
    progress.value = withTiming(
      1,
      { duration: TRANSITION_MS, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(setTransition)(null);
      },
    );
  }, [progress, transition]);
  /** A root by name, from the nav bar. */
  const selectTab = useCallback((next: SectionTab) => navigate(next), [navigate]);

  /** X1: Wrapped goes on top of wherever it was opened, and ✕ / Back come back there. */
  const openWrapped = useCallback(
    (period: WrappedPeriod) => push({ name: 'wrapped', period }),
    [push],
  );

  /**
   * Leaving the top screen, by either route out of it.
   *
   * Declared before the back handler so hardware back and the `‹` chevron go
   * through the SAME path — otherwise the two gestures leave different state
   * behind, which is the kind of difference nobody finds until it has already lost
   * something.
   */
  const leaveTop = useRef<() => void>(pop);
  leaveTop.current = () => {
    // A screen with unsaved edits asks first — see `navigation/leaveGuard.ts`.
    if (!mayLeave()) return;
    pop();
  };

  /*
   * ANDROID BACK, in the design's order (`lib/sectionNav.backAction`): a sheet
   * closes itself — overlays register their own handler, later and so first —
   * then a pushed screen pops, then Settings goes back to the tasks, and the
   * tasks ask for a second press within two seconds before they let the app go.
   *
   * Registered ONCE, at mount, so it is always the earliest listener and every
   * sheet registered after it gets the press first.
   */
  const exitArmedAt = useRef<number | null>(null);
  const backState = useRef({ depth: stack.length, route });
  backState.current = { depth: stack.length, route };
  const goRootRef = useRef<() => void>(() => {});
  goRootRef.current = () => navigate(ROOT);
  const armExitRef = useRef<() => void>(() => {});
  armExitRef.current = () => setToast(t('Press back again to exit'));
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const action = backAction({
        sheetOpen: isOverlayOpen(),
        stackDepth: backState.current.depth,
        route: backState.current.route,
        exitArmedAt: exitArmedAt.current,
        now: Date.now(),
      });
      if (action === 'closeSheet') return true;
      if (action === 'pop') leaveTop.current();
      else if (action === 'root') goRootRef.current();
      else if (action === 'armExit') {
        exitArmedAt.current = Date.now();
        armExitRef.current();
      } else {
        BackHandler.exitApp();
      }
      return true;
    });
    return () => sub.remove();
  }, []);

  /**
   * The sparkle or a chip. With a key that passed its test it opens the chat —
   * asking the chip's question, if a chip was tapped. Without one it opens the
   * AI settings, carrying the question along, so the test's ready screen can
   * finish the trip the user started.
   */
  const openAi = useCallback(
    (prompt?: string) => {
      if (useAi.getState().status === 'ready') push({ name: 'aiChat', prompt });
      else push({ name: 'aiSettings', fromTasks: true, prompt });
    },
    [push],
  );

  /* ------------------------------------------------------------------ */
  /* Pushed screens                                                      */
  /* ------------------------------------------------------------------ */

  /*
   * One route, as its screen. A function rather than early returns, because
   * the stack is drawn OVER the roots (`PushHost`) and the screen under the
   * top one is rendered too while it peeks out of a push or an edge drag.
   */
  const renderPushed = (top: Route | null): ReactNode => {
    if (top?.name === 'wrapped') {
      return <WrappedScreen period={top.period} onClose={pop} />;
    }

    if (top?.name === 'aiSettings') {
      const prompt = top.prompt;
      return (
        <AiSettingsScreen
          fromTasks={top.fromTasks}
          onBack={pop}
          /* The ready screen's button: the settings screen is REPLACED by the
             chat, so back from the chat lands where the trip began. */
          onOpenChat={() => replaceTop({ name: 'aiChat', prompt })}
        />
      );
    }

    if (top?.name === 'aiChat') {
      return (
        <View className="flex-1">
          <AiChatScreen
            prompt={top.prompt}
            /* Dropped from the route once sent, so coming back does not ask it
             a second time. */
            onPromptSent={() => replaceTop({ name: 'aiChat' })}
            onBack={pop}
            onApplyChanges={(messageId) => {
              const applied = applyChanges(messageId);
              if (applied) setToast(applied.message, { label: t('Undo'), onPress: applied.undo });
            }}
            onToast={setToast}
          />
          {toast ? (
            <Toast key={toast.key} label={toast.text} action={toast.action} bottom={132} />
          ) : null}
        </View>
      );
    }

    if (top?.name === 'taskSettings') {
      return (
        <View className="flex-1">
          <TaskSettingsScreen onBack={pop} onToast={setToast} />
          {/* The pause's Undo (T3): the tab root's toast is not on screen here. */}
          {toast ? <Toast key={toast.key} label={toast.text} action={toast.action} /> : null}
        </View>
      );
    }

    if (top?.name === 'achievements') {
      return <AchievementsScreen onBack={pop} />;
    }

    if (top?.name === 'taskDetail') {
      const task = tasks.find((row) => row.id === top.taskId);
      if (!task) return <Fallback onBack={pop} />;
      return (
        <View className="flex-1">
          <TaskDetailScreen task={task} onBack={pop} onToast={setToast} />
          {/* The pause's Undo (T3), over this pushed screen. */}
          {toast ? <Toast key={toast.key} label={toast.text} action={toast.action} /> : null}
        </View>
      );
    }

    if (top?.name === 'tasksHistory') {
      return (
        <TasksHistoryScreen
          selected={taskDay}
          onBack={pop}
          /* A square tapped is a day to ANSWER, so it lands on the screen where the
           circles are rather than leaving the grid open over it. */
          onPickDay={(day) => {
            setPinnedTaskDay(day);
            pop();
          }}
          onOpenSettings={() => push({ name: 'taskSettings' })}
          onOpenWrapped={openWrapped}
        />
      );
    }

    return null;
  };

  /* ------------------------------------------------------------------ */
  /* Tab roots                                                           */
  /* ------------------------------------------------------------------ */

  const renderRoot = (r: ShellRoute): ReactElement => {
    if (r === 'Tasks') {
      return (
        <TasksScreen
          onOpenTask={(taskId) => push({ name: 'taskDetail', taskId })}
          onOpenHistory={() => push({ name: 'tasksHistory' })}
          /* The day lives HERE rather than in the screen: the month grid is a
                 pushed route, and a day picked in it has to survive the screen
                 that picked it being unmounted. */
          day={taskDay}
          onChangeDay={setPinnedTaskDay}
          aiReady={aiReady}
          onOpenAi={openAi}
          onToast={setToast}
        />
      );
    }
    return (
      <SettingsHomeScreen
        onOpenTaskSettings={() => push({ name: 'taskSettings' })}
        onOpenAiSettings={() => push({ name: 'aiSettings' })}
        onOpenAchievements={() => push({ name: 'achievements' })}
      />
    );
  };

  const top = stack[stack.length - 1] ?? null;
  const pushed = renderPushed(top);
  const beneath = () => renderPushed(stack[stack.length - 2] ?? null);
  const topKey = top ? `${stack.length}:${top.name}` : 'none';
  /* Nothing of the roots is on screen: a pushed screen covers them at rest. */
  const rootsCovered = !rootsVisible && stack.length > 0;
  /* The key the screen under the top has, or had, as the top itself. */
  const beneathKey =
    stack.length >= 2 ? `${stack.length - 1}:${stack[stack.length - 2].name}` : 'none';

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />

      {/* `collapsable={false}` is load-bearing. The stage's layers carry
          zIndex 0–3, and zIndex only orders siblings — so this view is what
          keeps them BELOW the nav pill. Without it the new architecture
          flattens a layout-only view away, the layers become siblings of the
          pill, and the root paints over it. (The swipe's responder view
          used to do this by accident; removing it hid the bar in 2.0.8.) */}
      <View collapsable={false} style={{ flex: 1, display: rootsCovered ? 'none' : 'flex' }}>
        {/* Covered roots also let go of their blurs — see `BlurGate`. */}
        <BlurGate.Provider value={!rootsCovered}>
          <Hold frozen={rootsCovered}>
            <ShellStage
              route={route}
              transition={transition}
              progress={progress}
              covered={covered}
              render={renderRoot}
            />
          </Hold>
        </BlurGate.Provider>
      </View>

      <NavBar
        active={route}
        /* A sheet being up hides it as well; the pill subscribes to that
           itself, so a sheet opening does not re-render the shell. */
        visible={stack.length === 0}
        onSelect={selectTab}
      />

      <PushHost
        depth={stack.length}
        topKey={topKey}
        beneathKey={beneathKey}
        top={pushed}
        renderBeneath={beneath}
        covered={covered}
        onRootsVisible={setRootsVisible}
        onBack={() => leaveTop.current()}
      />

      {/* Last child, over the nav pill, and non-interactive: pressing the
          floating action twice in a row must still work while it is up. The
          pushed screens that raise toasts render their own. */}
      {toast && stack.length === 0 ? (
        <Toast key={toast.key} label={toast.text} action={toast.action} />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A pushed screen whose subject is gone — a task deleted while its own screen
 * was open (from the AI chat, say, under it). It deserves a sentence and a
 * button, not a flicker.
 */
function Fallback({ onBack }: { onBack: () => void }) {
  const t = useT();
  return (
    <View className="flex-1 items-center justify-center bg-bg px-xl">
      <Text className="text-title font-medium text-ink">{t('It is gone')}</Text>
      <Text className="mt-sm text-center text-body text-ink-muted">
        {t('This was deleted while you were looking at it.')}
      </Text>
      <View className="mt-xl w-full">
        <PrimaryButton label={t('Back')} variant="ghost" onPress={onBack} />
      </View>
    </View>
  );
}
