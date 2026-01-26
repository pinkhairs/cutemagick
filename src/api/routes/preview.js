import express from 'express';
import db from '../../database.js';
import { renderSite } from '../lib/siteRenderer.js';

const router = express.Router();

/* ----------------------------
   Preview site router
   URL shape: /preview/:site/:commit/:path?
----------------------------- */

router.all(
  /^\/([^/]+)\/([a-f0-9]{7,40})(?:\/(.*))?$/,
  async (req, res) => {
    const site = req.params[0];
    const commit = req.params[1];
    const relPath = req.params[2] || 'index.html';

    // Optional: sanity-check that the site exists
    const siteRow = db.prepare(`
      SELECT uuid
      FROM sites
      WHERE directory = ?
    `).get(site);

    if (!siteRow) {
      return res.status(404).send('Site not found');
    }

    return renderSite({
      req,
      res,
      site,
      relPath,
      commit
    });
  }
);

export default router;
