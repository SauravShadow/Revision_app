import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { NavTree } from './NavTree';
import { useStore } from '@/store/useStore';

beforeEach(() => {
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
});

it('renders subjects and calls onNavigate when a subject link is clicked', () => {
  useStore.getState().addSubject('Fluid Mechanics');
  const onNavigate = vi.fn();
  render(<DndContext><NavTree onNavigate={onNavigate} /></DndContext>);
  fireEvent.click(screen.getByText('Fluid Mechanics'));
  expect(onNavigate).toHaveBeenCalledTimes(1);
});

it('renders without crashing when onNavigate is omitted', () => {
  useStore.getState().addSubject('Thermodynamics');
  render(<DndContext><NavTree /></DndContext>);
  expect(screen.getByText('Thermodynamics')).toBeInTheDocument();
});
