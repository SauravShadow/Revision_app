import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { TagManager } from './TagManager';
import { useStore } from '@/store/useStore';

// Utility classes that hardcode a dark palette instead of reading the theme
// tokens. On the two light themes (engpad, slate) these paint a dark surface
// while the text still inherits var(--ink) — near-black on near-black.
const HARDCODED_PALETTE = /(^|\s)(bg-neutral-|bg-black\/|bg-white\/|border-white\/|ring-white(\s|$)|text-white(\s|$))/;

const classesIn = (root: Element) =>
  [root, ...root.querySelectorAll('*')].map((el) => el.getAttribute('class') ?? '');

beforeEach(() => {
  useStore.setState({
    tags: { t1: { id: 't1', name: 'Formula', color: '#f59e0b', icon: 'Sigma', order: 0 } },
    tagOrder: ['t1'],
  });
});

describe('TagManager', () => {
  it('opens the manage-tags popover from the trigger', () => {
    render(<TagManager />);
    expect(screen.queryByPlaceholderText('New tag name')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /tags/i }));
    expect(screen.getByPlaceholderText('New tag name')).toBeInTheDocument();
  });

  it('paints the popover from theme tokens, so it stays legible on light themes', () => {
    render(<TagManager />);
    fireEvent.click(screen.getByRole('button', { name: /tags/i }));

    const panel = screen.getByRole('dialog', { name: /manage tags/i });
    expect(panel.className).toMatch(/(^|\s)bg-panel(\s|$)/);

    for (const cls of classesIn(panel)) {
      expect(cls).not.toMatch(HARDCODED_PALETTE);
    }
  });

  it('keeps the trigger itself on theme tokens too', () => {
    render(<TagManager />);
    expect(screen.getByRole('button', { name: /tags/i }).className).not.toMatch(HARDCODED_PALETTE);
  });
});
