import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumb } from './Breadcrumb';

const TRAIL = [
  { label: 'Subjects', href: '/' },
  { label: 'Hydrology', href: '/subject/s1' },
  { label: 'Rainfall', href: '/chapter/c1' },
  { label: 'Unit hydrograph' },
];

it('renders the full trail plus a phone-only back link to the deepest parent', () => {
  render(<Breadcrumb items={TRAIL} />);

  // Full trail (hidden below sm by CSS, present in the DOM).
  expect(screen.getByRole('link', { name: 'Subjects' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'Hydrology' })).toHaveAttribute('href', '/subject/s1');

  // The back link targets the chapter — the nearest navigable ancestor — so
  // "back" on a topic page goes up one level, not to the root.
  const back = screen.getAllByRole('link', { name: 'Rainfall' });
  expect(back).toHaveLength(2); // one in the trail, one as the back link
  expect(back.every((a) => a.getAttribute('href') === '/chapter/c1')).toBe(true);
});

it('omits the back link when nothing above is navigable', () => {
  render(<Breadcrumb items={[{ label: 'Insights' }]} />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByText('Insights')).toBeInTheDocument();
});
