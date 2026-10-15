/**
 * When the automatic backup actually writes: debounced, one at a time, and never
 * dropping the last change.
 *
 *   change ─┐
 *   change ─┼─ 2 s quiet ──► write ──► (a change arrived meanwhile?) ──► write again
 *   change ─┘
 *
 * Every persisted change asks for a backup (`hooks/useAutoBackup.ts`), and changes
 * come in bursts: an AI reply arrives as a run of updates, a set is edited three
 * fields at a time, an import replaces six stores in one tap. Writing the whole
 * file once per update would be dozens of SAF writes for one action, so a request
 * only (re)starts a short timer and the write happens once things are quiet.
 *
 * Two writes must never overlap — they target the same file, and two streams into
 * one SAF document interleave into something that is not JSON. So a timer that
 * fires mid-write does not start a second write; it marks one as owed, and the
 * running one does it when it finishes. That is also what keeps the LAST change:
 * a request during a write is never folded into a write that had already read the
 * stores.
 *
 * `flush` exists for the app leaving the foreground: Android may kill a
 * background process at any moment, and a change still waiting out its two
 * seconds when the user swipes the app away would otherwise be lost.
 *
 * Pure apart from the timer, which is injected, so the whole policy is testable
 * with fake timers and no React Native.
 */

export interface SchedulerTimers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimers: SchedulerTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** How long a burst may stay quiet before it is written. */
export const BACKUP_DEBOUNCE_MS = 2000;

export class BackupScheduler {
  private timer: unknown = null;
  private running: Promise<void> | null = null;
  private owed = false;

  constructor(
    private readonly write: () => Promise<unknown>,
    private readonly delayMs: number = BACKUP_DEBOUNCE_MS,
    private readonly timers: SchedulerTimers = realTimers,
  ) {}

  /** A write is waiting: on the timer, or owed after the one in progress. */
  get pending(): boolean {
    return this.timer !== null || this.owed;
  }

  /** Something changed. Restarts the quiet period. */
  request(): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = this.timers.set(() => {
      this.timer = null;
      void this.run();
    }, this.delayMs);
  }

  /**
   * Write now if anything is waiting; resolves when no write is in progress.
   * Nothing waiting and nothing running is a no-op — a flush is not a reason to
   * write an unchanged file.
   */
  flush(): Promise<void> {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
      return this.run();
    }
    return this.running ?? Promise.resolve();
  }

  /** Forget a waiting write (unmount). A write in progress finishes. */
  cancel(): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
    this.owed = false;
  }

  private run(): Promise<void> {
    if (this.running) {
      this.owed = true;
      return this.running;
    }
    this.running = this.loop();
    return this.running;
  }

  private async loop(): Promise<void> {
    do {
      this.owed = false;
      /*
       * Through a resolved promise, so even a writer that throws synchronously
       * yields first — otherwise the loop could finish (and clear `running`)
       * before `run` had stored it, leaving a settled promise there forever and
       * every later request "owed" to a write that never comes.
       */
      try {
        await Promise.resolve().then(() => this.write());
      } catch {
        // The writer reports its own failures; one failed write must not stop
        // the next change from being backed up.
      }
    } while (this.owed);
    this.running = null;
  }
}

/**
 * Run async jobs strictly one after another, whoever calls.
 *
 * The scheduler serializes the AUTOMATIC writes; this serializes them against
 * the manual ones (`Back up now`, `Export everything`), which go to the same file
 * and are started by a tap the scheduler knows nothing about.
 */
export function serialized<A extends unknown[], R>(
  job: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  let tail: Promise<unknown> = Promise.resolve();
  return (...args: A) => {
    const result = tail.then(() => job(...args));
    tail = result.catch(() => undefined);
    return result;
  };
}
