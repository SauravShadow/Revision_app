import { it, expect, describe } from 'vitest';
import { resolveTheme, THEMES, DEFAULT_THEME, STORAGE_KEY } from './theme';

describe('resolveTheme', () => {
  it('falls back to the default theme when nothing is stored', () => {
    expect(resolveTheme(null)).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME).toBe('engpad'); // decided 2026-07-17: default light theme
  });

  it('migrates the legacy ce-theme values (dark -> blueprint, light -> engpad)', () => {
    expect(resolveTheme('dark')).toBe('blueprint');
    expect(resolveTheme('light')).toBe('engpad');
  });

  it('passes through every current theme name unchanged', () => {
    for (const t of THEMES) expect(resolveTheme(t)).toBe(t);
  });

  it('falls back to the default for unknown or malformed values', () => {
    expect(resolveTheme('neon')).toBe(DEFAULT_THEME);
    expect(resolveTheme('')).toBe(DEFAULT_THEME);
    expect(resolveTheme('BLUEPRINT')).toBe(DEFAULT_THEME); // case-sensitive by design
  });

  it('exposes the legacy storage key so provider and inline script agree', () => {
    expect(STORAGE_KEY).toBe('ce-theme');
  });
});
