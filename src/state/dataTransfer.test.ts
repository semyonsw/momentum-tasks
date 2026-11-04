import { beforeEach, describe, expect, it } from 'vitest';

import { applyBackup, currentSnapshot, exportBackupText, restorableCounts } from './dataTransfer';
import { DEFAULT_SETTINGS, useSettings } from './settingsStore';
import { sanitizeAi, useAi, type AiMessage } from './aiStore';
import { seedTasks, useTasks } from './tasksStore';
import { BACKUP_FORMAT, parseBackup } from '../lib/backup';

/**
 * The backup, end to end: stores → file → stores. What matters is that a file
 * this app writes comes back whole, that a Momentum file (a combined 2.x one, or
 * one Momentum 3.0.0's Tasks app wrote) restores the tasks and nothing else, and
 * that what belongs to THIS phone — the folder grant, the connection — never
 * rides in on a file.
 */

const user = (id: string, text = id): AiMessage => ({
  id,
  role: 'user',
  text,
  at: '2026-09-27T18:00:00.000Z',
});

const READ = {
  id: 't_read',
  name: 'Read',
  schedule: { kind: 'daily' },
  auto: null,
  startedOn: '2026-09-01',
  reminder: null,
  archivedAt: null,
  order: 0,
};
const LOG = { t_read: { '2026-09-02': { mark: 'done', note: 'a chapter' } } };

/** Parse and apply, or fail the test with the parser's sentence. */
function restore(text: string) {
  const parsed = parseBackup(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return applyBackup(parsed.envelope);
}

beforeEach(() => {
  useSettings.getState().importSettings(DEFAULT_SETTINGS);
  useTasks.getState().importTasks({ tasks: seedTasks('2026-01-01'), log: {} });
  useAi.setState(sanitizeAi({}));
});

/* ------------------------------------------------------------------ */

describe('the round trip', () => {
  it('exports what is on the phone and restores it as it was', () => {
    useTasks.getState().importTasks({ tasks: [READ], log: LOG });
    useSettings.getState().setTasksTrendRange('year');
    const before = { tasks: useTasks.getState().tasks, log: useTasks.getState().log };
    const text = exportBackupText();

    useTasks.getState().importTasks({ tasks: seedTasks('2026-01-01'), log: {} });
    useSettings.getState().importSettings(DEFAULT_SETTINGS);
    const applied = restore(text);

    expect(applied).toMatchObject({ settingsApplied: true, tasks: 1 });
    expect(useTasks.getState().tasks).toEqual(before.tasks);
    expect(useTasks.getState().log).toEqual(before.log);
    expect(useSettings.getState().tasksTrendRange).toBe('year');
  });

  it('never writes the store actions into the file', () => {
    const text = exportBackupText();
    for (const action of ['importTasks', 'setTheme', 'appendMessage']) {
      expect(text).not.toContain(action);
    }
  });

  it('writes Momentum’s envelope, with no training or money in it', () => {
    const file = JSON.parse(exportBackupText());
    expect(file.format).toBe(BACKUP_FORMAT);
    expect(file.version).toBe(2);
    expect(Object.keys(file).sort()).toEqual(
      ['aiChats', 'counts', 'exportedAt', 'format', 'settings', 'tasks', 'version'].sort(),
    );
    // The chats filed the way Momentum 3.0.0 reads them.
    expect(Object.keys(file.aiChats.chats)).toEqual(['Tasks']);
    expect(Object.keys(file.aiChats.archive)).toEqual(['Tasks']);
  });

  it('counts what a restore would replace, for the confirmation sheet', () => {
    useTasks.getState().importTasks({ tasks: [READ], log: LOG });
    expect(restorableCounts()).toEqual({ tasks: 1, chats: 0 });
    expect(currentSnapshot().tasks).toEqual({ tasks: useTasks.getState().tasks, log: LOG });
  });
});

describe('importing is validated, not trusted', () => {
  it('drops malformed rows and reports what actually landed', () => {
    const text = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 2,
      tasks: { tasks: [READ, { id: 'x', name: '   ' }, 'junk'], log: LOG },
    });
    expect(restore(text).tasks).toBe(1);
    expect(useTasks.getState().tasks.map((t) => t.id)).toEqual(['t_read']);
  });

  it('replaces rather than merges — a restore is not a union', () => {
    const text = JSON.stringify({ format: BACKUP_FORMAT, version: 2, tasks: { tasks: [READ] } });
    restore(text);
    expect(useTasks.getState().tasks).toHaveLength(1);
  });

  it('leaves settings alone when the file has none, or an empty block', () => {
    useSettings.getState().setTasksTrendRange('year');
    for (const settings of [undefined, {}, [], 'x']) {
      const applied = restore(
        JSON.stringify({ format: BACKUP_FORMAT, version: 2, settings, tasks: { tasks: [READ] } }),
      );
      expect(applied.settingsApplied).toBe(false);
      expect(useSettings.getState().tasksTrendRange).toBe('year');
    }
  });

  it('refuses a file with no tasks before touching the settings', () => {
    useSettings.getState().setLanguage('en');
    expect(() => applyBackup({ settings: { language: 'ru' } })).toThrow(/no tasks/);
    expect(useSettings.getState().language).toBe('en');
  });
});

describe('Momentum’s files', () => {
  it('a combined 2.x backup restores the tasks, the Tasks chats and the settings — nothing else', () => {
    const combined = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 2,
      settings: { language: 'en', tasksTrendRange: 'quarter', restSecondsBetweenSets: 90 },
      exercises: [{ id: 'ex' }],
      routines: [],
      workouts: [{ id: 'w', sets: [] }],
      sequence: null,
      numbering: null,
      tasks: { tasks: [READ], log: LOG },
      money: { accounts: [], amounts: [{ id: 'a' }] },
      debriefs: {},
      aiChats: {
        chats: { Workout: [user('w1')], Tasks: [user('t1')], Expenses: [user('e1')] },
        archive: { Workout: [], Tasks: [], Expenses: [] },
        proposals: {},
      },
    });
    const applied = restore(combined);

    expect(applied).toMatchObject({ settingsApplied: true, tasks: 1, chats: 1 });
    expect(useTasks.getState().log).toEqual(LOG);
    expect(useAi.getState().chat.map((m) => m.id)).toEqual(['t1']);
    expect(useSettings.getState().language).toBe('en');
    expect(useSettings.getState().tasksTrendRange).toBe('quarter');
    expect(
      (useSettings.getState() as unknown as Record<string, unknown>).restSecondsBetweenSets,
    ).toBeUndefined();
  });

  it('a backup Momentum 3.0.0’s Tasks app wrote restores whole', () => {
    const v300 = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 2,
      exportedAt: '2026-11-01T10:00:00.000Z',
      counts: { tasks: 1, chats: 1 },
      settings: { ...DEFAULT_SETTINGS, currencyCode: 'AMD', autoTickTasks: true },
      tasks: { tasks: [READ], log: LOG },
      aiChats: {
        chats: { Tasks: [user('t1')] },
        archive: { Tasks: [] },
        proposals: {},
      },
    });
    expect(restore(v300)).toMatchObject({ tasks: 1, chats: 1 });
    expect(useTasks.getState().tasks.map((t) => t.id)).toEqual(['t_read']);
  });

  it('a file this app writes is one Momentum 3.0.0 reads: the same keys, the same filing', () => {
    useTasks.getState().importTasks({ tasks: [READ], log: LOG });
    useAi.getState().appendMessage(user('q'));
    const file = JSON.parse(exportBackupText());
    expect(file.tasks).toEqual({ tasks: useTasks.getState().tasks, log: LOG });
    expect(file.aiChats.chats.Tasks.map((m: AiMessage) => m.id)).toEqual(['q']);
    expect(file.counts).toEqual({ tasks: 1, chats: 1 });
  });

  it('a training-only file is refused in words', () => {
    const parsed = parseBackup(
      JSON.stringify({ format: BACKUP_FORMAT, version: 1, exercises: [], workouts: [] }),
    );
    expect(parsed.ok).toBe(false);
  });
});

describe('what the assistant leaves out of a backup', () => {
  /*
   * Chats DO travel — a restored phone should open on the conversations it had,
   * past chats included. What must never travel is the key, the model choice or
   * the connection state: a restored phone tests its own key.
   */
  it('carries the chats and past chats, and nothing that looks like a key', () => {
    const marker = 'CHAT-MARKER-7f3kQ2';
    const past = 'PAST-CHAT-MARKER-9x';
    useAi.getState().appendMessage(user('p1', past));
    useAi.getState().clearChat();
    useAi.getState().appendMessage(user('m1', marker));
    useAi.getState().markReady(800);

    const text = exportBackupText();
    expect(text).toContain(marker);
    expect(text).toContain(past);
    expect(text).not.toContain('AIza');
    expect(text).not.toContain('gemini');
    expect(text).not.toContain('"status": "ready"');

    useAi.setState(sanitizeAi({}));
    const applied = restore(text);
    expect(applied.chats).toBe(2);
    expect(useAi.getState().chat.map((m) => m.id)).toEqual(['m1']);
    expect(useAi.getState().archive[0].title).toBe(past);
    // The connection is the phone's own, not the file's.
    expect(useAi.getState().status).toBe('off');
  });

  it('leaves the chats alone when restoring a file without them', () => {
    useAi.getState().appendMessage(user('keep'));
    restore(JSON.stringify({ format: BACKUP_FORMAT, version: 2, tasks: { tasks: [READ] } }));
    expect(useAi.getState().chat.map((m) => m.id)).toEqual(['keep']);
  });
});

describe('settings that travel', () => {
  it('the closed assistant card and the engagement switch come back', () => {
    useSettings.getState().dismissAiCard();
    useSettings.getState().setEngagement(true);
    const text = exportBackupText();
    useSettings.getState().importSettings(DEFAULT_SETTINGS);
    restore(text);
    expect(useSettings.getState().aiCardsDismissed).toEqual(['Tasks']);
    expect(useSettings.getState().engagement).toBe(true);
  });

  it('keeps THIS phone’s folder, day file and switch, not the file’s', () => {
    useSettings.getState().setAutoBackupFolder('content://tree/this-phone');
    const file = {
      uri: 'content://tree/this-phone/momentum-tasks-backup-2026-10-15.json',
      day: '2026-10-15',
    };
    useSettings.getState().recordBackup('2026-10-15T10:00:00.000Z', file);

    restore(
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: 2,
        settings: {
          language: 'en',
          autoBackupEnabled: false,
          autoBackupFolderUri: 'content://tree/other-phone',
          autoBackupIntervalDays: 3,
          autoBackupFile: { uri: 'content://tree/other-phone/x.json', day: '2026-01-01' },
        },
        tasks: { tasks: [READ] },
      }),
    );

    expect(useSettings.getState().autoBackupFolderUri).toBe('content://tree/this-phone');
    expect(useSettings.getState().autoBackupFile).toEqual(file);
    expect(useSettings.getState().autoBackupEnabled).toBe(DEFAULT_SETTINGS.autoBackupEnabled);
    expect(
      (useSettings.getState() as unknown as Record<string, unknown>).autoBackupIntervalDays,
    ).toBeUndefined();
  });

  it('writes no retired key into a new backup', () => {
    const text = exportBackupText();
    expect(text).not.toContain('autoBackupIntervalDays');
    expect(text).not.toContain('autoBackupUris');
  });
});
