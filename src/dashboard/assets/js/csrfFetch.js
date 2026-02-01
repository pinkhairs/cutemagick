function csrfFetch(url, options = {}) {
  const token =
    document.querySelector('meta[name="csrf-token"]')?.content;

  const headers = {
    ...(options.headers || {}),
  };

  if (token) {
    headers['X-CSRF-Token'] = token;
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin', // important for cookies
  });
}
