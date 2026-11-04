/**
 * TaskSettingsScreen — the decisions the daily tasks screen cannot make for
 * itself, and the door to pausing the whole list (T3).
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ‹ DAILY TASKS SETTINGS                       │
 *   │ PAUSING                                      │
 *   │ ┌──────────────────────────────────────────┐ │
 *   │ │ ॥ Pause for a vacation…                › │ │
 *   │ └──────────────────────────────────────────┘ │
 *   │ HISTORY                                      │
 *   │ (Week)(Month)(3 months)(Year)(All)           │
 *   └──────────────────────────────────────────────┘
 *
 * ── WHY THE RANGE IS A SETTING RATHER THAN A MEMORY ────────────────────────
 *
 * The history screen's chips still change the range for as long as you are on it.
 * This is what it OPENS on, which is a different question: somebody who thinks in
 * weeks should not have to re-pick `Week` every time, and somebody who only ever
 * looks at the year should not be paying a tap for a month they never read.
 *
 * There is no row here for the tasks themselves. A task is content, not
 * configuration — it is added, renamed, scheduled and reordered on the screen
 * where it is answered, which is where you are standing when you decide any of
 * that.
 */

import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { PauseDoorRow, PauseSheet, raisePauseToast } from '../components/PauseSheet';
import { ScreenHeader } from '../components/ScreenHeader';
import type { ToastAction } from '../components/glass';
import { Kicker, SelectChip } from '../components/primitives';
import { useT } from '../hooks/useT';
import { tap } from '../lib/feedback';
import { TREND_RANGES, TREND_RANGE_LABELS } from '../lib/trends';
import { useSettings } from '../state/settingsStore';
import { useTasks } from '../state/tasksStore';

export function TaskSettingsScreen({
  onBack,
  onToast,
}: {
  onBack: () => void;
  /** The pause's Undo toast (T3). */
  onToast: (text: string, action?: ToastAction) => void;
}) {
  const t = useT();
  const unpause = useTasks((s) => s.unpause);
  const [pausing, setPausing] = useState(false);
  const tasksTrendRange = useSettings((s) => s.tasksTrendRange);
  const setTasksTrendRange = useSettings((s) => s.setTasksTrendRange);

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <ScreenHeader kicker={t('Daily tasks settings')} onBack={onBack} bordered={false} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Vacation mode (T3) — the whole list's door. The same sheet opens from
            a row's hold menu and from a task's own screen. */}
        <Kicker className="mx-lg mb-kicker-gap mt-md">{t('Pausing')}</Kicker>
        <View className="mx-lg">
          <PauseDoorRow onPress={() => setPausing(true)} />
        </View>
        <Text className="mx-lg mt-sm text-label text-ink-faint">
          {t(
            'Excuse a run of days for every task, or a few: the streak walks over them and they leave the percentage. Days ahead are marked now and stay yours to tick.',
          )}
        </Text>

        {/* Every task's own reminder is set where the task is — on its editor,
            beside the days it asks on. A screen listing every reminder in the app
            would be a second place to change one, and the two would disagree the
            first time somebody edited a task from the day list. */}
        <Kicker className="mx-lg mb-kicker-gap mt-kicker">{t('History opens on')}</Kicker>
        <View className="mx-lg flex-row flex-wrap">
          {TREND_RANGES.map((range) => (
            <SelectChip
              key={range}
              label={t(TREND_RANGE_LABELS[range])}
              selected={range === tasksTrendRange}
              onPress={() => {
                tap();
                setTasksTrendRange(range);
              }}
            />
          ))}
        </View>
        <Text className="mx-lg text-label text-ink-faint">
          {t(
            'Which range the ⟲ in the corner of the daily tasks opens on. The chips on that screen still change it while you are reading.',
          )}
        </Text>
      </ScrollView>

      {pausing ? (
        <PauseSheet
          onDismiss={() => setPausing(false)}
          onPaused={(written, days) => {
            setPausing(false);
            raisePauseToast(written, days, t, onToast, unpause);
          }}
        />
      ) : null}
    </View>
  );
}
