// src/api/routes/sites.js
import express from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import db from '../../../infra/db/index.js';
import log from '../../../infra/logs/index.js';

import {
  pullFromRemote,
  syncToRemote
} from '../../../infra/git/sync.js';

import {
  restoreCommitAsNew
} from '../../../infra/git/porcelain.js';

import {
  generateRandomSubdomain,
  nextAvailableDirectorySuffix,
  slugify,
} from '../../../infra/siteNaming.js';

import { cloneRepo } from '../../../infra/git/sync.js';
import { ensureRepo } from '../../../infra/git/plumbing.js';
import { commitFileCreate } from '../../../infra/git/porcelain.js';
import { SITES_ROOT } from '../../../config/index.js';

const router = express.Router();

/* -------------------------------------------------
   Create site
-------------------------------------------------- */

router.post('/', express.urlencoded({ extended: false }), async (req, res) => {
  const input = req.body.nameOrUrl?.trim();
  if (!input) return res.sendStatus(400);

  const isGitRepo =
    /^(git@|https?:\/\/).+(\.git)?$/.test(input);

  const uuid = crypto.randomUUID();
  const now = new Date().toISOString();

  const name = isGitRepo
    ? path.basename(input, '.git')
    : input;

  const slug = slugify(name);
  const suffix = await nextAvailableDirectorySuffix(SITES_ROOT, slug);
  const directory = `${slug}${suffix}`;
  const sitePath = path.join(SITES_ROOT, directory);

  const domain =
    generateRandomSubdomain(slug) +
    '.' +
    process.env.WILDCARD_DOMAIN;

  log.info('[sites:create]', { uuid, name, isGitRepo });

  try {
    db.prepare(`
      INSERT INTO sites (
        uuid, name, icon, domain, directory,
        repository, branch, live_commit,
        created_at, last_viewed
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid,
      name,
      null,
      domain,
      directory,
      isGitRepo ? input : null,
      isGitRepo ? 'main' : null,
      null,
      now,
      now
    );

    if (isGitRepo) {
      const { head } = await cloneRepo({ sitePath, repository: input });
      db.prepare(`
        UPDATE sites
        SET live_commit = ?
        WHERE uuid = ?
      `).run(head, uuid);
    } else {
      await fs.mkdir(sitePath, { recursive: true });
      await ensureRepo(sitePath, 'main');

      const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Welcome to Cute Magick</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <h1>✨ Welcome to Cute Magick</h1>
  <p>This site exists, but is waiting to be changed.</p>
  <p>
    Edit this <code>index.html</code> file and bring this site online.
  </p>
  <p>
    <a href="https://cutemagick.com/docs/getting-started">
      Read the docs →
    </a>
  </p>
</body>
</html>
`;

      const indexPath = path.join(sitePath, 'index.html');
      await fs.writeFile(indexPath, indexHtml, 'utf8');

      const head = await commitFileCreate({
        siteId: uuid,
        fullPath: indexPath,
        message: 'New site'
      });

      db.prepare(`
        UPDATE sites
        SET live_commit = ?
        WHERE uuid = ?
      `).run(head, uuid);
    }
    res
      .set('HX-Trigger', 'refreshedSites')
      .sendStatus(204);
  } catch (err) {
    log.error('[sites:create] failed', { err: err.message });
    await fs.rm(sitePath, { recursive: true, force: true }).catch(() => {});
    res.status(500).send('Site creation failed');
  }
});

/* -------------------------------------------------
   List sites (HTML fragment)
-------------------------------------------------- */

router.get('/', (req, res) => {
  const sites = db.prepare(`
    SELECT uuid, name, icon, domain, directory
    FROM sites
    ORDER BY last_viewed DESC
  `).all();

  res.render('partials/sites', {
    layout: false,
    sites
  });
});

/* -------------------------------------------------
   Get site metadata (JSON)
-------------------------------------------------- */

router.get('/:siteId', (req, res) => {
  const site = db.prepare(`
    SELECT *
    FROM sites
    WHERE uuid = ?
  `).get(req.params.siteId);

  if (!site) return res.sendStatus(404);
  res.json(site);
});

/* -------------------------------------------------
   Update site identity
-------------------------------------------------- */

router.post('/:siteId/update', express.urlencoded({ extended: false }), (req, res) => {
  const { siteId } = req.params;
  const { name, icon } = req.body;

  db.prepare(`
    UPDATE sites
    SET name = ?, icon = ?
    WHERE uuid = ?
  `).run(name, icon, siteId);

  res
    .set('HX-Trigger', 'refreshedSites')
    .sendStatus(204);
});

/* -------------------------------------------------
   Delete site
-------------------------------------------------- */

router.post('/:siteId/delete', async (req, res) => {
  const site = db.prepare(`
    SELECT directory
    FROM sites
    WHERE uuid = ?
  `).get(req.params.siteId);

  if (!site) return res.sendStatus(404);

  await fs.rm(path.join(SITES_ROOT, site.directory), {
    recursive: true,
    force: true
  });

  db.prepare(`DELETE FROM sites WHERE uuid = ?`)
    .run(req.params.siteId);

  res
    .set('HX-Trigger', 'refreshedSites')
    .sendStatus(204);
});

router.post('/:siteId/pull', async (req, res) => {
  const { siteId } = req.params;

  try {
    await pullFromRemote({ siteId });
    res.sendStatus(204);
  } catch (err) {
    log.error('[site:pull]', { siteId, err: err.message });
    res.status(409).send(err.message);
  }
});


router.post('/:siteId/push', async (req, res) => {
  const { siteId } = req.params;

  try {
    await syncToRemote({ siteId });
    res.sendStatus(204);
  } catch (err) {
    log.error('[site:push]', { siteId, err: err.message });
    res.status(409).send(err.message);
  }
});

router.post('/:siteId/make-live', async (req, res) => {
  const { siteId } = req.params;

  try {
    const head = await getHeadCommit({ siteId });

    if (!head) {
      return res.status(400).send('Nothing to publish');
    }

    db.prepare(`
      UPDATE sites
      SET live_commit = ?
      WHERE uuid = ?
    `).run(head, siteId);

    log.info('[site:make-live]', { siteId, head });
    res.sendStatus(204);
  } catch (err) {
    log.error('[site:make-live]', { siteId, err: err.message });
    res.status(500).send('Failed to make site live');
  }
});

router.post('/:siteId/restore', express.urlencoded({ extended: false }), async (req, res) => {
  const { siteId } = req.params;
  const { commit } = req.body;

  if (!commit) return res.sendStatus(400);

  try {
    await restoreCommitAsNew({
      siteId,
      commit
    });

    log.info('[site:restore]', { siteId, commit });
    res.sendStatus(204);
  } catch (err) {
    log.error('[site:restore]', { siteId, commit, err: err.message });
    res.status(409).send(err.message);
  }
});

export default router;
