// Theming engine — the three shipped themes and the pure resolution logic
// shared by the React ThemeProvider and the blocking inline <head> script.
// Palettes live in app/globals.css under [data-theme="…"] blocks.

export const THEMES = ['blueprint', 'engpad', 'slate'] as const;
export type ThemeName = (typeof THEMES)[number];

// Default light theme on first load — decided 2026-07-17.
export const DEFAULT_THEME: ThemeName = 'engpad';

// Reuse the legacy key so existing users' stored preference is honoured/migrated.
export const STORAGE_KEY = 'ce-theme';

// Legacy boolean toggle stored 'dark' | 'light'; map those onto real themes.
const LEGACY: Record<string, ThemeName> = { dark: 'blueprint', light: 'engpad' };

const isTheme = (v: string): v is ThemeName => (THEMES as readonly string[]).includes(v);

/** Resolve a stored preference (or null) to a valid theme, migrating legacy values. */
export function resolveTheme(stored: string | null): ThemeName {
  if (!stored) return DEFAULT_THEME;
  if (isTheme(stored)) return stored;
  return LEGACY[stored] ?? DEFAULT_THEME;
}

// Browser-chrome / status-bar tint per theme — must track each palette's
// --ground-deep (the header strip) in app/globals.css.
export const THEME_COLORS: Record<ThemeName, string> = {
  blueprint: '#06111d',
  engpad: '#efe8d6',
  slate: '#eeeef1',
};

export const THEME_LABELS: Record<ThemeName, string> = {
  blueprint: 'Blueprint Dark',
  engpad: 'Engineering Pad',
  slate: 'Slate Minimal',
};
