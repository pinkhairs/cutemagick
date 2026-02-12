// Tab switching functionality
document.addEventListener('click', function(e) {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    // Remove data-active from all tabs in this window
    tab.closest('.window').querySelectorAll('[data-tab]').forEach(el => {
      delete el.dataset.active;
    });

    // Set active on clicked tab after HTMX processes
    setTimeout(() => {
      tab.dataset.active = 'true';
    }, 0);
  }
});
