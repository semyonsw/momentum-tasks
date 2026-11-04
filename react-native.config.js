/**
 * Native linking, per app. One entry: Health Connect is compiled into the
 * Workout app only.
 *
 * `app.config.js` already drops the Health Connect plugin and permission from
 * Tasks and Expenses, but the library's own AAR would still be linked into
 * them, and its manifest still asks the phone about the Health Connect app —
 * a question an app that never writes a workout has no business asking. So the
 * Android linking is switched off there as well. Nothing in JS notices:
 * `src/lib/healthConnect.ts` requires the module lazily inside a `try`, and the
 * shell only writes from the Workout app.
 *
 * Unset (or a shell that did not pass the variable through, like the Windows
 * `node.exe` that `npx` reaches from WSL) means `workout`, and so means LINKED
 * — the failure mode of a missed variable is a Tasks APK that carries an unused
 * library, never a Workout APK that silently lost the one it uses.
 */

const raw = process.env.EXPO_PUBLIC_APP_VARIANT;
const workout = raw !== 'tasks' && raw !== 'expenses';

module.exports = {
  dependencies: workout ? {} : { 'react-native-health-connect': { platforms: { android: null } } },
};
