import express from 'express';
import db from '../../../infra/db/index.js';
import { renderSite } from '../siteRenderer.js';
import { getHeadCommit } from '../../../infra/index.js';

const router = express.Router();

/* -------------------------------------------------
   Preview site renderer
   Mounted at: /preview
   URL shape:
     /preview/:site/:commit
     /preview/:site/:commit/*
-------------------------------------------------- */

router.use(async (req, res) => {
  const parts = req.path.replace(/^\/+/, '').split('/');

  const site = parts.shift();
  let first = parts.shift();     // may be commit OR asset OR undefined
  let relPath = parts.join('/');

  if (!site) {
    return res.sendStatus(404);
  }

  const siteRow = db
    .prepare('SELECT uuid FROM sites WHERE directory = ?')
    .get(site);

  if (!siteRow) {
    return res.sendStatus(404);
  }

  let commit;
  
  if (first && /^[0-9a-f]{7,40}$/i.test(first)) {
    commit = first;
  }

  else {
    commit = await getHeadCommit({ siteId: siteRow.uuid });

    // If there *was* a first segment, it is part of the path
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
