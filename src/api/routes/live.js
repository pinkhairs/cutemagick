import express from 'express';
import db from '../../database.js';
import { renderSite } from '../lib/siteRenderer.js';

const router = express.Router();

/* ----------------------------
   Live site router
   URL shape: /:site/:path?
----------------------------- */

router.all(/^\/([^/]+)(?:\/(.*))?$/, async (req, res) => {
  const site = req.params[0];
  const relPath = req.params[1] || 'index.html';

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
    commit: siteRow.live_commit
  });
});

export default router;
