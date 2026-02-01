// save-file.js
// ----------------------------------------------------
// Save Draft logic (Ace-aware, HTMX-safe)
// ----------------------------------------------------

(function () {

  /* --------------------------------------------------
     Helpers
  -------------------------------------------------- */

  function getAce(windowEl) {
    return windowEl?._ace || null;
  }

  function getEditorContent(windowEl) {
    const aceEditor = getAce(windowEl);
    return aceEditor ? aceEditor.getValue() : null;
  }

  function saveDraftMenuHTML() {
    return `
      <div class="flex flex-col text-sm">
        <button
          class="px-3 py-2 text-left "
          data-save-action="quick"
        >
          ⚡ Quick save (click again)
        </button>
        <button
          class="px-3 py-2 text-left "
          data-save-action="note"
        >
          📝 Add note & save
        </button>
      </div>
    `;
  }

  /* --------------------------------------------------
     Dirty / Clean state
  -------------------------------------------------- */

  function markClean(windowEl) {
    const content = getEditorContent(windowEl);
    if (content == null) return;

    windowEl._lastSavedValue = content;
    updateSaveButton(windowEl);
  }

  function markDirty(windowEl) {
    updateSaveButton(windowEl);
  }

  function isDirty(windowEl) {
    const content = getEditorContent(windowEl);
    if (content == null) return false;
    return content !== windowEl._lastSavedValue;
  }

  function updateSaveButton(windowEl) {
    const btn = windowEl.querySelector('[id^="save-draft-"]');
    if (!btn) return;

    if (isDirty(windowEl)) {
      btn.disabled = false;
      btn.textContent = '☁️ Save Draft';
      btn.classList.remove('opacity-50');
    } else {
      btn.disabled = true;
      btn.textContent = '☁️ Saved';
      btn.classList.add('opacity-50');
      btn.dataset.saveArmed = 'false';
      btn._saveTippy?.hide();
    }

    updatePreviewButton(windowEl);
  }

  function updatePreviewButton(windowEl) {
    const preview = windowEl.querySelector('[data-role="preview"]');
    if (!preview) return;

    if (isDirty(windowEl)) {
      preview.disabled = true;
      preview.classList.add('opacity-40');
      preview.title = 'Save draft to preview changes';
    } else {
      preview.disabled = false;
      preview.classList.remove('opacity-40');
      preview.title = 'Preview latest saved version';
    }
  }

  /* --------------------------------------------------
     Save logic
  -------------------------------------------------- */

  async function doSave({ saveBtn, windowEl, siteId, filePath, content, message }) {
    saveBtn.disabled = true;
    saveBtn.textContent = '☁️ Saving…';

    try {
      const res = await csrfFetch(`/fs/${siteId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: filePath,
          content,
          message
        })
      });

      if (!res.ok) throw new Error('Save failed');

      // authoritative clean state
      windowEl._lastSavedValue = content;
      updateSaveButton(windowEl);

    } catch (err) {
      console.error(err);
      saveBtn.textContent = '⚠️ Error';
      saveBtn.disabled = false;
    }
  }

  /* --------------------------------------------------
     Tippy init
  -------------------------------------------------- */

  function initSaveDraftTippy(root = document) {
    if (!window.tippy) return;

    root.querySelectorAll('[id^="save-draft-"]').forEach(btn => {
      if (btn._saveTippy) return;

      btn.dataset.saveArmed = 'false';

      btn._saveTippy = tippy(btn, {
        content: saveDraftMenuHTML(),
        allowHTML: true,
        interactive: true,
        trigger: 'manual',
        placement: 'bottom-start'
      });

      btn.disabled = true;
      btn.textContent = '☁️ Saved';
      btn.classList.add('opacity-50');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initSaveDraftTippy();
  });

  document.body.addEventListener('htmx:afterSwap', (e) => {
    initSaveDraftTippy(e.target);
  });

  /* --------------------------------------------------
     Click handling
  -------------------------------------------------- */

  document.addEventListener('click', async (e) => {

    const actionBtn = e.target.closest('[data-save-action]');
    const saveBtn   = e.target.closest('[id^="save-draft-"]');

    /* ---------- Menu actions ---------- */
    if (actionBtn) {
      e.preventDefault();

      const windowEl = actionBtn.closest('.window');
      if (!windowEl) return;

      const btn = windowEl.querySelector('[id^="save-draft-"]');
      if (!btn || btn.disabled) return;

      const siteId  = windowEl.dataset.siteUuid;
      const filePath = windowEl.dataset.path;
      const content = getEditorContent(windowEl);
      if (content == null) return;

      let message;
      if (actionBtn.dataset.saveAction === 'note') {
        message = prompt('Write note to future self:');
        if (message === null) return;
      }

      btn.dataset.saveArmed = 'false';
      btn._saveTippy.hide();

      await doSave({
        saveBtn: btn,
        windowEl,
        siteId,
        filePath,
        content,
        message
      });

      return;
    }

    /* ---------- Save button ---------- */
    if (!saveBtn || saveBtn.disabled) return;

    e.preventDefault();

    const windowEl = saveBtn.closest('.window');
    if (!windowEl) return;

    const siteId  = windowEl.dataset.siteUuid;
    const filePath = windowEl.dataset.path;
    const content = getEditorContent(windowEl);
    if (content == null) return;

    // second click → quick save
    if (saveBtn.dataset.saveArmed === 'true') {
      saveBtn.dataset.saveArmed = 'false';
      saveBtn._saveTippy.hide();

      await doSave({
        saveBtn,
        windowEl,
        siteId,
        filePath,
        content
      });

      return;
    }

    // first click → open menu
    saveBtn.dataset.saveArmed = 'true';
    saveBtn._saveTippy.show();
  });

  /* --------------------------------------------------
     Public hooks (called from Ace mount)
  -------------------------------------------------- */

  window.CuteMagickSaveState = {
    markClean,
    markDirty,
    updateSaveButton
  };

})();
