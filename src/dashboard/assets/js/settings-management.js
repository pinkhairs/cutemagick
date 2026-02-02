(function () {
  function initSettingsEditor(root) {
    if (root.dataset.init === '1') return;
    root.dataset.init = '1';

    const siteId = root.dataset.siteUuid;
    const form = root.querySelector('.settings-form');
    const saveBtn = root.querySelector('.save-settings');

    csrfFetch(`/admin/sites/${siteId}/settings`)
    .then(r => r.json())
    .then(data => {
      for (const [key, value] of Object.entries(data)) {
        const input = form.querySelector(`[name="${key}"]`);
        if (input && value != null) {
          input.value = value;
        }
      }
    });

saveBtn.addEventListener('click', async (e) => {
  e.preventDefault();

  const payload = Object.fromEntries(
    [...form.elements]
      .filter(el => el.name)
      .map(el => [el.name, el.value])
  );

  htmx.ajax('POST', `/admin/sites/${siteId}/settings`, {
    values: payload,
    swap: 'none'
  });
});

  }

  document.body.addEventListener('htmx:afterSwap', (e) => {
    const swapped = e.detail?.target;
    if (!swapped) return;

    swapped
      .querySelectorAll('.settings-editor')
      .forEach(initSettingsEditor);
  });
})();
