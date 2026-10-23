import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'grokbot-inbox-theme';

export type Theme = 'light' | 'dark';

export function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* private mode */
  }
  // Dark is the default; an explicit system preference for light is respected.
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const chosen = useRef(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (!chosen.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore quota / private mode */
    }
  }, [theme]);

  function toggleTheme() {
    chosen.current = true;
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  return { theme, toggleTheme };
}
