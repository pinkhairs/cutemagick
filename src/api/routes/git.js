// src/api/routes/git.js
import express from 'express';
import log from '../../../infra/logs/index.js';

import {
  pullFromRemote,
  syncToRemote,
  getUnpushedCommitCount,
  getRemoteAheadCount,
  countLiveCommitsToPush,
  countRemoteCommitsToPull
} from '../../../infra/git/sync.js';
import db from '../../../infra/db/index.js';

const router = express.Router();

/* -------------------------------------------------
   GET /git/:siteId/status
-------------------------------------------------- */

router.get('/:siteId/status', async (req, res) => {
  const siteId = req.params.siteId;

  try {
    const site = db
      .prepare('SELECT repository FROM sites WHERE uuid = ?')
      .get(siteId);

    // No remote → remove the bar entirely
    if (!site || !site.repository) {
      return res.sendStatus(204);
    }

    const [
      unpushed,
      remoteAhead,
      liveToPush,
      remoteToPull
    ] = await Promise.all([
      getUnpushedCommitCount({ siteId }),
      getRemoteAheadCount({ siteId }),
      countLiveCommitsToPush({ siteId }),
      countRemoteCommitsToPull({ siteId })
    ]);

    // 🔑 Return HTML, not JSON
    return res.render('partials/git-status', {
      layout: false,
      siteId,
      unpushed,
      remoteAhead,
      liveToPush,
      remoteToPull
    });
  } catch (err) {
    log.error('[git:status]', { siteId, err: err.message });
    res.status(500).send('Failed to compute git status');
  }
});

/* -------------------------------------------------
   POST /git/:siteId/pull
-------------------------------------------------- */

router.post('/:siteId/pull', async (req, res) => {
  try {
    await pullFromRemote({ siteId: req.params.siteId });
    res.sendStatus(204);
  } catch (err) {
    log.error('[git:pull]', { err: err.message });
    res.status(409).send(err.message);
  }
});

/* -------------------------------------------------
   POST /git/:siteId/push
-------------------------------------------------- */

router.post('/:siteId/push', async (req, res) => {
  try {
    await syncToRemote({ siteId: req.params.siteId });
    res.sendStatus(204);
  } catch (err) {
    log.error('[git:push]', { err: err.message });
    res.status(409).send(err.message);
  }
});

export default router;
