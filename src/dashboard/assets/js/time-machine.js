// Time machine tab opener
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action="open-time-machine"]');
  if (!el) return;

  const win = el.closest('.window');
  win?.querySelector('[data-tab="time-machine"]')?.click();
});
