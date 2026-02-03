/* =========================================================
   CSRF utilities
   ========================================================= */

function getCsrfMeta() {
  return document.querySelector('meta[name="csrf-token"]');
}

function getCsrfToken() {
  return getCsrfMeta()?.content || null;
}

function setCsrfToken(token) {
  const meta = getCsrfMeta();
  if (!meta || !token) return;
  meta.setAttribute('content', token);
}

function extractCsrfFromResponse(res) {
  if (!res?.headers) return;

  const token = res.headers.get('X-CSRF-Token');
  if (!token) return;

  setCsrfToken(token);
}

/* =========================================================
   fetch() wrapper — ONLY for fetch()
   ========================================================= */

function csrfFetch(url, options = {}) {
  const token = getCsrfToken();

  const headers = { ...(options.headers || {}) };

  // 🔒 Do NOT overwrite if caller already set it
  if (token && !headers['X-CSRF-Token']) {
    headers['X-CSRF-Token'] = token;
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin',
  }).then(res => {
    extractCsrfFromResponse(res);
    return res;
  });
}

/* =========================================================
   HTMX — ONLY for HTMX requests
   ========================================================= */

document.body.addEventListener('htmx:configRequest', (e) => {
  const headers = e.detail.headers;

  // 🔒 If already present, do nothing
  if (headers['X-CSRF-Token']) {
    return;
  }

  const token = getCsrfToken();
  if (!token) {
    return;
  }

  headers['X-CSRF-Token'] = token;
});

/* =========================================================
   HTMX response hook — refresh token
   ========================================================= */

document.body.addEventListener('htmx:afterRequest', (e) => {
  const xhr = e.detail?.xhr;
  if (!xhr) return;

  const token = xhr.getResponseHeader('X-CSRF-Token');
  if (token) {
    setCsrfToken(token);
  }
});

/* =========================================================
   Raw XMLHttpRequest (js-fileexplorer, uploads)
   ========================================================= */

(function injectCsrfIntoXHR() {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (...args) {
    this._cmCsrfAttached = false;
    return originalOpen.apply(this, args);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (name.toLowerCase() === 'x-csrf-token') {
      this._cmCsrfAttached = true;
    }
    return originalSetHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    try {
      if (!this._cmCsrfAttached) {
        const token = getCsrfToken();
        if (token) {
          originalSetHeader.call(this, 'X-CSRF-Token', token);
          this._cmCsrfAttached = true;
        }
      }
    } catch (err) {
    }

    return originalSend.apply(this, args);
  };
})();
