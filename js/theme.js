/**
 * Light/dark theme preference: system default, manual override in
 * localStorage. Both pages import this; the very first paint is handled
 * by a tiny inline script in each HTML head (avoids a flash of wrong theme).
 */

const STORAGE_KEY = 'theme-preference';

export function resolveTheme() {
  const storedTheme = localStorage.getItem(STORAGE_KEY);

  if (storedTheme === 'dark' || storedTheme === 'light') {
    return storedTheme;
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

function toggleLabelFor(theme) {
  if (theme === 'dark') {
    return 'Switch to light mode';
  }
  return 'Switch to dark mode';
}

function updateToggleButton(theme) {
  const button = document.getElementById('theme-toggle');

  if (button === null) {
    return;
  }

  button.setAttribute('aria-label', toggleLabelFor(theme));
  button.setAttribute('title', toggleLabelFor(theme));
  button.dataset.theme = theme;
}

export function initThemeToggle() {
  const button = document.getElementById('theme-toggle');

  if (button === null) {
    return;
  }

  const initialTheme = resolveTheme();
  applyTheme(initialTheme);
  updateToggleButton(initialTheme);

  button.addEventListener('click', () => {
    const currentTheme = document.documentElement.dataset.theme;
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';

    localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
    updateToggleButton(nextTheme);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    const storedTheme = localStorage.getItem(STORAGE_KEY);

    if (storedTheme === 'dark' || storedTheme === 'light') {
      return;
    }

    const themeFromSystem = event.matches ? 'dark' : 'light';
    applyTheme(themeFromSystem);
    updateToggleButton(themeFromSystem);
  });
}
