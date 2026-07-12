'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const stored = localStorage.getItem('ce-theme');
    const isDark = stored ? stored === 'dark' : true;
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('ce-theme', next ? 'dark' : 'light');
  };
  return (
    <button onClick={toggle} aria-label="Toggle theme"
      className="rounded-lg border border-white/10 p-2 transition hover:bg-white/5">
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
