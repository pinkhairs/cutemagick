import express from 'express';
import db from '../../../infra/db/index.js';
import { renderSite } from '../siteRenderer.js';
import httpBasic from '../middleware/httpBasic.js';
import { resolveSiteAddress } from '../../../infra/resolveSiteAddress.js';

const router = express.Router();

/* -------------------------------------------------
   1. Resolve site + attach req.site
-------------------------------------------------- */

router.use(async (req, res, next) => {
  console.log('[site.js] Request:', { baseUrl: req.baseUrl, path: req.path });

  const parts = req.path.replace(/^\/+/, '').split('/');
  const site = parts.shift();
  const relPath = parts.join('/');

  if (!site) {
    console.log('[site.js] No site in path');
    return res.status(404).send('Site not found');
  }

  const siteRow = db
    .prepare('SELECT * FROM sites WHERE directory = ? AND (status IS NULL OR status != ?)')
    .get(site, 'archived');

  if (!siteRow) {
    console.log('[site.js] Site not found in DB:', site);
    return res.status(404).send('Site not found');
  }

  console.log('[site.js] Site resolved:', { directory: siteRow.directory, hasAuth: !!(siteRow.username && siteRow.password) });

  // establish site identity for downstream middleware
  req.site = siteRow;
  req.siteContext = { site, relPath };

  next();
});

/* -------------------------------------------------
   2. Redirect to custom domain (public access only)
-------------------------------------------------- */

router.use((req, res, next) => {
  // Check if this is iframe route (/iframe/site) vs public route (/site)
  const isIframeRoute = req.baseUrl === '/iframe/site';

  // Only redirect public access to custom domain
  if (!isIframeRoute && req.site.domain) {
    const canonicalUrl = resolveSiteAddress(req.site, 'public');
    const currentPath = req.path;

    // Redirect to custom domain with the same path
    return res.redirect(301, canonicalUrl + currentPath);
  }

  next();
});

/* -------------------------------------------------
   3. Site-level auth (HTTP Basic)
-------------------------------------------------- */

router.use(httpBasic);

/* -------------------------------------------------
   4. Render live site
-------------------------------------------------- */

router.use((req, res) => {
  const { site, relPath } = req.siteContext;
  const { live_commit } = req.site;

  if (!live_commit) {
    return res.status(200).type('html').send('');
  }

  if (!req.path.endsWith('/') && relPath === '') {
    return res.redirect(301, req.baseUrl + req.path + '/');
  }

  return renderSite({
    req,
    res,
    site,
    commit: live_commit,
    relPath,
    mode: 'live'
  });
});

export default router;
