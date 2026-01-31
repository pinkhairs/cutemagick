import express from 'express';
import path from 'path';

import db from '../../../infra/db/index.js';
import log from '../../../infra/logs/index.js';

import {
  getCommitHistory,
} from '../../../infra/git/read.js';

import {
  countLiveCommitsToPush,
  countRemoteCommitsToPull,
  getUnpushedCommitCount,
  getRemoteAheadCount,
  getLiveCommit
} from '../../../infra/git/sync.js';

import { git } from '../../../infra/git/plumbing.js';

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

router.get('/:siteId/status', async (req, res) => {
  const { siteId } = req.params;
  console.log('[TIME:STATUS] request start', { siteId });

  if (!siteId) {
    console.log('[TIME:STATUS] missing siteId');
    return res.sendStatus(400);
  }

  try {
    console.log('[TIME:STATUS] loading site record');
    const site = db
      .prepare('SELECT repository, branch, live_commit FROM sites WHERE uuid = ?')
      .get(siteId);

    console.log('[TIME:STATUS] site record', site);

    // No remote → hide sync UI entirely
    if (!site || !site.repository) {
      console.log('[TIME:STATUS] no repository configured, returning 204');
      return res.sendStatus(204);
    }

    console.log('[TIME:STATUS] computing counts…');

    const localAheadPromise = getUnpushedCommitCount({ siteId });
    const remoteAheadPromise = getRemoteAheadCount({ siteId });
    const liveToPushPromise = countLiveCommitsToPush({ siteId });
    const remoteToPullPromise = countRemoteCommitsToPull({ siteId });

    const [
      localAhead,
      remoteAhead,
      liveToPush,
      remoteToPull
    ] = await Promise.all([
      localAheadPromise,
      remoteAheadPromise,
      liveToPushPromise,
      remoteToPullPromise
    ]);

    console.log('[TIME:STATUS] computed values', {
      localAhead,
      remoteAhead,
      liveToPush,
      remoteToPull
    });

    console.log('[TIME:STATUS] interpretation', {
      hasLocalChanges: localAhead > 0 || liveToPush > 0,
      hasRemoteChanges: remoteAhead > 0 || remoteToPull > 0,
      wouldShowInSync:
        localAhead === 0 &&
        remoteAhead === 0 &&
        liveToPush === 0 &&
        remoteToPull === 0
    });

    console.log('[TIME:STATUS] rendering partial');

    return res.render('partials/time-status', {
      layout: false,
      siteId,
      localAhead,
      remoteAhead,
      liveToPush,
      remoteToPull
    });
  } catch (err) {
    console.error('[TIME:STATUS] ERROR', {
      siteId,
      message: err.message,
      stack: err.stack
    });
    res.status(500).send('Failed to compute time status');
  }
});

router.get('/:siteId/history', async (req, res) => {
  const { siteId } = req.params;
  if (!siteId) return res.sendStatus(400);

  try {
    const commits = await getCommitHistory({ siteId });
    const liveCommit = await getLiveCommit({ siteId });

    const enriched = commits.map((c, i) => ({
      ...c,
      isLive: c.hash === liveCommit,
      isHead: i === 0
    }));

    return res.render('partials/time-history', {
      layout: false,
      uuid: siteId,
      commits: enriched
    });
  } catch (err) {
    log.error('[time:history]', { siteId, err: err.message });
    res.status(500).send('Failed to load history');
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

export default router;
