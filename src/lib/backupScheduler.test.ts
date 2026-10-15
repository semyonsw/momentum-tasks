import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BACKUP_DEBOUNCE_MS, BackupScheduler, serialized } from './backupScheduler';

/**
 * When the automatic backup writes.
 *
 * Three promises, each one a bug if broken: a burst is ONE write, two writes
 * never overlap (they target the same file), and the last change is never lost —
 * not to a write that had already read the stores, and not to the app being
 * swiped away during the quiet period.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** A writer whose writes finish only when the test says so. */
function controlledWriter() {
  const finishers: (() => void)[] = [];
  let active = 0;
  let maxActive = 0;
  const write = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        finishers.push(() => {
          active -= 1;
          resolve();
        });
      }),
  );
  return {
    write,
    finishNext: async () => {
      finishers.shift()?.();
      await vi.advanceTimersByTimeAsync(0);
    },
    get maxActive() {
      return maxActive;
    },
  };
}

describe('debouncing', () => {
  it('turns a burst into one write, after the quiet period', async () => {
    const write = vi.fn(async () => undefined);
    const scheduler = new BackupScheduler(write, 2000);

    for (let i = 0; i < 10; i += 1) {
      scheduler.request();
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(write).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1999);
    expect(write).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toBe(false);
  });

  it('defaults to about two seconds', async () => {
    expect(BACKUP_DEBOUNCE_MS).toBe(2000);
    const write = vi.fn(async () => undefined);
    const scheduler = new BackupScheduler(write);
    scheduler.request();
    await vi.advanceTimersByTimeAsync(1999);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a request', async () => {
    const write = vi.fn(async () => undefined);
    new BackupScheduler(write, 2000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(write).not.toHaveBeenCalled();
  });
});

describe('never two writes at once', () => {
  it('owes one more write for a change that lands mid-write, and runs it after', async () => {
    const w = controlledWriter();
    const scheduler = new BackupScheduler(w.write, 2000);

    scheduler.request();
    await vi.advanceTimersByTimeAsync(2000);
    expect(w.write).toHaveBeenCalledTimes(1);

    // Two changes while the first write is still going.
    scheduler.request();
    await vi.advanceTimersByTimeAsync(2000);
    scheduler.request();
    await vi.advanceTimersByTimeAsync(2000);
    expect(w.write).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toBe(true);

    await w.finishNext();
    // Exactly one more — the owed write reads the stores as they are NOW.
    expect(w.write).toHaveBeenCalledTimes(2);
    await w.finishNext();
    expect(w.write).toHaveBeenCalledTimes(2);
    expect(w.maxActive).toBe(1);
    expect(scheduler.pending).toBe(false);
  });

  it('keeps going after a write that failed', async () => {
    const write = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(undefined);
    const scheduler = new BackupScheduler(write, 2000);
    scheduler.request();
    await vi.advanceTimersByTimeAsync(2000);
    scheduler.request();
    await vi.advanceTimersByTimeAsync(2000);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('survives a writer that throws synchronously', async () => {
    const write = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => {
        throw new Error('sync');
      })
      .mockResolvedValue(undefined);
    const scheduler = new BackupScheduler(write, 2000);
    scheduler.request();
    await vi.advanceTimersByTimeAsync(2000);
    scheduler.request();
    await vi.advanceTimersByTimeAsync(2000);
    expect(write).toHaveBeenCalledTimes(2);
  });
});

describe('flushing when the app leaves the screen', () => {
  it('writes a waiting change at once instead of after the quiet period', async () => {
    const write = vi.fn(async () => undefined);
    const scheduler = new BackupScheduler(write, 2000);
    scheduler.request();
    await vi.advanceTimersByTimeAsync(300);

    await scheduler.flush();
    expect(write).toHaveBeenCalledTimes(1);

    // And the timer it replaced does not write a second time.
    await vi.advanceTimersByTimeAsync(5000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('is a no-op with nothing waiting', async () => {
    const write = vi.fn(async () => undefined);
    const scheduler = new BackupScheduler(write, 2000);
    await scheduler.flush();
    expect(write).not.toHaveBeenCalled();
  });

  it('does not start a second write beside one in progress', async () => {
    const w = controlledWriter();
    const scheduler = new BackupScheduler(w.write, 2000);
    scheduler.request();
    await vi.advanceTimersByTimeAsync(2000);
    scheduler.request();
    const flushed = scheduler.flush();
    expect(w.write).toHaveBeenCalledTimes(1);

    await w.finishNext();
    expect(w.write).toHaveBeenCalledTimes(2);
    await w.finishNext();
    await flushed;
    expect(w.maxActive).toBe(1);
  });

  it('forgets a waiting write on cancel', async () => {
    const write = vi.fn(async () => undefined);
    const scheduler = new BackupScheduler(write, 2000);
    scheduler.request();
    scheduler.cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(write).not.toHaveBeenCalled();
    expect(scheduler.pending).toBe(false);
  });
});

describe('serialized', () => {
  it('runs jobs one after another, in call order, whoever calls', async () => {
    const log: string[] = [];
    let active = 0;
    let maxActive = 0;
    const job = serialized(async (name: string, ms: number) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      log.push(`start ${name}`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      log.push(`end ${name}`);
      active -= 1;
      return name;
    });

    const a = job('auto', 100);
    const b = job('tap', 10);
    await vi.advanceTimersByTimeAsync(200);
    await expect(a).resolves.toBe('auto');
    await expect(b).resolves.toBe('tap');
    expect(log).toEqual(['start auto', 'end auto', 'start tap', 'end tap']);
    expect(maxActive).toBe(1);
  });

  it('lets a failure reach its caller without blocking the next job', async () => {
    const job = serialized(async (fail: boolean) => {
      if (fail) throw new Error('nope');
      return 'ok';
    });
    await expect(job(true)).rejects.toThrow('nope');
    await expect(job(false)).resolves.toBe('ok');
  });
});
