export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// Trailing-debounce, single-flight save queue. At most one save is ever in
// flight; mutations arriving mid-flight coalesce into exactly one follow-up
// carrying the newest snapshot, so requests can never land out of order.
export class SaveQueue<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private rerun = false;

  constructor(
    private readonly saveFn: (snapshot: T, opts: { keepalive: boolean }) => Promise<void>,
    private readonly getSnapshot: () => T,
    private readonly onStatus: (s: SaveStatus) => void,
    private readonly delayMs = 800,
  ) {}

  schedule(): void {
    this.onStatus('saving');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run(false);
    }, this.delayMs);
  }

  // Send a pending save immediately (tab close). No-op when nothing is pending.
  flush(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    void this.run(true);
  }

  private async run(keepalive: boolean): Promise<void> {
    if (this.inFlight) {
      this.rerun = true;
      return;
    }
    this.inFlight = true;
    let failed = false;
    try {
      await this.saveFn(this.getSnapshot(), { keepalive });
    } catch {
      failed = true;
    }
    this.inFlight = false;
    if (this.rerun) {
      this.rerun = false;
      void this.run(keepalive);
      return;
    }
    // A new debounce window may have opened while we were in flight.
    if (this.timer === null) this.onStatus(failed ? 'error' : 'saved');
  }
}
