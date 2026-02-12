// Site window management
window.openSiteWindow = function ({ uuid }) {
  const existing = document.getElementById(`site-window-${uuid}`);
  if (existing) {
    window.DraggableWindows?.focusWindow(existing);
    return;
  }

  const key = `win-path-site-${uuid}`;
  const currentPath = localStorage.getItem(key) || '';

  const url = currentPath
    ? `/admin/site-window/${uuid}/${currentPath}`
    : `/admin/site-window/${uuid}`;

  window.htmx.ajax('GET', url, {
    target: '#windows',
    swap: 'afterbegin',
    pushUrl: false,
  });
};
