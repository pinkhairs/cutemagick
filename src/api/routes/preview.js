import express from 'express';
import path from 'path';
import fs from 'fs';
import db from '../../database.js';
import { renderSite } from '../lib/siteRenderer.js';
import { getHeadCommit } from '../lib/gitService.js';

const router = express.Router();
const PREVIEW_ROOT = '/app/renders/preview';

/* ----------------------------
   Static files FIRST
----------------------------- */
router.use(/^\/([^/]+)/, (req, res, next) => {
  const site = req.params[0];

  const sitePreviewRoot = path.join(PREVIEW_ROOT, site);
  if (!fs.existsSync(sitePreviewRoot)) return next();

  // Try all commit dirs under preview/site/*
  for (const commit of fs.readdirSync(sitePreviewRoot)) {
    const dir = path.join(sitePreviewRoot, commit);
    if (!fs.statSync(dir).isDirectory()) continue;

    express.static(dir, {
      index: false,
      fallthrough: true,
    })(req, res, () => {});
  }

  next();
});

/* ----------------------------
   /preview/:site/:commit/*
----------------------------- */
router.all(
  /^\/([^/]+)\/([a-f0-9]{7,40})(?:\/(.*))?$/,
  async (req, res) => {
    const site    = req.params[0];
    const commit  = req.params[1];
    const relPath = req.params[2] || '';

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
      mode: 'preview',
    });
  }
);

/* ----------------------------
   /preview/:site/*
   (defaults to HEAD)
----------------------------- */
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
      siteId: siteRow.uuid,
    });

    if (!headCommit) {
      return res.status(400).send('No HEAD commit');
    }

    return renderSite({
      req,
      res,
      site,
      relPath,
      commit: headCommit,
      mode: 'preview',
    });
  }
);

export default router;
