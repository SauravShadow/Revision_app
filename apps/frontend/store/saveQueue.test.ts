import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SaveQueue, type SaveStatus } from './saveQueue';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('SaveQueue', () => {
  it('coalesces rapid schedules into one save with the latest snapshot', async () => {
    const saves: string[] = [];
    let snap = 'v1';
    const q = new SaveQueue<string>(async (s) => { saves.push(s); }, () => snap, () => {});
    q.schedule();
    snap = 'v2';
    q.schedule();
    snap = 'v3';
    q.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(saves).toEqual(['v3']);
  });

  it('runs exactly one follow-up save for mutations arriving mid-flight', async () => {
    const saves: string[] = [];
    const gate = deferred();
    let snap = 'v1';
    const q = new SaveQueue<string>(
      async (s) => { saves.push(s); if (saves.length === 1) await gate.promise; },
      () => snap,
      () => {},
      800,
    );
    q.schedule();
    await vi.advanceTimersByTimeAsync(800); // first save now in flight, blocked on gate
    snap = 'v2';
    q.schedule();
    snap = 'v3';
    q.schedule();
    await vi.advanceTimersByTimeAsync(800); // debounce elapses while still in flight
    expect(saves).toEqual(['v1']); // no overlap
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(saves).toEqual(['v1', 'v3']); // one follow-up, newest snapshot
  });

  it('reports error on failure and recovers to saved on the next schedule', async () => {
    const statuses: SaveStatus[] = [];
    let fail = true;
    const q = new SaveQueue<string>(
      async () => { if (fail) throw new Error('boom'); },
      () => 'v',
      (s) => statuses.push(s),
      800,
    );
    q.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(statuses.at(-1)).toBe('error');
    fail = false;
    q.schedule();
    await vi.advanceTimersByTimeAsync(800);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('flush sends a pending save immediately with keepalive', async () => {
    const calls: { snap: string; keepalive: boolean }[] = [];
    const q = new SaveQueue<string>(
      async (snap, opts) => { calls.push({ snap, keepalive: opts.keepalive }); },
      () => 'v',
      () => {},
      800,
    );
    q.schedule();
    q.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([{ snap: 'v', keepalive: true }]);
    await vi.advanceTimersByTimeAsync(800); // debounce timer must be cancelled
    expect(calls).toHaveLength(1);
  });

  it('flush(false) sends a pending save without keepalive', async () => {
    const calls: { snap: string; keepalive: boolean }[] = [];
    const q = new SaveQueue<string>(
      async (snap, opts) => { calls.push({ snap, keepalive: opts.keepalive }); },
      () => 'v',
      () => {},
      800,
    );
    q.schedule();
    q.flush(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([{ snap: 'v', keepalive: false }]);
    await vi.advanceTimersByTimeAsync(800); // debounce timer must be cancelled
    expect(calls).toHaveLength(1);
  });

  it('flush with nothing pending is a no-op', async () => {
    const calls: string[] = [];
    const q = new SaveQueue<string>(async (s) => { calls.push(s); }, () => 'v', () => {}, 800);
    q.flush();
    await vi.advanceTimersByTimeAsync(800);
    expect(calls).toHaveLength(0);
  });

  it('stays saving when a new debounce window opens mid-flight', async () => {
    const saves: string[] = [];
    const statuses: SaveStatus[] = [];
    const gate = deferred();
    let snap = 'v1';
    const q = new SaveQueue<string>(
      async (s) => { saves.push(s); if (saves.length === 1) await gate.promise; },
      () => snap,
      (s) => statuses.push(s),
      800,
    );
    q.schedule();
    await vi.advanceTimersByTimeAsync(800); // first save now in flight, blocked on gate
    snap = 'v2';
    q.schedule(); // new debounce window opens mid-flight
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).not.toBe('saved'); // still saving: second window pending
    expect(statuses.at(-1)).toBe('saving');
    await vi.advanceTimersByTimeAsync(800); // second save completes
    expect(saves).toEqual(['v1', 'v2']);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('flush during an in-flight save keeps keepalive for the follow-up', async () => {
    const calls: { snap: string; keepalive: boolean }[] = [];
    const gate = deferred();
    let snap = 'v1';
    const q = new SaveQueue<string>(
      async (s, opts) => { calls.push({ snap: s, keepalive: opts.keepalive }); if (calls.length === 1) await gate.promise; },
      () => snap,
      () => {},
      800,
    );
    q.schedule();
    await vi.advanceTimersByTimeAsync(800); // first save now in flight, blocked on gate
    snap = 'v2';
    q.schedule(); // timer pending
    q.flush(); // should record rerun with keepalive=true
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([
      { snap: 'v1', keepalive: false },
      { snap: 'v2', keepalive: true },
    ]);
  });
});
