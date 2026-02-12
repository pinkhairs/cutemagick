// Initialize Tippy.js tooltips
function initTippy(root = document) {
  if (!window.tippy) return;

  root.querySelectorAll('[data-tippy-content]').forEach(el => {
    if (!el._tippy) {
      tippy(el, {
        placement: 'bottom'
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTippy();
});

document.body.addEventListener('htmx:afterSwap', (e) => {
  initTippy(e.target);
});
