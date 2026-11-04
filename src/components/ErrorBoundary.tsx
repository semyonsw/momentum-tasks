/**
 * ErrorBoundary — the difference between a bug and "Tasks keeps stopping".
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ SOMETHING BROKE                              │
 *   │ The screen below this one crashed.           │
 *   │ Everything you have ticked is saved.         │
 *   │ ╭──────────────────────────────────────────╮ │
 *   │ │ TypeError: Cannot read property 'x' of…  │ │
 *   │ │   at TaskRow (TasksScreen.tsx:74)        │ │
 *   │ ╰──────────────────────────────────────────╯ │
 *   │ ╭─────────────── Try again ───────────────╮  │
 *   └──────────────────────────────────────────────┘
 *
 * Why this exists, and why it shows a stack trace:
 *
 * In a release build there is no red box. An uncaught render error takes the
 * whole process down, and Android offers "App info / Close app" — which tells
 * nobody anything. So this component does two things a bare boundary wouldn't:
 *
 *  1. It shows the actual message and the top of the stack. Ugly on purpose:
 *     "something went wrong" is unactionable, whereas a file and a line is a bug
 *     report the user can screenshot.
 *  2. `Try again` remounts the tree. Enough for a transient failure — a race on a
 *     timer, a half-written store — and every tick is already on disk, so a
 *     remount loses nothing.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { t as translate } from '../lib/i18n';
import { useSettings } from '../state/settingsStore';
import { Kicker, PrimaryButton } from './primitives';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  /** Where React says it broke — more useful than the JS stack for render bugs. */
  componentStack: string | null;
  /** Bumped on recovery to force a fresh subtree rather than a repaired one. */
  generation: number;
}

/** Enough stack to name the component and its parent; more is unreadable. */
const STACK_LINES = 8;

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: null, generation: 0 };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Goes to logcat, which is what `adb logcat -s ReactNativeJS` will show if
    // this ever needs diagnosing from a connected device.
    console.error('[ErrorBoundary]', error?.message, info?.componentStack);
    this.setState({ componentStack: info?.componentStack ?? null });
  }

  private retry = () => {
    this.setState((s) => ({ error: null, componentStack: null, generation: s.generation + 1 }));
  };

  render() {
    const { error, componentStack, generation } = this.state;

    if (!error) {
      // The key is what makes `Try again` a genuine remount: same element type,
      // new identity, so every child rebuilds its state from scratch.
      return (
        <View key={generation} className="flex-1">
          {this.props.children}
        </View>
      );
    }

    /*
     * The language is READ FROM THE STORE rather than through `useT`, because
     * this is a class component — an error boundary has to be one — and hooks
     * cannot be called here. Reading it at render is enough: this screen is
     * mounted by a crash and torn down by `Try again`, so there is nothing to
     * re-render against a language change while it is up.
     */
    const lang = useSettings.getState().language;
    const t = (key: string) => translate(key, lang);

    const stack = (componentStack ?? error.stack ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, STACK_LINES)
      .join('\n');

    return (
      <View className="flex-1 bg-bg px-lg pt-xxl">
        <Kicker>{t('Something broke')}</Kicker>

        <Text className="mt-md text-title font-medium text-ink">
          {t('The screen below this one crashed.')}
        </Text>
        <Text className="mt-sm text-body text-ink-muted">
          {t(
            'Everything you have ticked is saved. Try again — and if it crashes straight back to here, closing and reopening the app is safe too.',
          )}
        </Text>

        <ScrollView
          className="mt-xl max-h-[280px] rounded-surface border border-hairline bg-surface"
          contentContainerStyle={{ padding: 16 }}
        >
          <Text className="text-label font-semibold text-green-bright">
            {error.name}: {error.message}
          </Text>
          {stack ? <Text className="mt-sm text-label text-ink-faint">{stack}</Text> : null}
        </ScrollView>

        <View className="mt-xl">
          <PrimaryButton label={t('Try again')} onPress={this.retry} />
        </View>
      </View>
    );
  }
}
