import { it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipeActions } from './useSwipeActions';

const pointer = (x: number, y: number) => ({
  clientX: x, clientY: y, pointerId: 1,
  currentTarget: { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() },
}) as never;

it('ignores a mostly-vertical drag so the page can still scroll', () => {
  const { result } = renderHook(() => useSwipeActions({ onArchive: vi.fn(), onBookmark: vi.fn() }));
  act(() => { result.current.handlers.onPointerDown(pointer(200, 100)); });
  act(() => { result.current.handlers.onPointerMove(pointer(196, 160)); });
  expect(result.current.offset).toBe(0);
});

it('claims a mostly-horizontal drag past the threshold', () => {
  const { result } = renderHook(() => useSwipeActions({ onArchive: vi.fn(), onBookmark: vi.fn() }));
  act(() => { result.current.handlers.onPointerDown(pointer(200, 100)); });
  act(() => { result.current.handlers.onPointerMove(pointer(150, 104)); });
  expect(result.current.offset).toBeLessThan(0);
});

it('reveals the actions once dragged past the reveal distance', () => {
  const { result } = renderHook(() => useSwipeActions({ onArchive: vi.fn(), onBookmark: vi.fn() }));
  act(() => { result.current.handlers.onPointerDown(pointer(300, 100)); });
  act(() => { result.current.handlers.onPointerMove(pointer(200, 102)); });
  act(() => { result.current.handlers.onPointerUp(pointer(200, 102)); });
  expect(result.current.revealed).toBe(true);
});

it('springs back when released short of the reveal distance', () => {
  const { result } = renderHook(() => useSwipeActions({ onArchive: vi.fn(), onBookmark: vi.fn() }));
  act(() => { result.current.handlers.onPointerDown(pointer(300, 100)); });
  act(() => { result.current.handlers.onPointerMove(pointer(285, 102)); });
  act(() => { result.current.handlers.onPointerUp(pointer(285, 102)); });
  expect(result.current.revealed).toBe(false);
  expect(result.current.offset).toBe(0);
});

it('does nothing at all while a reorder drag is active', () => {
  const { result } = renderHook(() => useSwipeActions({ onArchive: vi.fn(), onBookmark: vi.fn(), disabled: true }));
  act(() => { result.current.handlers.onPointerDown(pointer(300, 100)); });
  act(() => { result.current.handlers.onPointerMove(pointer(200, 100)); });
  expect(result.current.offset).toBe(0);
});

it('does not track a right-swipe past the closed position', () => {
  const { result } = renderHook(() => useSwipeActions({ onArchive: vi.fn(), onBookmark: vi.fn() }));
  act(() => { result.current.handlers.onPointerDown(pointer(100, 100)); });
  act(() => { result.current.handlers.onPointerMove(pointer(200, 102)); });
  expect(result.current.offset).toBe(0);
});

it('close() puts the row back', () => {
  const { result } = renderHook(() => useSwipeActions({ onArchive: vi.fn(), onBookmark: vi.fn() }));
  act(() => { result.current.handlers.onPointerDown(pointer(300, 100)); });
  act(() => { result.current.handlers.onPointerMove(pointer(200, 102)); });
  act(() => { result.current.handlers.onPointerUp(pointer(200, 102)); });
  act(() => { result.current.close(); });
  expect(result.current.revealed).toBe(false);
  expect(result.current.offset).toBe(0);
});
