import express from 'express';
import db from '../../../infra/db/index.js';
import { renderSite } from '../siteRenderer.js';
import { getHeadCommit } from '../../../infra/index.js';
import httpBasic from '../middleware/httpBasic.js';

const router = express.Router();

/* -------------------------------------------------
   Preview site renderer
   Mounted at: /preview
-------------------------------------------------- */

// 1. Resolve site + parse path
router.use(async (req, res, next) => {
  const parts = req.path.replace(/^\/+/, '').split('/');

  const site = parts.shift();
  let first = parts.shift();
  let relPath = parts.join('/');

  if (!site) return res.sendStatus(404);

  const siteRow = db
    .prepare('SELECT * FROM sites WHERE directory = ? AND (status IS NULL OR status != ?)')
    .get(site, 'archived');

  if (!siteRow) return res.sendStatus(404);

  req.site = siteRow;

  // stash preview-specific parsing
  req.preview = { site, first, relPath };

  next();
});

router.use(httpBasic);

router.use(async (req, res) => {
  const { site, first } = req.preview;
  let { relPath } = req.preview;

  let commit;

  if (first && /^[0-9a-f]{7,40}$/i.test(first)) {
    commit = first;
  } else {
    commit = await getHeadCommit({ siteId: req.site.uuid });

    if (first) {
      relPath = [first, relPath].filter(Boolean).join('/');
    }
  }

  return renderSite({
    req,
    res,
    site,
    commit,
    relPath,
    mode: 'preview',
  });
});

export default router;
