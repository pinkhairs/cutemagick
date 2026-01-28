import express from 'express';
import path from 'path';
import fs from 'fs';
import db from '../../database.js';
import { renderSite } from '../lib/siteRenderer.js';

const router = express.Router();
const SITES_ROOT = '/app/sites';

function resolveSiteDir(site) {
  const dir = path.join(SITES_ROOT, site);
  return fs.existsSync(dir) ? dir : null;
}

/* ----------------------------
   1️⃣ Static files FIRST
----------------------------- */
router.use('/:site', (req, res, next) => {
  const siteDir = resolveSiteDir(req.params.site);
  if (!siteDir) return next();

  express.static(siteDir, {
    index: false,
    fallthrough: true,
  })(req, res, next);
});

router.get(/^\/([^/]+)\/(.*)/, async (req, res) => {
  const site = req.params[0];
  const relPath = req.params[1] || '';

  const siteRow = db.prepare(`
    SELECT live_commit
    FROM sites
    WHERE directory = ?
  `).get(site);

  if (!siteRow?.live_commit) {
    return res.status(400).send('No live commit');
  }

  return renderSite({
    req,
    res,
    site,
    relPath,
    commit: siteRow.live_commit,
    mode: 'live',
  });
});

/* ----------------------------
   3️⃣ Root (/site/:site)
----------------------------- */
router.get('/:site', async (req, res) => {
  return router.handle(
    { ...req, url: req.url + '/' },
    res
  );
});

export default router;
