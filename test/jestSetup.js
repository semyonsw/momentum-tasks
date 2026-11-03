/*
 * The native modules a render test reaches and the jest-expo preset does not
 * already stub. Each resolves and does nothing: render tests assert what the
 * screen and the store do, never what the phone buzzed. They return promises
 * because `lib/feedback.ts` chains `.catch` on every call.
 */
const resolved = () => jest.fn(() => Promise.resolve());

jest.mock('expo-haptics', () => ({
  impactAsync: resolved(),
  notificationAsync: resolved(),
  selectionAsync: resolved(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

/* Reanimated and its worklets runtime ship their own jest mocks; the native
   half they would otherwise initialise does not exist under node. */
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
