import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAi, type AiMessage } from './aiStore';
import { BACKED_UP_FIELDS } from '../lib/backupWatch';
import { storesHydrated, watchBackedUpStores } from './backupWatch';
import { DEFAULT_SETTINGS, useSettings } from './settingsStore';
import { useTasks } from './tasksStore';

/**
 * Which REAL store changes ask for a backup write.
 *
 * The rule is in `lib/backupWatch.ts`; these pin it to the stores as they are,
 * because the failures are about them: the AI store flipping `pending` around
 * every question must not write, the backup recording itself in settings must not
 * write (or every write asks for the next one), and a setting, a task or a chat
 * message must.
 */

const user = (id: string): AiMessage => ({ id, role: 'user', text: id, at: '2026-10-15' });

beforeAll(async () => {
  await Promise.all([useSettings, useTasks, useAi].map((store) => store.persist.rehydrate()));
});

let onChange: ReturnType<typeof vi.fn>;
let stop: () => void;

beforeEach(() => {
  useSettings.getState().importSettings(DEFAULT_SETTINGS);
  onChange = vi.fn();
  stop = watchBackedUpStores(onChange);
});

afterEach(() => stop());

describe('what asks for a write', () => {
  it('has every store hydrated in this suite, so a silence below means "not a change"', () => {
    expect(storesHydrated()).toBe(true);
  });

  it('a setting', () => {
    useSettings.getState().setTasksTrendRange('year');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('a task', () => {
    useTasks.getState().addTask({ name: 'Stretch', schedule: { kind: 'daily' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('an AI chat message', () => {
    useAi.getState().appendMessage(user('q'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('what does not', () => {
  it('a question going in flight and landing', () => {
    useAi.getState().setPending(true);
    useAi.getState().setRetrying(true);
    useAi.getState().setPending(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('the backup recording itself — which would otherwise be a loop', () => {
    useSettings
      .getState()
      .recordBackup('2026-10-15T10:00:00.000Z', { uri: 'content://f', day: '2026-10-15' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('the backup switch and its folder', () => {
    useSettings.getState().setAutoBackupEnabled(false);
    useSettings.getState().setAutoBackupFolder('content://tree/elsewhere');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a set that changes nothing', () => {
    useTasks.setState({});
    useAi.setState({});
    expect(onChange).not.toHaveBeenCalled();
  });

  it('anything, once unsubscribed', () => {
    stop();
    useSettings.getState().setTasksTrendRange('week');
    expect(onChange).not.toHaveBeenCalled();
  });
});

/*
 * The watch lists are hand-written, so they can fall behind the stores. Every
 * field a store persists is a field the backup carries, so the persisted keys
 * are the list the watcher must cover.
 */
describe('the watch lists cover every persisted field', () => {
  const persisted = (
    store: { persist: { getOptions: () => { partialize?: unknown } } },
    state: object,
  ) => {
    const partialize = store.persist.getOptions().partialize as (state: object) => object;
    return Object.keys(partialize(state));
  };

  it('tasks', () => {
    for (const key of persisted(useTasks, useTasks.getState())) {
      expect(BACKED_UP_FIELDS.tasks).toContain(key);
    }
  });
});
