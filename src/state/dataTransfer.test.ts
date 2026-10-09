import { beforeEach, describe, expect, it } from 'vitest';

import {
  UnreadableLogError,
  applyBackup,
  currentSnapshot,
  exportBackupText,
  exportCsvText,
} from './dataTransfer';
import { useMoney } from './moneyStore';
import { useLibrary } from './libraryStore';
import { DEFAULT_SETTINGS, useSettings } from './settingsStore';
import { useWorkoutHistory } from './workoutHistoryStore';
import { sanitizeAi, useAi } from './aiStore';
import { useDebriefs } from './debriefStore';
import { parseBackup } from '../lib/backup';
import { buildDraftSession, type DraftSession } from '../lib/draft';
import { seedExercises, seedRoutine, seedUser } from '../data/seed';
import { fixtureHistoryByExerciseId } from '../../test/fixtures/history';
import type { Exercise, ID } from '../types/models';

const exercisesById = Object.fromEntries(seedExercises.map((e) => [e.id, e])) as Record<
  ID,
  Exercise
>;

/** A finished session with real logged sets, so history has something in it. */
function loggedDraft(startedAt: string): DraftSession {
  const session = buildDraftSession({
    routine: seedRoutine,
    exercisesById,
    historyByExerciseId: fixtureHistoryByExerciseId,
    policy: seedUser.overloadPolicy,
    unitSystem: 'metric',
    defaultRestSeconds: 120,
    defaultTransitionRestSeconds: 150,
    startedAt,
    now: new Date(startedAt),
  });
  const [first, ...rest] = session.entries;
  return {
    ...session,
    entries: [
      { ...first, sets: first.sets.map((s) => ({ ...s, isCompleted: true, isPrefilled: false })) },
      ...rest,
    ],
  };
}

beforeEach(() => {
  useLibrary.getState().restoreSeedLibrary();
  useWorkoutHistory.getState().clearHistory();
  useSettings.getState().resetToDefaults();
});

/* ------------------------------------------------------------------ */

describe('the round trip', () => {
  it('exports what is on the phone and restores it byte for byte', () => {
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-17T17:00:00.000Z'));
    useSettings.getState().setNumber('restSecondsBetweenSets', 75);
    const created = useLibrary.getState().createRoutine('Neck day');

    const text = exportBackupText();
    const before = currentSnapshot();

    // Wipe the phone as thoroughly as the app can from inside itself.
    useLibrary.getState().importLibrary({ exercises: [], routines: [] });
    useWorkoutHistory.getState().clearHistory();
    useSettings.getState().resetToDefaults();
    expect(useLibrary.getState().exercises).toEqual([]);

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const applied = applyBackup(parsed.envelope);

    expect(currentSnapshot()).toEqual(before);
    expect(applied.workouts).toBe(1);
    expect(applied.exercises).toBe(seedExercises.length);
    expect(useLibrary.getState().routines.some((r) => r.id === created.id)).toBe(true);
    // Settings ride along: the rest lengths are what every timer in the app reads.
    expect(useSettings.getState().restSecondsBetweenSets).toBe(75);
    expect(applied.settingsApplied).toBe(true);
  });

  it('carries the raw set rows, not just the summary lines', () => {
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-17T17:00:00.000Z'));
    const parsed = parseBackup(exportBackupText());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    useWorkoutHistory.getState().clearHistory();
    applyBackup(parsed.envelope);

    // These rows are what every prefill and every overload verdict reads. A
    // backup that kept only the pretty summary would restore a history that looks
    // right and teaches the app nothing.
    const [workout] = useWorkoutHistory.getState().workouts;
    expect(workout.sets.length).toBeGreaterThan(0);
    expect(workout.sets[0].exerciseId).toBeTruthy();
    expect(workout.sets[0].countUnit).toBeTruthy();
  });

  /**
   * A ladder is two numbers on a library row, and losing them costs more than it
   * looks: `max` is a tested maximum and `earned` is how many sessions of progress
   * stand behind it. Neither can be recomputed from the log — a session that met
   * its target looks exactly like one that beat a different target.
   */
  it('carries a rep ladder, max and earned reps both', () => {
    const [first] = useLibrary.getState().exercises;
    useLibrary.getState().updateExercise(first.id, {
      ...first,
      countUnit: 'reps',
      ladder: { max: 16, earned: 2 },
    });

    const parsed = parseBackup(exportBackupText());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    useLibrary.getState().importLibrary({ exercises: [], routines: [] });
    applyBackup(parsed.envelope);

    const restored = useLibrary.getState().exercises.find((e) => e.id === first.id);
    expect(restored?.ladder).toEqual({ max: 16, earned: 2 });
  });

  it('never writes the store actions into the file', () => {
    const file = JSON.parse(exportBackupText()) as { settings: Record<string, unknown> };

    // `settings` is sanitized rather than spread: the live store carries its
    // actions alongside its values, and functions do not survive JSON.
    //
    // Asserted as a SUBSET rather than an exact key match, because one setting is
    // legitimately absent from the file: `bodyweightKg` is `undefined` until the
    // user types one, and `JSON.stringify` drops an undefined value. What must
    // hold is that nothing in the file is a key `Settings` does not declare — an
    // action leaking through would be exactly that.
    const declared = new Set(Object.keys(DEFAULT_SETTINGS));
    for (const key of Object.keys(file.settings)) expect(declared.has(key)).toBe(true);
    expect(Object.keys(file.settings).length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */

describe('importing is validated, not trusted', () => {
  it('drops malformed rows and reports what actually landed', () => {
    const applied = applyBackup({
      settings: null,
      exercises: [
        // The one good row.
        {
          id: 'ex_ok',
          name: 'Neck curl',
          muscleGroups: ['neck'],
          requiresWeight: true,
          countUnit: 'reps',
          loadMode: 'external',
          isUnilateral: false,
          isArchived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        { id: 'ex_bad' }, // no shape at all
        'not even an object',
      ],
      routines: [{ id: 'r_bad' }],
      workouts: [{ id: 'w_bad' }],
    });

    expect(applied.exercises).toBe(1);
    expect(applied.routines).toBe(0);
    expect(applied.workouts).toBe(0);
    expect(applied.settingsApplied).toBe(false);
    expect(useLibrary.getState().exercises.map((e) => e.id)).toEqual(['ex_ok']);
  });

  it('drops routine items pointing at exercises the file did not carry', () => {
    applyBackup({
      settings: null,
      exercises: [],
      routines: [
        {
          id: 'r_1',
          name: 'Pull',
          items: [{ id: 'ri_1', exerciseId: 'ex_missing', order: 0, targetSets: 4 }],
        },
      ],
      workouts: [],
    });

    // A routine holding an unresolvable id plans fewer sets than it says it does.
    expect(useLibrary.getState().routines[0].items).toEqual([]);
  });

  it('replaces rather than merges — a restore is not a union', () => {
    const kept = useLibrary.getState().createRoutine('Made after the backup');
    applyBackup({ settings: null, exercises: [], routines: [], workouts: [] });

    expect(useLibrary.getState().routines.some((r) => r.id === kept.id)).toBe(false);
    expect(useLibrary.getState().routines).toEqual([]);
  });

  it('leaves settings alone when the file has none', () => {
    useSettings.getState().setNumber('restSecondsBetweenSets', 45);
    applyBackup({ settings: null, exercises: [], routines: [], workouts: [] });

    expect(useSettings.getState().restSecondsBetweenSets).toBe(45);
  });

  it('clamps a settings block that would otherwise reach a timer as NaN', () => {
    applyBackup({
      settings: { restSecondsBetweenSets: 'nonsense', beepSeconds: 9999 },
      exercises: [],
      routines: [],
      workouts: [],
    });

    expect(useSettings.getState().restSecondsBetweenSets).toBe(
      DEFAULT_SETTINGS.restSecondsBetweenSets,
    );
    expect(useSettings.getState().beepSeconds).toBe(30); // the setting's ceiling
  });
});

describe('the training sequence rides along', () => {
  it('is exported and restored with the routines it points at', () => {
    const routine = useLibrary.getState().routines[0];
    useLibrary.getState().addSequenceStep(routine.id);
    useLibrary.getState().setSequenceActive(true);

    const text = exportBackupText(new Date('2026-08-19T09:00:00.000Z'));

    // Wreck it, then restore.
    useLibrary.getState().restoreSeedLibrary();
    expect(useLibrary.getState().sequence.routineIds).toEqual([]);

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    applyBackup(parsed.envelope);

    expect(useLibrary.getState().sequence).toEqual({
      isActive: true,
      routineIds: [routine.id],
      cursor: 0,
    });
  });

  it('restores as off from a file written before sequences existed', () => {
    useLibrary.getState().addSequenceStep(useLibrary.getState().routines[0].id);
    useLibrary.getState().setSequenceActive(true);

    // A restore is "make this phone look like that backup", so a file with no
    // sequence in it must not leave the local one standing.
    applyBackup({
      settings: null,
      exercises: useLibrary.getState().exercises,
      routines: useLibrary.getState().routines,
      workouts: [],
    });

    expect(useLibrary.getState().sequence).toEqual({
      isActive: false,
      routineIds: [],
      cursor: 0,
    });
  });
});

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */

describe('the pinned workout number rides along', () => {
  it('is exported and restored', () => {
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-17T17:00:00.000Z'));
    const workout = useWorkoutHistory.getState().workouts[0];
    useWorkoutHistory.getState().setWorkoutNumber(workout.id, 91);

    const text = exportBackupText(new Date('2026-08-19T09:00:00.000Z'));
    useWorkoutHistory.getState().clearHistory();
    expect(useWorkoutHistory.getState().numbering).toBeNull();

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    applyBackup(parsed.envelope);

    // The one fact in the app that cannot be recomputed from the sessions.
    expect(useWorkoutHistory.getState().numbering).toEqual({ workoutId: workout.id, number: 91 });
  });
});

/* ------------------------------------------------------------------ */

/**
 * THE PATH THAT TURNS A FAILED READ INTO A REAL LOSS.
 *
 * Exporting is what a careful person does first when the app looks wrong. If the
 * log could not be read, the snapshot's `workouts` is empty for a reason that has
 * nothing to do with what is on disk — and a file with `"workouts": []` in it is
 * one `Replace everything from a file` away from making the loss permanent and
 * unrecoverable.
 */
describe('a backup is refused when the log could not be read', () => {
  it('throws instead of writing a file with the log missing', () => {
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-17T17:00:00.000Z'));
    // The state a failed read leaves: nothing in memory, everything on disk.
    useWorkoutHistory.setState({ workouts: [], loadFailed: true });

    expect(() => exportBackupText()).toThrow(UnreadableLogError);
  });

  it('exports normally once the log has been read', () => {
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-17T17:00:00.000Z'));
    useWorkoutHistory.setState({ loadFailed: false });

    const parsed = parseBackup(exportBackupText());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.counts.workouts).toBe(1);
  });

  it('still exports an empty log that is genuinely empty', () => {
    // A fresh install has nothing to back up and that is not an error: the file is
    // valid, it just has no workouts in it.
    useWorkoutHistory.getState().clearHistory();
    useWorkoutHistory.setState({ loadFailed: false });

    expect(() => exportBackupText()).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */

describe('the CSV exports read the stores', () => {
  it('workouts: one row per logged set, refused on an unreadable log', () => {
    useWorkoutHistory.getState().saveSession(loggedDraft('2026-08-17T17:00:00.000Z'));
    useWorkoutHistory.setState({ loadFailed: false });
    const sets = useWorkoutHistory.getState().workouts[0].sets.length;
    const lines = exportCsvText('workouts')
      .split('\r\n')
      .filter((l) => l !== '');
    expect(lines).toHaveLength(1 + sets);

    useWorkoutHistory.setState({ workouts: [], loadFailed: true });
    expect(() => exportCsvText('workouts')).toThrow(UnreadableLogError);
    useWorkoutHistory.setState({ loadFailed: false });
  });

  it('amounts: in the pinned scale and the label the user counts in', () => {
    useSettings.setState({ currencyCode: 'USD' });
    useMoney.getState().importMoney({
      scale: 2,
      accounts: [{ id: 'cash', name: 'Cash', glyph: '💵', order: 0, opening: 0, archivedAt: null }],
      categories: [
        { id: 'food', name: 'Food', glyph: '🍜', direction: 'expense', order: 0, archivedAt: null },
      ],
      amounts: [
        {
          id: 'a1',
          categoryId: 'food',
          accountId: 'cash',
          direction: 'expense',
          value: 1250,
          when: { kind: 'day', date: '2026-10-03' },
          note: '',
          createdAt: '2026-10-03T10:00:00.000Z',
        },
      ],
    });
    expect(exportCsvText('amounts')).toContain(
      '\r\n2026-10-03,Cash,expense,Food,-12.50,USD,,false\r\n',
    );
  });
});

/* ------------------------------------------------------------------ */

describe('what the assistant leaves out of a backup', () => {
  /*
   * Chats DO travel now — a restored phone should open on the conversations it
   * had, past chats included. What must never travel is the key, the model
   * choice or the connection state: a restored phone tests its own key.
   */
  it('carries the chats and past chats, and nothing that looks like a key', () => {
    const marker = 'CHAT-MARKER-7f3kQ2';
    const past = 'PAST-CHAT-MARKER-9x';
    useAi.setState(sanitizeAi({}));
    useAi.getState().appendMessage('Tasks', {
      id: 'p1',
      role: 'user',
      text: past,
      at: '2026-09-26T18:00:00.000Z',
    });
    useAi.getState().clearChat('Tasks');
    useAi.getState().appendMessage('Workout', {
      id: 'm1',
      role: 'user',
      text: marker,
      at: '2026-09-27T18:00:00.000Z',
    });
    useAi.getState().markReady(800);

    const text = exportBackupText();
    expect(text).toContain(marker);
    expect(text).toContain(past);
    expect(text).not.toContain('AIza');
    expect(text).not.toContain('gemini');
    expect(text).not.toContain('"status": "ready"');
    expect(Object.keys(useAi.getState())).not.toContain('key');
    expect(Object.keys(useAi.getState())).not.toContain('apiKey');

    // Restored onto a phone with nothing: both come back, and visible.
    useAi.setState(sanitizeAi({}));
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.counts.chats).toBe(2);
    const applied = applyBackup(parsed.envelope);
    expect(applied.chats).toBe(2);
    expect(useAi.getState().chats.Workout.map((m) => m.id)).toEqual(['m1']);
    expect(useAi.getState().archive.Tasks[0].title).toBe(past);
    // The connection is the phone's own, not the file's.
    expect(useAi.getState().status).toBe('off');
    useAi.setState(sanitizeAi({}));
  });

  it('leaves the chats alone when restoring a file from before they travelled', () => {
    useAi.setState(sanitizeAi({}));
    useAi.getState().appendMessage('Workout', {
      id: 'keep',
      role: 'user',
      text: 'keep me',
      at: '2026-09-27T18:00:00.000Z',
    });
    const parsed = parseBackup(JSON.stringify({ exercises: [], routines: [], workouts: [] }));
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope);
    expect(useAi.getState().chats.Workout.map((m) => m.id)).toEqual(['keep']);
    useAi.setState(sanitizeAi({}));
  });
});

describe('the debriefs', () => {
  const debriefWorkout = {
    id: 'w_debrief',
    title: 'Push',
    startedAt: '2026-09-27T18:00:00.000Z',
    endedAt: '2026-09-27T19:00:00.000Z',
    durationMinutes: 60,
    setCount: 1,
    totalVolumeKg: 0,
    volumeIsPartial: false,
    exercises: [],
    sets: [],
  };

  it('travel in a backup and come back', () => {
    useDebriefs.setState({ debriefs: [], openId: null });
    useDebriefs.getState().offer(debriefWorkout, false);
    useDebriefs.getState().saveAnswers('w_debrief', { load: { choices: ['heavy'] } }, true);
    const text = exportBackupText();
    useDebriefs.setState({ debriefs: [] });
    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope);
    expect(useDebriefs.getState().debriefs).toHaveLength(1);
    expect(useDebriefs.getState().debriefs[0].answers).toEqual({ load: { choices: ['heavy'] } });
  });

  it('are left alone by a file from before they existed', () => {
    useDebriefs.setState({ debriefs: [], openId: null });
    useDebriefs.getState().offer(debriefWorkout, false);
    const parsed = parseBackup(JSON.stringify({ exercises: [], routines: [], workouts: [] }));
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope);
    expect(useDebriefs.getState().debriefs).toHaveLength(1);
  });
});

describe('the closed assistant cards', () => {
  it('travel in a backup and come back', () => {
    useSettings.getState().dismissAiCard('Tasks');
    const text = exportBackupText();
    useSettings.getState().importSettings(DEFAULT_SETTINGS);
    expect(useSettings.getState().aiCardsDismissed).toBeUndefined();

    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope);
    expect(useSettings.getState().aiCardsDismissed).toEqual(['Tasks']);
  });

  it('a 2.2.0 backup, written before the key existed, imports unchanged and shows every card', () => {
    useSettings.getState().importSettings(DEFAULT_SETTINGS);
    const v220 = JSON.stringify({
      format: 'workout-tracker-backup',
      version: 1,
      settings: { restSecondsBetweenSets: 90, autoTickTasks: false },
      exercises: [],
      routines: [],
      workouts: [],
    });
    const parsed = parseBackup(v220);
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope);

    expect(useSettings.getState().restSecondsBetweenSets).toBe(90);
    expect(useSettings.getState().autoTickTasks).toBe(false);
    expect(useSettings.getState().aiCardsDismissed).toBeUndefined();
  });
});

describe('the money scale (U25)', () => {
  it('a 2.2.0 backup with amounts imports them unchanged, in whole units', async () => {
    const { useMoney } = await import('./moneyStore');
    useMoney.getState().pinScale(2);
    const v220 = JSON.stringify({
      format: 'workout-tracker-backup',
      version: 2,
      exercises: [],
      routines: [],
      workouts: [],
      money: {
        accounts: [{ id: 'cash', name: 'Cash', glyph: '💵', order: 0, opening: 0 }],
        categories: [{ id: 'food', name: 'Food', glyph: '🧊', order: 0, direction: 'expense' }],
        amounts: [
          {
            id: 'a1',
            categoryId: 'food',
            accountId: 'cash',
            direction: 'expense',
            value: 12500,
            when: { kind: 'day', date: '2026-09-01' },
            note: '',
            createdAt: '2026-09-01T10:00:00.000Z',
          },
        ],
      },
    });
    const parsed = parseBackup(v220);
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope);

    expect(useMoney.getState().amounts.map((amount) => amount.value)).toEqual([12500]);
    expect(useMoney.getState().scale).toBeUndefined();
  });

  it('a pinned scale travels in a backup and comes back', async () => {
    const { useMoney } = await import('./moneyStore');
    useMoney.getState().importMoney({});
    useMoney.getState().pinScale(2);
    const text = exportBackupText();
    useMoney.getState().importMoney({});
    expect(useMoney.getState().scale).toBeUndefined();

    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    applyBackup(parsed.envelope);
    expect(useMoney.getState().scale).toBe(2);
  });
});
