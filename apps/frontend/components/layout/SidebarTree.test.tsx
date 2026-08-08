import { it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SidebarTree } from './SidebarTree';
import { useStore } from '@/store/useStore';

beforeEach(() => {
  localStorage.clear();
  useStore.setState({ subjects: {}, chapters: {}, topics: {}, subjectOrder: [] });
});

it('links to the marketing site in a new tab, safely', () => {
  render(<DndContext><SidebarTree /></DndContext>);
  const link = screen.getByRole('link', { name: /revisionworks\.in/i });
  expect(link).toHaveAttribute('href', 'https://info.revisionworks.in');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

it('gives the marketing link visible link affordance, not caption styling', () => {
  render(<DndContext><SidebarTree /></DndContext>);
  const link = screen.getByRole('link', { name: /revisionworks\.in/i });
  expect(link.className).toMatch(/(^|\s)site-link(\s|$)/);
});
