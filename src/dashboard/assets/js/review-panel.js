// Review changes panel animation
function closeReviewChanges() {
  const reviewChangesRoot = document.getElementById('reviewChangesRoot');
  reviewChangesRoot.remove();
}

document.body.addEventListener('htmx:afterSwap', (e) => {
  // Only react when Review Changes is injected
  const root = e.target.querySelector?.('#reviewChangesRoot');
  if (!root) return;

  const backdrop = root.querySelector('#reviewBackdrop');
  const panel = root.querySelector('#reviewPanel');

  // Make interactive
  root.classList.remove('pointer-events-none');
  root.setAttribute('aria-hidden', 'false');

  // Fade in backdrop
  backdrop.classList.remove('opacity-0');
  backdrop.classList.add('opacity-70');

  // Slide panel in
  panel.classList.remove('translate-x-full');

  // Optional: focus panel for accessibility
  requestAnimationFrame(() => {
    panel.focus?.();
  });
});
