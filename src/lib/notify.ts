/**
 * Reminders — a task's own time of day, put on the phone's notification shade.
 *
 * ── WHY A SCHEDULED NOTIFICATION ──────────────────────────────────────────
 *
 * A JS timer is unreliable the moment the app is not on screen: Android
 * throttles timers in the background, Doze suspends them, "Restricted" battery
 * usage and Samsung's "Sleeping apps" list stop them outright, and a swipe-away
 * kills the process entirely. So a reminder is a SCHEDULED NOTIFICATION, which
 * is the one thing Android guarantees to deliver at a wall-clock instant — the
 * alarm path, not the app's.
 *
 * ── ONE CHANNEL ───────────────────────────────────────────────────────────
 *
 * On Android 8+ a notification is posted to a CHANNEL, and the channel is what
 * the phone's notification settings list under the app. There is one:
 * `reminders`, at `DEFAULT` importance with NO custom sound — it uses whatever
 * the phone's own notification tone is, which is what somebody's muscle memory
 * already reads as "something wants me later".
 *
 * A channel's sound and importance are FROZEN once Android has seen it: updating
 * a channel silently keeps the old settings. That is why the id is versioned —
 * changing either means a new id, and the old channel is deleted so it does not
 * linger in the system UI.
 *
 * Everything here can fail and none of it may throw:
 *  • SCHEDULING CAN THROW SYNCHRONOUSLY. `scheduleNotificationAsync` validates its
 *    trigger before returning a promise, so `.catch()` alone does not cover a bad
 *    date — the throw escapes the promise chain. Everything is inside `try`.
 *  • EXACT ALARMS ARE A PERMISSION. `USE_EXACT_ALARM` (declared in `app.json`) is
 *    granted at install on Android 13+ and cannot be revoked, which is what makes
 *    these land on time; on older phones `SCHEDULE_EXACT_ALARM` can be refused and
 *    a `SecurityException` comes back through the bridge. Swallowed: the task on
 *    screen remains the source of truth.
 */

import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { t, type Language } from './i18n';
import type { PlannedReminder } from './reminders';

/**
 * Bumped when the channel's SOUND or IMPORTANCE changes — Android freezes both.
 * (The NAME is not frozen — Android updates a channel's name and description in
 * place — which is why `ensureChannels` rewrites them whenever the language
 * changes.)
 */
const CHANNEL_VERSION = 3;

const CHANNEL_REMINDER = `reminders-v${CHANNEL_VERSION}`;

/** Channels from earlier versions, deleted so the system UI stays honest. */
const RETIRED_CHANNELS = ['reminders-v2'];

/**
 * The channel as it was last written, and the language it was written in.
 *
 * A PROMISE rather than a flag, because a flag is set before the
 * `setNotificationChannelAsync` call has finished: launch fires
 * `ensureChannels()` and, half a second later, the reminder sync calls it
 * again, sees `true`, and schedules straight onto a channel Android has not created
 * yet — and a notification posted to a channel that does not exist is DROPPED on
 * Android 8+, silently. Every caller awaits the same write.
 *
 * Keyed by language because a channel's NAME and DESCRIPTION can be updated in
 * place, so switching the app to Russian rewrites what the phone's notification
 * settings call it.
 */
let channels: { lang: Language; ready: Promise<boolean> } | null = null;

async function writeChannels(lang: Language): Promise<boolean> {
  try {
    for (const id of RETIRED_CHANNELS) {
      await Notifications.deleteNotificationChannelAsync(id).catch(() => {});
    }
    await Notifications.setNotificationChannelAsync(CHANNEL_REMINDER, {
      name: t('Reminders', lang),
      description: t('A task, at the time you asked to be reminded.', lang),
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200],
      enableVibrate: true,
      bypassDnd: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create the app's Android channel, and clear out retired ones.
 *
 * No-op elsewhere, and never throws. Safe to call on every launch and from every
 * scheduling path: concurrent callers share one write, and a failed write is
 * retried by the next caller rather than remembered as done.
 *
 * Without a language it keeps whatever the channel was last written in — the
 * launch call does not know the language yet, and must not rename it to English
 * on a Russian phone.
 */
export async function ensureChannels(lang?: Language): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (channels && (lang === undefined || lang === channels.lang)) {
    if (await channels.ready) return;
  }
  const target = lang ?? channels?.lang ?? 'en';
  const ready = writeChannels(target);
  channels = { lang: target, ready };
  if (!(await ready) && channels?.ready === ready) channels = null; // let a later call try again
}

/**
 * Has the user actually granted notifications?
 *
 * Asked by the settings screens so a switch that is on can say when nothing will
 * come of it — an armed reminder behind a denied permission is the single most
 * confusing state this feature has, because everything in the app looks right.
 */
export async function notificationsGranted(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    return current.granted === true;
  } catch {
    return false;
  }
}

/** Ask for permission. Silent on refusal — the app works fine without it. */
export async function requestNotificationPermission(): Promise<void> {
  await ensureNotificationPermission();
}

/**
 * Where the permission stands after asking for it, if it could still be asked.
 *
 *   granted  alerts will arrive
 *   denied   refused this time; the system may ask again later
 *   blocked  refused for good — only the phone's Settings can turn it back on,
 *            which is what `openNotificationSettings` is for
 *
 * Asked at the moment a reminder is switched ON, not only at launch: a switch
 * that arms a reminder behind a permission nobody was ever asked for is the
 * "everything looks right and nothing arrives" state, and the switch is the one moment the user knows why we are asking.
 */
export async function ensureNotificationPermission(): Promise<'granted' | 'denied' | 'blocked'> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (current.canAskAgain === false) return 'blocked';
    const asked = await Notifications.requestPermissionsAsync();
    if (asked.granted) return 'granted';
    return asked.canAskAgain === false ? 'blocked' : 'denied';
  } catch {
    return 'denied';
  }
}

/** The app's own page in the phone's Settings, where a blocked permission lives. */
export async function openNotificationSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // No settings app to open. Nothing else can grant it.
  }
}

/* ------------------------------------------------------------------ */
/* Reminders                                                           */
/* ------------------------------------------------------------------ */

/**
 * The marker on every reminder this app schedules.
 *
 * Everything scheduled here carries `data.kind = 'reminder'`, and `syncReminders`
 * cancels by reading it back off the queue. The queue is this app's alone —
 * Android keeps each package's scheduled notifications apart — so the marker is
 * what keeps a sync from touching anything that is not a reminder.
 */
export const REMINDER_KIND = 'reminder';

/**
 * The kind a notification is, from its `data`.
 *
 * Total over whatever the bridge hands back — Android returns `data` as a map, a
 * JSON string on some versions, or nothing for a notification scheduled before
 * the marker existed.
 */
export function notificationKind(data: unknown): string | null {
  let value = data;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null) return null;
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === 'string' ? kind : null;
}

/** A reminder's identifier, as `planReminders` writes it. The fallback marker. */
function isReminderId(identifier: string): boolean {
  return identifier.startsWith('task:');
}

/**
 * Monday = 0 … Sunday = 6  →  Android's 1 = Sunday … 7 = Saturday.
 *
 * The app counts weeks from Monday everywhere (`weekdayIndex`), and the platform
 * counts them from Sunday. One conversion, in one place, so a Friday reminder
 * cannot arrive on a Thursday because two files disagreed about what 4 means.
 */
function expoWeekday(weekday: number): number {
  return ((weekday + 1) % 7) + 1;
}

function triggerFor(reminder: PlannedReminder): Notifications.NotificationTriggerInput | null {
  const channel = Platform.OS === 'android' ? { channelId: CHANNEL_REMINDER } : {};
  const { trigger } = reminder;

  if (trigger.kind === 'daily') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: trigger.hour,
      minute: trigger.minute,
      ...channel,
    };
  }
  if (trigger.kind === 'weekly') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: expoWeekday(trigger.weekday),
      hour: trigger.hour,
      minute: trigger.minute,
      ...channel,
    };
  }
  // A dated alert whose instant has passed is refused rather than scheduled:
  // `planReminders` already drops those, and this is the belt to that braces.
  if (trigger.at - Date.now() < 1000) return null;
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: new Date(trigger.at),
    ...channel,
  };
}

/**
 * Make Android's queue match the plan. Returns how many alerts are armed.
 *
 * Cancel-then-schedule rather than a diff, and deliberately: the queue is a
 * dozen entries, re-scheduling one is microseconds, and a diff would need to
 * compare triggers across a bridge that hands them back in a different shape
 * from the one they went in as. Two syncs with nothing changed therefore produce
 * the same armed alerts at the same instants, which is the property that matters.
 *
 * Never throws. Every failure mode here — no permission, exact alarms refused, a
 * module that is not present in this build — leaves the app working exactly as it
 * did before reminders existed, and the settings screen is what reports that the
 * permission is missing.
 */
export function syncReminders(
  plan: readonly PlannedReminder[],
  lang: Language = 'en',
): Promise<number> {
  /*
   * ONE AT A TIME. Launch runs the debounced sync and the foreground sync within
   * the same second, and two interleaved cancel-then-schedule passes can have the
   * second one's cancel land between the first one's schedules. Chained, the last
   * plan asked for is the one Android ends up holding.
   */
  const run = syncQueue.then(() => syncNow(plan, lang));
  syncQueue = run.catch(() => 0);
  return run;
}

let syncQueue: Promise<unknown> = Promise.resolve();

async function syncNow(plan: readonly PlannedReminder[], lang: Language): Promise<number> {
  try {
    await ensureChannels(lang);
    await cancelAllReminders();

    let armed = 0;
    for (const reminder of plan) {
      const trigger = triggerFor(reminder);
      if (!trigger) continue;
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: reminder.id,
          content: {
            title: reminder.title,
            body: reminder.body,
            data: { kind: REMINDER_KIND },
            ...(Platform.OS === 'android' ? { channelId: CHANNEL_REMINDER } : {}),
          },
          trigger,
        });
        armed += 1;
      } catch {
        // One bad alert must not take the other eleven down with it.
      }
    }
    return armed;
  } catch {
    return 0;
  }
}

/** Drop every reminder this app scheduled. */
async function cancelAllReminders(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const entry of scheduled) {
      const ours =
        notificationKind(entry.content?.data) === REMINDER_KIND || isReminderId(entry.identifier);
      if (!ours) continue;
      await Notifications.cancelScheduledNotificationAsync(entry.identifier).catch(() => {});
    }
  } catch {
    // Nothing scheduled, or the module is unavailable. Either way, nothing to do.
  }
}
