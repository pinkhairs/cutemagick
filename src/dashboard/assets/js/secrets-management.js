console.log('[Secrets] script loaded');

(function () {
  function initSecretsEditor(root) {
    // Guard: initialize once per editor
    if (root.dataset.init === '1') return;
    root.dataset.init = '1';

    console.log('[Secrets] init', root);

    const siteId = root.dataset.siteUuid;
    if (!siteId) {
      console.warn('[Secrets] missing data-site-uuid', root);
      return;
    }

    const form = root.querySelector('.secrets-form');
    const addBtn = root.querySelector('.add-secret');
    const saveBtn = root.querySelector('.save-secrets');
    const tpl = document.getElementById('secretRow');

    if (!form || !addBtn || !saveBtn || !tpl) {
      console.warn('[Secrets] missing required elements', {
        form,
        addBtn,
        saveBtn,
        tpl
      });
      return;
    }

    function addRow({ key = '', value = '' } = {}) {
      const node = tpl.content.cloneNode(true);
      const row = node.querySelector('.secret-row');
      const keyInput = node.querySelector('[name=key]');
      const valInput = node.querySelector('[name=value]');
      const removeBtn = node.querySelector('.remove');

      if (!row || !keyInput || !valInput || !removeBtn) return;

      keyInput.value = key;
      valInput.value = value;
      valInput.type = 'password';

      valInput.addEventListener('focus', () => {
        valInput.type = 'text';
      });

      valInput.addEventListener('blur', () => {
        valInput.type = 'password';
      });

      removeBtn.addEventListener('click', () => {
        row.remove();
      });

      form.appendChild(node);
    }

    addBtn.addEventListener('click', () => addRow());

    saveBtn.addEventListener('click', async () => {
      const rows = [...form.querySelectorAll('.secret-row')]
        .map(row => ({
          key: row.querySelector('[name=key]')?.value.trim(),
          value: row.querySelector('[name=value]')?.value ?? ''
        }))
        .filter(r => r.key);

      try {
        const res = await csrfFetch(`/sites/${siteId}/secrets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rows)
        });

        if (!res.ok) {
          throw new Error(`Save failed (${res.status})`);
        }
      } catch (err) {
        console.error('[Secrets] save failed', err);
        alert('Failed to save secrets');
      }
    });

    // Load secrets from disk and replace form contents
    csrfFetch(`/sites/${siteId}/secrets`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load secrets');
        return r.json();
      })
      .then(rows => {
        form.replaceChildren(); // critical: remove server markup
        rows.forEach(addRow);
        addRow(); // always leave one empty row
      })
      .catch(err => {
        console.error('[Secrets] load failed', err);
        form.replaceChildren();
        addRow();
      });
  }

  // HTMX hook — initialize editors inside swapped DOM
  document.body.addEventListener('htmx:afterSwap', (e) => {
    const swapped = e.detail?.target;
    if (!swapped) return;

    swapped
      .querySelectorAll('.secrets-editor')
      .forEach(initSecretsEditor);
  });

  // Optional: support non-HTMX initial content (safe)
  document.addEventListener('DOMContentLoaded', () => {
    document
      .querySelectorAll('.secrets-editor')
      .forEach(initSecretsEditor);
  });
})();
