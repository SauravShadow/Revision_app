import { it, expect, vi, describe, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ usePathname: vi.fn(), useMemberships: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: mocks.usePathname }));
vi.mock('@/lib/orgs/useMemberships', () => ({ useMemberships: mocks.useMemberships }));

import { BottomTabBar } from './BottomTabBar';

beforeEach(() => {
  mocks.usePathname.mockReturnValue('/');
  mocks.useMemberships.mockReturnValue({ isCoach: false });
});

describe('BottomTabBar', () => {
  it('shows the core tabs and marks the current route active', () => {
    render(<BottomTabBar />);
    expect(screen.getByRole('link', { name: /Subjects/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Insights/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Calendar/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Search/ })).toBeInTheDocument();
  });

  it('hides Coaching for non-coaches and shows it for coaches', () => {
    const { rerender } = render(<BottomTabBar />);
    expect(screen.queryByRole('link', { name: /Coaching/ })).toBeNull();

    mocks.useMemberships.mockReturnValue({ isCoach: true });
    rerender(<BottomTabBar />);
    expect(screen.getByRole('link', { name: /Coaching/ })).toBeInTheDocument();
  });

  it('marks a non-home route active by prefix', () => {
    mocks.usePathname.mockReturnValue('/insights');
    render(<BottomTabBar />);
    expect(screen.getByRole('link', { name: /Insights/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Subjects/ })).not.toHaveAttribute('aria-current', 'page');
  });

  it('Search tab dispatches the open-command-palette event', () => {
    const handler = vi.fn();
    window.addEventListener('open-command-palette', handler);
    render(<BottomTabBar />);
    act(() => screen.getByRole('button', { name: /Search/ }).click());
    expect(handler).toHaveBeenCalled();
    window.removeEventListener('open-command-palette', handler);
  });
});
