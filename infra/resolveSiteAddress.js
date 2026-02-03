export function resolveSiteAddress(site) {
  if (!site || !site.domain) return null;

  const base = site.domain.trim();

  // If protocol already specified, respect it
  if (/^https?:\/\//i.test(base)) {
    return base;
  }

  const useHttps = String(process.env.SSL_ENABLED) === '1';
  const protocol = useHttps ? 'https://' : 'http://';

  return protocol + base;
}
