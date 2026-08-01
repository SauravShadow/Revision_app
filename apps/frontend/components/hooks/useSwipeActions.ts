'use client';
import { useRef, useState, useCallback } from 'react';

const CLAIM_THRESHOLD = 12;  // px of travel before the gesture belongs to us
const REVEAL_DISTANCE = 64;  // px past which release snaps open
const MAX_OFFSET = 128;      // width of the revealed action strip

/**
 * Horizontal swipe-to-reveal for list rows.
 *
 * Three things compete for a touch on these rows: page scroll, dnd-kit's
 * TouchSensor (reorder), and this. Phase 6b was deferred twice because of that
 * conflict. The rules that keep them apart:
 *   - `disabled` is set while a reorder drag is active — we never compete.
 *   - A gesture is only claimed once it has travelled CLAIM_THRESHOLD px *and*
 *     is more horizontal than vertical; otherwise it stays with the scroller.
 *   - Once a gesture is handed to the scroller it is not reclaimed mid-drag.
 *
 * Plain pointer events rather than framer-motion drag: framer would take the
 * pointer at gesture start, which is exactly the conflict being avoided.
 */
export function useSwipeActions({
  onArchive,
  onBookmark,
  disabled = false,
  threshold = CLAIM_THRESHOLD,
}: {
  onArchive: () => void;
  onBookmark: () => void;
  disabled?: boolean;
  threshold?: number;
}) {
  const [offset, setOffset] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const claimed = useRef(false);
  // Mirrors `offset` so pointerup can decide open-vs-closed without calling
  // setState from inside another setState updater (a render-phase side effect).
  const offsetRef = useRef(0);

  const applyOffset = useCallback((next: number) => {
    offsetRef.current = next;
    setOffset(next);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    start.current = { x: e.clientX, y: e.clientY };
    claimed.current = false;
  }, [disabled]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (disabled || !start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (!claimed.current) {
      if (Math.abs(dx) < threshold) return;
      // More vertical than horizontal: this belongs to the scroller. Give up
      // for the rest of the gesture rather than fighting it.
      if (Math.abs(dy) >= Math.abs(dx)) { start.current = null; return; }
      claimed.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    // Left-swipe only; clamp so the row can't be flung off-screen.
    applyOffset(Math.max(-MAX_OFFSET, Math.min(0, dx)));
  }, [disabled, threshold, applyOffset]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!claimed.current) { start.current = null; return; }
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const open = offsetRef.current <= -REVEAL_DISTANCE;
    setRevealed(open);
    applyOffset(open ? -MAX_OFFSET : 0);
    start.current = null;
    claimed.current = false;
  }, [applyOffset]);

  // The browser can take a gesture away mid-drag (scroll takeover, a system
  // edge swipe, the tab losing focus) and fire pointercancel instead of
  // pointerup. Without this the row is left translated part-way and stays
  // stuck there, since no further events arrive.
  const onPointerCancel = useCallback(() => {
    start.current = null;
    claimed.current = false;
    setRevealed(false);
    applyOffset(0);
  }, [applyOffset]);

  const close = useCallback(() => {
    setRevealed(false);
    applyOffset(0);
  }, [applyOffset]);

  return {
    offset,
    revealed,
    close,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    actions: { onArchive, onBookmark },
  };
}
