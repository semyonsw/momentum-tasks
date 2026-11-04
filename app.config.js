/**
 * `app.json` is the Workout app; this file turns it into Tasks or Expenses.
 *
 *   EXPO_PUBLIC_APP_VARIANT=tasks npx expo prebuild -p android --clean
 *
 * The same variable is inlined into the JS bundle (`src/lib/appVariant.ts`), so
 * it has to be set for the prebuild AND the gradle build — `tools/release-apk.sh`
 * exports it for both. Unset means `workout`, which is exactly `app.json`.
 *
 * Workout keeps `com.semyonsw.workouttracker`: that is the install on the phone,
 * and a new package would be a new app that starts empty. The other two are new
 * packages, and drop the Health Connect permission and plugin, which only a
 * finished workout uses.
 */

const VARIANTS = {
  workout: { name: 'Workout', package: 'com.semyonsw.workouttracker', scheme: 'workouttracker' },
  tasks: { name: 'Tasks', package: 'com.semyonsw.momentum.tasks', scheme: 'momentumtasks' },
  expenses: {
    name: 'Expenses',
    package: 'com.semyonsw.momentum.expenses',
    scheme: 'momentumexpenses',
  },
};

module.exports = ({ config }) => {
  const raw = process.env.EXPO_PUBLIC_APP_VARIANT;
  const id = raw === 'tasks' || raw === 'expenses' ? raw : 'workout';
  const v = VARIANTS[id];
  const workout = id === 'workout';
  return {
    ...config,
    name: v.name,
    scheme: v.scheme,
    icon: `./assets/icon-${id}.png`,
    android: {
      ...config.android,
      package: v.package,
      adaptiveIcon: {
        ...config.android.adaptiveIcon,
        foregroundImage: `./assets/adaptive-icon-${id}.png`,
      },
      permissions: workout
        ? config.android.permissions
        : config.android.permissions.filter((p) => !p.startsWith('android.permission.health.')),
    },
    plugins: workout
      ? config.plugins
      : config.plugins.filter((p) => p !== 'react-native-health-connect'),
    extra: { ...config.extra, appVariant: id },
  };
};
