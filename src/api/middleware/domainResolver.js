import db from '../../../infra/db/index.js';
import { renderSite } from '../siteRenderer.js';
import log from '../../../infra/logs/index.js';

/**
 * Domain resolver middleware
 *
 * Serves sites based on the Host header for public traffic.
 * Skips /admin and /site routes to preserve existing functionality.
 */
export default async function domainResolver(req, res, next) {
  if (req.path.startsWith('/admin') || req.path.startsWith('/site')) {
    return next();
  }

  // Get the Host header (includes port, trust proxy handles X-Forwarded-Host)
  const rawHost = req.get('host');
  const domainToMatch = rawHost?.split(':')[0].toLowerCase();

  if (!domainToMatch) {
    log.warn('[domain-resolver]', 'no host header found');
    return next();
  }

  // Try exact match first
  let siteRow = db.prepare(`
    SELECT uuid, directory, live_commit
    FROM sites
    WHERE domain = ?
  `).get(domainToMatch);

  // If no exact match, try wildcard match
  if (!siteRow) {
    // Replace first subdomain with wildcard
    // e.g., blog.example.com -> *.example.com
    //       api.blog.example.com -> *.blog.example.com
    const parts = domainToMatch.split('.');
    if (parts.length >= 2) {
      const wildcardDomain = '*.' + parts.slice(1).join('.');

      siteRow = db.prepare(`
        SELECT uuid, directory, live_commit
        FROM sites
        WHERE domain = ?
      `).get(wildcardDomain);
    }
  }

  // No site found for this domain
  if (!siteRow) {
    if (!siteRow) {
      log.warn('[domain-resolver]', 'unmapped domain', { domain: domainToMatch });
      return res.status(200).send('Cute Magick ★');
    }
  }

  // No published version
  if (!siteRow.live_commit) {
    log.debug('[domain-resolver]', 'site has no published version', {
      domain: domainToMatch,
      directory: siteRow.directory
    });
    return res.status(404).send('Site not published');
  }

  log.debug('[domain-resolver]', 'resolved domain to site', {
    domain: domainToMatch,
    directory: siteRow.directory
  });

  // Extract the path after domain
  const relPath = req.path.replace(/^\/+/, '');

  // Redirect to add trailing slash for directory requests
  if (!req.path.endsWith('/') && relPath === '') {
    return res.redirect(301, req.path + '/');
  }

  // Render the site using existing renderer
  return renderSite({
    req,
    res,
    site: siteRow.directory,
    commit: siteRow.live_commit,
    relPath,
    mode: 'live'
  });
}
