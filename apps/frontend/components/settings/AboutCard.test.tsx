import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AboutCard } from './AboutCard';

describe('AboutCard', () => {
  it('links to the marketing site in a new tab, safely', () => {
    render(<AboutCard />);
    const link = screen.getByRole('link', { name: /revisionworks\.in/i });
    expect(link).toHaveAttribute('href', 'https://info.revisionworks.in');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
