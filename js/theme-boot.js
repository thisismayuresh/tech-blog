/**
 * Applies the saved (or system) theme before first paint so the page
 * never flashes the wrong colors. Kept in sync with js/theme.js —
 * this inline copy only sets the attribute; the module owns the toggle.
 */
(function () {
  var storageKey = 'theme-preference';
  var stored = null;

  try {
    stored = localStorage.getItem(storageKey);
  } catch (error) {
    stored = null;
  }

  var theme;

  if (stored === 'dark' || stored === 'light') {
    theme = stored;
  } else {
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = prefersDark ? 'dark' : 'light';
  }

  document.documentElement.dataset.theme = theme;
})();
