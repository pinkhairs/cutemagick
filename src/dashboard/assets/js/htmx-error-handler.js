// HTMX response error handler (409 conflicts)
document.body.addEventListener('htmx:responseError', function (evt) {
  const xhr = evt.detail.xhr;

  if (xhr.status !== 409) return;

  let payload = null;
  try {
    payload = JSON.parse(xhr.responseText);
  } catch {
    // non-JSON 409, fall through
  }

  /*
   * ------------------------------------------------------------------
   * Registry-level domain errors (authoritative, user-facing)
   * ------------------------------------------------------------------
   */

  // 🔒 Domain taken or not verified
  if (payload?.error === 'domain_taken_or_not_verified') {
    alert(
      'Sorry, that domain is taken or not verified.\n\n' +
      'Please verify it according to the documentation, or try another domain.'
    );
    return;
  }

  if (payload?.error === 'domain_registry_unreachable') {
    alert(
      'We could not contact the domain registry to update your domain.\n\n' +
      'Please try again in a moment.'
    );
    return;
  }

  // 🔒 Domain already in use by another Cute Magick
  if (payload?.error === 'domain_already_in_use') {
    const domains = payload.domains?.join('\n') ?? 'That domain';

    alert(
      'That domain is already in use by another Cute Magick.\n\n' +
      domains +
      '\n\nIf this is an old or abandoned site, you\'ll need to release it first.'
    );
    return;
  }

  /*
   * ------------------------------------------------------------------
   * Coolify-specific 409s (infra leakage, normalized here)
   * ------------------------------------------------------------------
   */

  // 🧱 Coolify domain conflict (raw infra error)
  if (
    payload?.message?.includes('Domain conflicts detected') &&
    Array.isArray(payload?.conflicts)
  ) {
    const domains = payload.conflicts
      .map(c => c.domain)
      .join('\n');

    alert(
      'That domain is already attached to another site.\n\n' +
      domains +
      '\n\nIf you believe this is a mistake, the domain must be released first.'
    );
    return;
  }

  /*
   * ------------------------------------------------------------------
   * Generic 409 fallback (true merge / state conflicts)
   * ------------------------------------------------------------------
   */

  alert(
    'We tried to apply your changes, but some existing state conflicts need your help.\n\n' +
    'Please check the documentation for how to resolve conflicts and try again.'
  );
});
