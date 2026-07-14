import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndProvider } from './DndProvider';

it('renders children without crashing', () => {
  render(<DndProvider><div>content</div></DndProvider>);
  expect(screen.getByText('content')).toBeInTheDocument();
});
