/**
 * LibrarySwitch — `Routines | Exercises`, under the header of the one
 * `Routines & exercises` destination (U23).
 *
 * The workout corner had two glyphs for these, ≡ and 📖, and they looked alike.
 * It has one door now, and this switch is how that door holds two screens. Each
 * half stays the screen it was — the routine list and the exercise tree — and the
 * switch REPLACES one with the other on the stack, so back from either lands on
 * the workout section rather than on the other half. Rejected: one long screen
 * with both lists (the tree opens downward and would push the routines a screen
 * away), and a tab bar inside a pushed screen (a second navigation level for two
 * options).
 */

import { View } from 'react-native';

import { Segmented } from './primitives';
import { useT } from '../hooks/useT';
import { LIBRARY_TABS, type LibraryTab } from '../lib/discoverability';

export function LibrarySwitch({
  value,
  onChange,
}: {
  value: LibraryTab;
  onChange: (tab: LibraryTab) => void;
}) {
  const t = useT();
  const labels: Record<LibraryTab, string> = {
    routines: t('Routines'),
    exercises: t('Exercises'),
  };
  return (
    <View className="mt-md">
      <Segmented
        options={LIBRARY_TABS.map((tab) => ({ value: tab, label: labels[tab] }))}
        value={value}
        onChange={(next) => {
          if (next !== value) onChange(next);
        }}
        accessibilityLabel={t('Routines or exercises')}
      />
    </View>
  );
}
