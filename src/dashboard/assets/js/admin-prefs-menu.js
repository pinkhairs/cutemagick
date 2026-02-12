// Admin preferences menu (tippy dropdown)
const button = document.getElementById('admin-prefs-btn');
tippy(button, {
  trigger: 'click',
  interactive: true,
  placement: 'top-end',
  content: renderPrefsMenu(),
});

function fireRefreshBackground() {
  document.body.dispatchEvent(
    new Event('refreshBackground')
  );
}

function renderPrefsMenu() {
  const el = document.createElement('div');
  el.className = 'flex flex-col gap-2 w-48';

  // Replace background image
  const bgBtn = document.createElement('button');
  bgBtn.textContent = 'Replace background image';
  bgBtn.onclick = () => {
    const prefs = loadPrefs();

    const url = prompt(
      'Background image URL:',
      prefs.background_image || ''
    );
    if (url === null) return;

    savePref('background_image', url || null);
    fireRefreshBackground();
    applyPrefs();
  };

  // Toggle overlay
  const overlayBtn = document.createElement('button');

  function updateOverlayLabel() {
    const prefs = loadPrefs();
    overlayBtn.textContent =
      prefs.show_background_overlay !== false
        ? 'Hide background overlay'
        : 'Show background overlay';
  }

  overlayBtn.onclick = () => {
    const prefs = loadPrefs();
    const overlayOn = prefs.show_background_overlay !== false;

    savePref(
      'show_background_overlay',
      !overlayOn
    );

    fireRefreshBackground();
    updateOverlayLabel();
    applyPrefs();
  };

  updateOverlayLabel();

  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', applyTheme);

  // Theme toggle
  const themeBtn = document.createElement('button');

  function updateThemeLabel() {
    const { theme_mode = 'auto' } = loadPrefs();
    themeBtn.textContent =
      theme_mode === 'light' ? 'Theme: Light' :
      theme_mode === 'dark'  ? 'Theme: Dark'  :
                               'Theme: Auto';
  }

  themeBtn.onclick = () => {
    const { theme_mode = 'auto' } = loadPrefs();

    const next =
      theme_mode === 'auto' ? 'light' :
      theme_mode === 'light' ? 'dark' :
      'auto';

    savePref('theme_mode', next);
    applyTheme();
    updateThemeLabel();
  };

  updateThemeLabel();

  el.append(bgBtn, overlayBtn, themeBtn);
  return el;
}
