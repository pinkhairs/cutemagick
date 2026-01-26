import express from 'express';
import db from '../../database.js';
import { renderSite } from '../lib/siteRenderer.js';
import { getHeadCommit } from '../lib/gitService.js';
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
    const relPath = req.params[2] || '';

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
      commit,
    });
  }
);

/* -------------------------------------------------
   /preview/:site/*
   (defaults to HEAD)
-------------------------------------------------- */
router.all(
  /^\/([^/]+)(?:\/(.*))?$/,
  async (req, res) => {
    const site    = req.params[0];
    const relPath = req.params[1] || '';

    const siteRow = db.prepare(`
      SELECT uuid
      FROM sites
      WHERE directory = ?
    `).get(site);

    if (!siteRow) {
      return res.status(404).send('Site not found');
    }

    const headCommit = await getHeadCommit({
      siteId: siteRow.uuid
    });

    if (!headCommit) {
      return res.status(400).send('No HEAD commit');
    }

    return renderSite({
      req,
      res,
      site,
      relPath,
      commit: headCommit
    });
  }
);


export default router;
