'use client';
import { Check } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { THEMES, THEME_LABELS, type ThemeName } from '@/lib/theme/theme';

// Representative swatch colours so each option previews its own palette while
// rendered under whatever theme is currently active (the picker can't inherit
// three palettes at once). Kept in step with the [data-theme] blocks in globals.css.
const SWATCH: Record<ThemeName, { ground: string; ink: string; accent: string; rule: string }> = {
  engpad:    { ground: '#faf7ef', ink: '#2b2a24', accent: '#c0392b', rule: 'rgba(74,124,89,0.35)' },
  blueprint: { ground: '#0a1a2b', ink: '#e7f1f9', accent: '#4fc3f7', rule: 'transparent' },
  slate:     { ground: '#fafafa', ink: '#1a1a1f', accent: '#4f46e5', rule: 'transparent' },
};

export function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="auth-field">
      <span className="auth-label">Appearance</span>
      <div className="grid grid-cols-3 gap-2">
        {THEMES.map((name) => {
          const s = SWATCH[name];
          const selected = theme === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setTheme(name)}
              aria-pressed={selected}
              aria-label={`Use the ${THEME_LABELS[name]} theme`}
              className={`group relative flex flex-col gap-1.5 rounded-xl border p-1.5 text-left transition ${
                selected
                  ? 'border-accent shadow-[0_0_0_1px_var(--accent)]'
                  : 'border-line hover:border-line-strong'
              }`}
            >
              {/* mini drafting sheet */}
              <span
                className="relative block h-12 w-full overflow-hidden rounded-lg"
                style={{
                  background: s.ground,
                  backgroundImage: `linear-gradient(${s.rule} 1px, transparent 1px), linear-gradient(90deg, ${s.rule} 1px, transparent 1px)`,
                  backgroundSize: '9px 9px',
                }}
              >
                <span
                  className="absolute left-2 top-2 h-1.5 w-8 rounded-full"
                  style={{ background: s.ink, opacity: 0.85 }}
                />
                <span
                  className="absolute left-2 top-4 h-1.5 w-5 rounded-full"
                  style={{ background: s.ink, opacity: 0.4 }}
                />
                <span
                  className="absolute bottom-2 right-2 h-3 w-3 rounded-full"
                  style={{ background: s.accent }}
                />
                {selected && (
                  <span
                    className="absolute inset-0 grid place-items-center"
                    style={{ background: 'color-mix(in srgb, var(--ground) 30%, transparent)' }}
                  >
                    <Check size={16} className="text-accent" strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="tblabel truncate px-0.5 text-[0.6rem]">{THEME_LABELS[name]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
