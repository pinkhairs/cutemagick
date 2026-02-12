// User preferences management (theme, background)
const PREFS_KEY = 'cm:admin:prefs';

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

function applyTheme() {
  const prefs = loadPrefs();
  const mode = prefs.theme_mode || 'auto';
  const root = document.documentElement;

  root.classList.remove('dark');

  if (mode === 'dark') {
    root.classList.add('dark');
  } else if (mode === 'light') {
    // explicitly light: do nothing
  } else {
    // auto
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('dark');
    }
  }
}

document.addEventListener('DOMContentLoaded', applyPrefs);

function savePref(key, value) {
  const prefs = loadPrefs();

  if (value === null || value === undefined) {
    delete prefs[key];
  } else {
    prefs[key] = value;
  }

  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function applyPrefs() {
  applyTheme();
  const prefs = loadPrefs();
  const bg = document.getElementById('background');
  if (!bg) return;

  if (prefs.background_image) {
    // Validate URL to prevent CSS injection
    try {
      const url = new URL(prefs.background_image, window.location.origin);
      if (!['http:', 'https:', 'data:'].includes(url.protocol)) {
        console.warn('Invalid background image protocol:', url.protocol);
        bg.style.removeProperty('background-image');
        savePref('background_image', null);
        return;
      }
      // Escape quotes to prevent breaking out of url()
      const safeUrl = prefs.background_image.replace(/["'\\]/g, '\\$&');
      bg.style.backgroundImage = `url("${safeUrl}")`;
    } catch (e) {
      console.warn('Invalid background image URL:', e);
      bg.style.removeProperty('background-image');
      savePref('background_image', null);
    }
  } else {
    bg.style.removeProperty('background-image');
  }

  const overlayOn = prefs.show_background_overlay !== false;
  bg.classList.toggle('lower-opacity-bg', overlayOn);
}

document.addEventListener('DOMContentLoaded', () => {
  const prefs = loadPrefs();
  applyPrefs(prefs);
});
