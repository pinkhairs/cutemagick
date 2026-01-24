// save-draft.js
// ----------------------------------------------------
// Save Draft dropdown using Tippy
// ----------------------------------------------------

(function () {
  /* --------------------------------------------------
     Helpers
  -------------------------------------------------- */

  function saveDraftMenuHTML() {
    return `
      <div class="flex flex-col text-sm">
        <button
          class="bg-transparent! focus:bg-transparent! px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
          data-save-action="quick"
        >
          ⚡ Quick save (click again)
        </button>
        <button
          class="bg-transparent! focus:bg-transparent! px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
          data-save-action="note"
        >
          📝 Add note & save
        </button>
      </div>
    `;
  }

  function getEditorContent(windowEl) {
    const editorEl = windowEl.querySelector('.editor');
    if (!editorEl || !editorEl.id) return null;
    return ace.edit(editorEl.id).getValue();
  }

  /* --------------------------------------------------
     Clean / Dirty state
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
  }

  /* --------------------------------------------------
     Save logic
  -------------------------------------------------- */

  async function doSave({ saveBtn, windowEl, siteId, filePath, content, message }) {
    saveBtn.disabled = true;
    saveBtn.textContent = '☁️ Saving…';

    try {
      const res = await fetch(`/files/${siteId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: filePath,
          content,
          message
        })
      });

      if (!res.ok) throw new Error('Save failed');

      // ✨ Mark clean immediately after successful save
      windowEl._lastSavedValue = content;

      saveBtn.textContent = '☁️ Saved';
      setTimeout(() => {
        updateSaveButton(windowEl);
      }, 300);
      CuteMagickEvents.commitsChanged(siteId);
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

      // default to disabled until editor marks dirty
      btn.disabled = true;
      btn.classList.add('opacity-50');
      btn.textContent = '☁️ Saved';
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
    const saveBtn = e.target.closest('[id^="save-draft-"]');
    const actionBtn = e.target.closest('[data-save-action]');

    /* ----------------------------------------------
       MENU ACTIONS
    ---------------------------------------------- */
    if (actionBtn) {
      e.stopPropagation();

      const windowEl = actionBtn.closest('.window');
      if (!windowEl) return;

      const btn = windowEl.querySelector('[id^="save-draft-"]');
      if (!btn || btn.disabled) return;

      const siteId = windowEl.dataset.siteUuid;
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

    /* ----------------------------------------------
       SAVE BUTTON CLICK
    ---------------------------------------------- */
    if (!saveBtn || saveBtn.disabled) return;

    e.stopPropagation();

    const windowEl = saveBtn.closest('.window');
    if (!windowEl) return;

    const siteId = windowEl.dataset.siteUuid;
    const filePath = windowEl.dataset.path;
    const content = getEditorContent(windowEl);
    if (content == null) return;

    // SECOND CLICK → QUICK SAVE
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

    // FIRST CLICK → OPEN MENU + ARM
    saveBtn.dataset.saveArmed = 'true';
    saveBtn._saveTippy.show();
  });

  /* --------------------------------------------------
     Expose hooks for Ace mount (next step)
  -------------------------------------------------- */

  window.CuteMagickSaveState = {
    markClean,
    markDirty,
    updateSaveButton
  };
})();
