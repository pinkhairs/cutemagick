/**
 * Resolves the address for a site based on the access mode
 *
 * @param {Object} site - Site object with domain, directory, username, password, uuid
 * @param {string} mode - Access mode: 'admin-iframe', 'public', or 'admin-preview'
 * @returns {string|null} The resolved site address
 */
export function resolveSiteAddress(site, mode = 'public') {
  if (!site) return null;

  const useHttps = String(process.env.SSL_ENABLED) === '1';
  const protocol = useHttps ? 'https://' : 'http://';
  let address;

  // Mode: admin-preview
  // Always returns ROOT_DOMAIN/preview/:siteId (uses UUID, not directory)
  if (mode === 'admin-preview') {
    address = protocol + process.env.ROOT_DOMAIN + '/preview/' + site.uuid;
    return address;
  }

  // Mode: public
  // Prefers custom domain if set, falls back to /site/:directory
  // Never includes credentials in URL
  if (mode === 'public') {
    if (site.domain) {
      const base = site.domain.trim();
      if (/^https?:\/\//i.test(base)) {
        address = base;
      } else {
        address = protocol + base;
      }
    } else {
      address = protocol + process.env.ROOT_DOMAIN + '/site/' + site.directory;
    }
    return address;
  }

  // Mode: admin-iframe (default for backwards compatibility)
  // Uses /iframe/site/:directory with credentials injected in URL
  if (site.domain) {
    const base = site.domain.trim();
    if (/^https?:\/\//i.test(base)) {
      address = base;
    } else {
      address = protocol + base;
    }
  } else {
    address = protocol + process.env.ROOT_DOMAIN + '/iframe/site/' + site.directory;
  }

  // Inject HTTP Basic credentials if present (admin-iframe mode only)
  if (site.username && site.password) {
    try {
      const url = new URL(address);
      // Avoid double-injecting credentials
      if (!url.username && !url.password) {
        url.username = site.username;
        url.password = site.password;
        address = url.toString();
      }
    } catch {
      // If URL parsing fails, leave address untouched
    }
  }

  return address;
}
