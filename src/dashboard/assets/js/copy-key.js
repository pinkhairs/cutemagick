// SSH key copy functionality
function forceCopy(text) {
  const input = document.createElement('input');
  input.value = text;

  // Make it focusable & invisible
  input.style.position = 'fixed';
  input.style.top = '-1000px';
  input.style.left = '-1000px';

  document.body.appendChild(input);

  input.focus();
  input.select();
  input.setSelectionRange(0, input.value.length);

  const success = document.execCommand('copy');
  document.body.removeChild(input);

  return success;
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  const action = btn.dataset.action;

  try {
    if (action === 'copy-key') {
      if (!confirm('Copy your public SSH key to your clipboard?')) return;
      const res = await csrfFetch('/admin/config/public-key', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to fetch key');
      const key = await res.text();

      // Standard clipboard copy
      await navigator.clipboard.writeText(key);
      alert('Your public SSH key has been copied to your clipboard!');
    }
  } catch (err) {
    console.error(err);
    alert('Something went wrong. Please try again.');
  }
});
