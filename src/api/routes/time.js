import express from 'express';
import path from 'path';

import db from '../../../infra/db/index.js';
import log from '../../../infra/logs/index.js';

import {
  getCommitHistory,
} from '../../../infra/git/index.js';

import {
  countLiveCommitsToPush,
  countRemoteCommitsToPull,
  getUnpushedCommitCount,
  getRemoteAheadCount,
  getLiveCommit,
  fetchRemote,
  countDraftCommits,
} from '../../../infra/git/sync.js';

import { git } from '../../../infra/git/plumbing.js';
import { SITES_ROOT } from '../../../config/index.js';

const router = express.Router();

function getSitePath(siteId) {
  const row = db.prepare(`
    SELECT directory
    FROM sites
    WHERE uuid = ?
  `).get(siteId);

  if (!row || !row.directory) {
    throw new Error(`Site not found or missing directory: ${siteId}`);
  }

  // Mirrors your sync.js getSiteGitConfig path scheme
  return path.resolve(process.cwd(), 'data', 'sites', row.directory);
}

function getLocalPlaceName() {
  return process.env.WILDCARD_DOMAIN?.trim() || 'My site';
}

function getExternalPlaceName(repository) {
  if (!repository) return null;

  try {
    // git@github.com:user/repo.git
    // https://github.com/user/repo.git
    let cleaned = repository
      .replace(/^git@/, '')
      .replace(/^https?:\/\//, '')
      .replace(/\.git$/, '');

    // git@github.com:user/repo → github.com/user/repo
    cleaned = cleaned.replace(':', '/');

    // keep host only
    return cleaned.split('/')[0];
  } catch {
    return 'External copy';
  }
}

router.get('/:siteId/status', async (req, res) => {
  const { siteId } = req.params;

  if (!siteId) {
    return res.sendStatus(400);
  }

  try {
    const site = db
      .prepare('SELECT repository FROM sites WHERE uuid = ?')
      .get(siteId);

    if (!site || !site.repository) {
      return res.sendStatus(204);
    }

    await fetchRemote({ siteId });

    const [
      localAhead,
      remoteAhead,
      liveToPush,
      remoteToPull
    ] = await Promise.all([
      getUnpushedCommitCount({ siteId }),
      getRemoteAheadCount({ siteId }),
      countLiveCommitsToPush({ siteId }),
      countRemoteCommitsToPull({ siteId })
    ]);

    return res.render('partials/time-status', {
      layout: false,
      siteId,
      localPlace: getLocalPlaceName(),
      externalPlace: getExternalPlaceName(site.repository),
      localAhead,
      remoteAhead,
      liveToPush,
      remoteToPull
    });
  } catch (err) {
    res.status(500).send('Failed to compute time status');
  }
});

router.get('/:siteId/commit/:commit', async (req, res) => {
  const { siteId, commit } = req.params;
  if (!siteId || !commit) return res.sendStatus(400);

  try {
    const sitePath = getSitePath(siteId);

    const { stdout } = await git(sitePath, [
      'show',
      '--no-color',
      '--stat',
      '--patch',
      commit
    ]);

    return res.render('partials/time-commit', {
      layout: false,
      siteId,
      commit,
      diff: stdout
    });
  } catch (err) {
    log.error('[time:commit]', { siteId, commit, err: err.message });
    res.status(500).send('Failed to load commit');
  }
});

/* -------------------------------------------------
   Helpers
-------------------------------------------------- */

function getSite(siteId) {
  return db.prepare(`
    SELECT uuid, directory, live_commit
    FROM sites
    WHERE uuid = ?
  `).get(siteId);
}

/* -------------------------------------------------
   Routes
-------------------------------------------------- */

router.get('/:siteId/draft-count', async (req, res) => {
  const siteId = req.params.siteId;
  const site = getSite(siteId);

  try {
    const count = await countDraftCommits({
      siteId,
      liveCommit: site.live_commit
    });

    return res.render('partials/site-draft-badge', { siteId, count, layout: false});
  } catch (err) {
    console.error('[draft-count]', err.message);
    return res.render('partials/site-draft-badge', { siteId, count: 0 });
  }
});

export default router;
