import { describe, expect, it } from 'vitest';

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  countPayload,
  describeCounts,
  parseBackup,
  serializeBackup,
  type BackupPayload,
} from './backup';

const payload = (over: Partial<BackupPayload> = {}): BackupPayload => ({
  settings: { language: 'en' },
  tasks: { tasks: [{ id: 't_1' }, { id: 't_2' }], log: { t_1: {} } },
  aiChats: { chats: { Tasks: [{ id: 'm1' }] }, archive: { Tasks: [{ id: 'c1' }] } },
  ...over,
});

/* ------------------------------------------------------------------ */

describe('the envelope', () => {
  it('is Momentum’s: the same format name, at version 2', () => {
    const file = JSON.parse(serializeBackup(payload()));

    expect(file.format).toBe('workout-tracker-backup');
    expect(BACKUP_FORMAT).toBe('workout-tracker-backup');
    expect(file.version).toBe(2);
    expect(BACKUP_VERSION).toBe(2);
    expect(typeof file.exportedAt).toBe('string');
  });

  it('counts what is actually in it, not what anyone claims', () => {
    expect(countPayload(payload())).toEqual({ tasks: 2, chats: 2 });
  });

  it('counts junk as nothing rather than as NaN', () => {
    expect(countPayload(payload({ tasks: { tasks: 'x' }, aiChats: 7 }))).toEqual({
      tasks: 0,
      chats: 0,
    });
  });

  it('carries no training and no money, so Momentum 2.x refuses it rather than restoring it', () => {
    const file = JSON.parse(serializeBackup(payload()));
    for (const key of ['exercises', 'routines', 'workouts', 'money']) {
      expect(key in file, key).toBe(false);
    }
  });

  it('is pretty-printed, because a backup you cannot read is a promise', () => {
    const text = serializeBackup(payload());

    expect(text).toContain('\n  "format"');
    expect(text.endsWith('\n')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe('reading one back', () => {
  it('round-trips a payload unchanged', () => {
    const original = payload();
    const result = parseBackup(serializeBackup(original));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.tasks).toEqual(original.tasks);
    expect(result.envelope.aiChats).toEqual(original.aiChats);
    expect(result.envelope.settings).toEqual(original.settings);
    expect(result.counts).toEqual({ tasks: 2, chats: 2 });
  });

  it('takes only the tasks, the chats and the settings out of a combined Momentum 2.x file', () => {
    const combined = {
      format: BACKUP_FORMAT,
      version: 2,
      settings: { language: 'ru', restSecondsBetweenSets: 90 },
      exercises: [{ id: 'ex' }],
      routines: [],
      workouts: [{ id: 'w', sets: [{}] }],
      tasks: { tasks: [{ id: 't' }], log: {} },
      money: { amounts: [{ id: 'a' }] },
      debriefs: [{ id: 'd' }],
      aiChats: { chats: { Workout: [{ id: 'x' }], Tasks: [] }, archive: {} },
    };
    const result = parseBackup(JSON.stringify(combined));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.envelope).sort()).toEqual(
      ['aiChats', 'counts', 'exportedAt', 'format', 'settings', 'tasks', 'version'].sort(),
    );
    // The Workout chat is not counted as one of this app's.
    expect(result.counts).toEqual({ tasks: 1, chats: 0 });
  });

  it('refuses text that is not JSON', () => {
    const result = parseBackup('{"format": "workout-tracker-backup", "tas');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The usual cause is a half-copied paste, and the message says so.
    expect(result.error).toMatch(/JSON/);
  });

  it('refuses a file from a NEWER format rather than half-reading it', () => {
    const text = serializeBackup(payload()).replace(
      `"version": ${BACKUP_VERSION}`,
      '"version": 99',
    );
    const result = parseBackup(text);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/newer version/);
  });

  it('refuses a file with no tasks in it — a training or expenses file — in words', () => {
    const training = JSON.stringify({ format: BACKUP_FORMAT, version: 1, workouts: [] });
    const expenses = JSON.stringify({ format: BACKUP_FORMAT, version: 2, money: {} });
    for (const text of [training, expenses, '{"hello":"world"}']) {
      const result = parseBackup(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe('That file has no tasks in it.');
    }
  });

  it('calls a backup of nothing at all empty', () => {
    const result = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 2 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/empty/);
  });

  it('refuses a JSON file that is simply something else', () => {
    expect(parseBackup('[1,2,3]').ok).toBe(false);
    expect(parseBackup('"a string"').ok).toBe(false);
  });

  it('accepts a hand-edited file that lost its format field but kept the tasks', () => {
    const text = serializeBackup(payload()).replace(`"format": "${BACKUP_FORMAT}",`, '');
    const result = parseBackup(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.tasks).toBe(2);
  });

  it('keeps absent chats absent, so a restore leaves this phone’s alone', () => {
    const result = parseBackup(serializeBackup(payload({ aiChats: undefined })));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.aiChats).toBeUndefined();
    expect(result.counts).toEqual({ tasks: 2 });
  });

  it('recounts rather than trusting the counts written in the file', () => {
    const text = serializeBackup(payload()).replace('"tasks": 2', '"tasks": 900');
    const result = parseBackup(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.tasks).toBe(2);
  });
});

describe('describeCounts', () => {
  it('reads as a sentence a human would say, singulars included', () => {
    expect(describeCounts({ tasks: 1, chats: 1 })).toBe('1 task · 1 AI chat');
    expect(describeCounts({ tasks: 9, chats: 0 })).toBe('9 tasks');
    expect(describeCounts({ tasks: 3, chats: 2 }, 'ru')).toBe('задачи: 3 · чата с ИИ: 2');
  });
});
