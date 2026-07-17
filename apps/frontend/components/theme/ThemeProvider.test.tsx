import { it, expect, beforeEach, describe } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeProvider';
import { STORAGE_KEY } from '@/lib/theme/theme';

function Probe() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="current">{theme}</span>
      <button onClick={() => setTheme('slate')}>slate</button>
      <button onClick={() => setTheme('blueprint')}>blueprint</button>
    </div>
  );
}

const renderApp = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeProvider', () => {
  it('applies the default theme to <html> and context when nothing is stored', () => {
    renderApp();
    expect(screen.getByTestId('current').textContent).toBe('engpad');
    expect(document.documentElement.getAttribute('data-theme')).toBe('engpad');
  });

  it('migrates a legacy stored value on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    renderApp();
    expect(screen.getByTestId('current').textContent).toBe('blueprint');
    expect(document.documentElement.getAttribute('data-theme')).toBe('blueprint');
  });

  it('setTheme updates <html>, context, and persists the choice', () => {
    renderApp();
    act(() => {
      screen.getByText('slate').click();
    });
    expect(screen.getByTestId('current').textContent).toBe('slate');
    expect(document.documentElement.getAttribute('data-theme')).toBe('slate');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('slate');
  });
});
