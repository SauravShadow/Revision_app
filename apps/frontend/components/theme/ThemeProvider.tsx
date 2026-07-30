'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DEFAULT_THEME, resolveTheme, STORAGE_KEY, THEME_COLORS, type ThemeName } from '@/lib/theme/theme';

type ThemeContextValue = { theme: ThemeName; setTheme: (t: ThemeName) => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

function apply(theme: ThemeName) {
  document.documentElement.setAttribute('data-theme', theme);
  // Keep the browser chrome / TWA status bar on the theme's header colour.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[theme]);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // SSR renders the default; the blocking <head> script has already set the real
  // data-theme before paint, so this effect just syncs React state to it.
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);

  useEffect(() => {
    const resolved = resolveTheme(localStorage.getItem(STORAGE_KEY));
    setThemeState(resolved);
    apply(resolved);
  }, []);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable (private mode) — theme still applies for this session */
    }
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
