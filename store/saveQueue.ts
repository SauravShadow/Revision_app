export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// Trailing-debounce, single-flight save queue. At most one save is ever in
// flight; mutations arriving mid-flight coalesce into exactly one follow-up
// carrying the newest snapshot, so requests can never land out of order.
export class SaveQueue<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private rerun = false;
  private rerunKeepalive = false;

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

  // Send a pending save immediately (tab close / hide). No-op when nothing
  // is pending. keepalive defaults to true for the pagehide last-ditch case;
  // pass false for a normal in-page flush (e.g. visibilitychange → hidden,
  // where the page is still alive and the request isn't quota-bound).
  //
  // Safe to no-op when this.timer is null even if a save is currently in
  // flight: schedule() unconditionally (re)arms this.timer regardless of
  // inFlight, so the only way for the timer to be null while inFlight is
  // true is that no mutation has arrived since the in-flight run captured
  // its snapshot via getSnapshot(). That in-flight request therefore
  // already carries the latest data, so there is nothing new to flush.
  flush(keepalive = true): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    void this.run(keepalive);
  }

  private async run(keepalive: boolean): Promise<void> {
    if (this.inFlight) {
      this.rerun = true;
      this.rerunKeepalive = this.rerunKeepalive || keepalive;
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
      const ka = this.rerunKeepalive;
      this.rerunKeepalive = false;
      void this.run(ka);
      return;
    }
    // A new debounce window may have opened while we were in flight.
    if (this.timer === null) this.onStatus(failed ? 'error' : 'saved');
  }
}
