import express from 'express';
import db from '../../../infra/db/index.js';
import { renderSite } from '../siteRenderer.js';
const router = express.Router();

/* -------------------------------------------------
   Public site renderer
-------------------------------------------------- */

router.use(async (req, res) => {
  const parts = req.path.replace(/^\/+/, '').split('/');
  const site = parts.shift();
  const relPath = parts.join('/');

  if (!site) {
    return res.status(404).send('Site not found');
  }

  const siteRow = db
    .prepare('SELECT live_commit FROM sites WHERE directory = ?')
    .get(site);

  if (!siteRow) {
    return res.status(404).send('Site not found');
  }

  if (!siteRow.live_commit) {
    res.status(200).type('html').send(`
    `);
    return;
  }

  if (!req.path.endsWith('/') && relPath === '') {
    return res.redirect(301, req.baseUrl + req.path + '/');
  }

  return renderSite({
    req,
    res,
    site,
    commit: siteRow.live_commit,
    relPath,
    mode: 'live'
  });
});

export default router;
