import { it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { MobileNavDrawer } from './MobileNavDrawer';
import { useStore } from '@/store/useStore';

beforeEach(() => {
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
});

it('is closed by default and opens on trigger click', () => {
  useStore.getState().addSubject('Structures');
  render(<DndContext><MobileNavDrawer /></DndContext>);

  expect(screen.queryByText('Structures')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Open menu'));
  expect(screen.getByText('Structures')).toBeInTheDocument();
});

it('closes on close-button click', () => {
  useStore.getState().addSubject('Structures');
  render(<DndContext><MobileNavDrawer /></DndContext>);
  fireEvent.click(screen.getByLabelText('Open menu'));
  fireEvent.click(screen.getByLabelText('Close menu'));
  expect(screen.queryByText('Structures')).not.toBeInTheDocument();
});

it('closes on Escape', () => {
  useStore.getState().addSubject('Structures');
  render(<DndContext><MobileNavDrawer /></DndContext>);
  fireEvent.click(screen.getByLabelText('Open menu'));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByText('Structures')).not.toBeInTheDocument();
});

it('closes when a nav link inside the tree is clicked', () => {
  useStore.getState().addSubject('Structures');
  render(<DndContext><MobileNavDrawer /></DndContext>);
  fireEvent.click(screen.getByLabelText('Open menu'));
  fireEvent.click(screen.getByText('Structures'));
  expect(screen.queryByText('Structures')).not.toBeInTheDocument();
});
