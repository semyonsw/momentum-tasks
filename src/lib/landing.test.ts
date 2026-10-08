import { describe, expect, it } from 'vitest';

import { landingAccount, nextUnansweredTask, quickActions } from './landing';
import type { Task, TaskLog } from './tasks';

/*
 * The landing's three decisions (U9, U10). The account rule is the bug that
 * started this: `accounts[0]` was read even after it was archived.
 */

const MON = '2026-10-05';

function account(id: string, archivedAt: string | null = null) {
  return { id, name: id, archivedAt };
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    name: 'Morning reading',
    schedule: { kind: 'daily' },
    auto: null,
    startedOn: '2026-09-01',
    reminder: null,
    archivedAt: null,
    order: 0,
    ...over,
  };
}

describe('landingAccount', () => {
  it('skips an archived first account and reads the first live one', () => {
    const accounts = [account('cash', '2026-09-30T10:00:00.000Z'), account('card')];
    expect(landingAccount(accounts, null)?.id).toBe('card');
  });

  it('reads the first account when it is live and nothing was chosen', () => {
    expect(landingAccount([account('cash'), account('card')], null)?.id).toBe('cash');
  });

  it('reads the account last chosen in the money section', () => {
    expect(landingAccount([account('cash'), account('card')], 'card')?.id).toBe('card');
  });

  it('ignores a chosen account that has since been archived', () => {
    const accounts = [account('cash'), account('card', '2026-10-01T09:00:00.000Z')];
    expect(landingAccount(accounts, 'card')?.id).toBe('cash');
  });

  it('ignores a chosen id that no longer exists', () => {
    expect(landingAccount([account('cash')], 'gone')?.id).toBe('cash');
  });

  it('answers null rather than an archived account when none is live', () => {
    expect(landingAccount([account('cash', '2026-09-30T10:00:00.000Z')], null)).toBeNull();
    expect(landingAccount([], null)).toBeNull();
  });
});

describe('nextUnansweredTask', () => {
  const read = task({ id: 'read', name: 'Read', order: 0 });
  const walk = task({ id: 'walk', name: 'Walk', order: 1 });
  const gym = task({ id: 'gym', name: 'Gym', order: 2, auto: 'workout' });
  const stretch = task({ id: 'stretch', name: 'Stretch', order: 3 });

  it('offers the first unanswered row in the Tasks screen order', () => {
    // Stored out of order on purpose: the screen's order is `order`, not the array.
    expect(nextUnansweredTask([walk, read], {}, MON, { autoTick: false })?.id).toBe('read');
  });

  it('passes over done and skipped-on-purpose rows: both are answers', () => {
    const log: TaskLog = {
      read: { [MON]: { mark: 'done', note: '' } },
      walk: { [MON]: { mark: 'missed', note: '' } },
    };
    expect(nextUnansweredTask([read, walk, stretch], log, MON, { autoTick: false })?.id).toBe(
      'stretch',
    );
  });

  it('treats a row with only a note as unanswered', () => {
    const log: TaskLog = { read: { [MON]: { mark: null, note: 'later' } } };
    expect(nextUnansweredTask([read], log, MON, { autoTick: false })?.id).toBe('read');
  });

  it('leaves an auto row to the app while the app ticks it', () => {
    const log: TaskLog = {
      read: { [MON]: { mark: 'done', note: '' } },
      walk: { [MON]: { mark: 'done', note: '' } },
    };
    expect(nextUnansweredTask([read, walk, gym, stretch], log, MON, { autoTick: true })?.id).toBe(
      'stretch',
    );
  });

  it('offers an auto row like any other when the switch is off', () => {
    const log: TaskLog = {
      read: { [MON]: { mark: 'done', note: '' } },
      walk: { [MON]: { mark: 'done', note: '' } },
    };
    expect(nextUnansweredTask([read, walk, gym, stretch], log, MON, { autoTick: false })?.id).toBe(
      'gym',
    );
  });

  it('only offers a task that asks today', () => {
    // 2026-10-05 is a Monday; index 1 is Tuesday.
    const tuesdays = task({ id: 'tue', schedule: { kind: 'weekdays', days: [1] } });
    const tomorrow = task({ id: 'once', schedule: { kind: 'once', day: '2026-10-06' } });
    expect(nextUnansweredTask([tuesdays, tomorrow], {}, MON, { autoTick: false })).toBeNull();
  });

  it('does not offer an archived task', () => {
    const gone = task({ archivedAt: '2026-09-20T08:00:00.000Z' });
    expect(nextUnansweredTask([gone], {}, MON, { autoTick: false })).toBeNull();
  });

  it('is null when every row is answered', () => {
    const log: TaskLog = { read: { [MON]: { mark: 'done', note: '' } } };
    expect(nextUnansweredTask([read], log, MON, { autoTick: false })).toBeNull();
  });
});

describe('quickActions', () => {
  it('has no + Expense without a live account to write it into', () => {
    expect(quickActions({ hasAccount: false, hasNextTask: true, sessionLive: false })).toEqual([
      'task',
    ]);
  });

  it('always offers + Expense, first', () => {
    expect(quickActions({ hasAccount: true, hasNextTask: false, sessionLive: false })).toEqual([
      'expense',
    ]);
  });

  it('shows the task only while one is waiting', () => {
    expect(quickActions({ hasAccount: true, hasNextTask: true, sessionLive: false })).toEqual([
      'expense',
      'task',
    ]);
  });

  it('shows Resume only with a live session', () => {
    expect(quickActions({ hasAccount: true, hasNextTask: false, sessionLive: true })).toEqual([
      'expense',
      'resume',
    ]);
    expect(quickActions({ hasAccount: true, hasNextTask: true, sessionLive: true })).toEqual([
      'expense',
      'task',
      'resume',
    ]);
  });
});
