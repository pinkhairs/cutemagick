import express from 'express';
import path from 'path';

import db from '../../../infra/db/index.js';
import log from '../../../infra/logs/index.js';
import { resolveSiteAddress } from '../../../infra/resolveSiteAddress.js';

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
  getHeadCommit,
} from '../../../infra/git/sync.js';

import { git } from '../../../infra/git/plumbing.js';
import { triggerSiteCommit } from '../htmx/triggers.js';

const router = express.Router();

function formatPrettyDate(raw) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  const months = [
    'Jan','Feb','Mar','Apr','May','Jun',
    'Jul','Aug','Sep','Oct','Nov','Dec'
  ];

  const month = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';

  hours = hours % 12 || 12;

  const time =
    minutes === 0
      ? `${hours}${ampm}`
      : `${hours}:${minutes.toString().padStart(2,'0')}${ampm}`;

  return `${month} ${day}, ${year} at ${time}`;
}

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
    SELECT uuid, directory, live_commit, username, password
    FROM sites
    WHERE uuid = ?
  `).get(siteId);
}

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

router.get('/:siteId/review', async (req, res) => {
  const { siteId } = req.params;
  if (!siteId) return res.sendStatus(400);

  try {
    const site = getSite(siteId);
    if (!site) return res.sendStatus(404);

    const liveCommit = await getLiveCommit({ siteId });
    const headCommit = await getHeadCommit({ siteId });
    const commits = (await getCommitHistory({ siteId }))
      .map(c => ({
        ...c,
        rawDate: c.date,
        date: formatPrettyDate(c.date)
      }));


    return res.render('partials/review-changes', {
      layout: false,
      siteId,
      commits: commits.slice(1).filter(c => c.hash !== liveCommit),
      siteDir: site.directory,
      selectedCommit: headCommit,
      headCommit: commits[0],
      liveCommit: commits.find(c => c.hash === liveCommit),
      formatPrettyDate,
      siteHasPassword: site.password ? true : false,
    });
  } catch (err) {
    log.error('[review]', err.message);
    res.status(500).send('Failed to load review panel');
  }
});

router.get('/:siteId/commits', async (req, res) => {
  const { siteId } = req.params;
  const { selectedCommit } = req.query;

  const site = getSite(siteId);
  const commits = await getCommitHistory({ siteId });

  const liveIndex = commits.findIndex(
    c => c.hash === site.live_commit
  );

  const draftCommits =
    liveIndex === -1
      ? commits.slice(1)
      : commits.slice(1, liveIndex);

  return res.render('partials/review-commits-list', {
    layout: false,
    siteId,
    commits: draftCommits.map(c => ({
      ...c,
      date: formatPrettyDate(c.date)
    })),
    selectedCommit: selectedCommit || commits[0].hash,
    headCommit: commits[0],
    liveCommit: commits.find(c => c.hash === site.live_commit)
  });
});

router.get('/:siteId/select/:commit', async (req, res) => {
  const { siteId, commit } = req.params;
  if (!siteId || !commit) return res.sendStatus(400);

  try {
    const site = getSite(siteId);
    if (!site) return res.sendStatus(404);

    const liveCommitInDb = site.live_commit;

    let selectedCommit =
      commit === 'live' ? liveCommit : commit;

    if (!selectedCommit) {
      selectedCommit = await getHeadCommit({ siteId });
    }

    const commits = await getCommitHistory({ siteId });
    let selected = commits.find(c => c.hash === selectedCommit);
    const liveCommit = commits.find(c => c.hash === liveCommitInDb);

    if (!selected) {
      selected = {
        hash: selectedCommit,
        subject:
          selectedCommit === liveCommit
            ? 'Live version'
            : 'Unknown commit',
        date: new Date().toISOString()
      };
    }

    const treatedCommit = {
      ...selected,
      date: formatPrettyDate(selected.date)
    };

    // Clean preview URL (no credentials) - auth bypassed for authenticated admins
    const previewUrl = `/admin/preview/${site.directory}/${selectedCommit}`;

    return res.set('HX-Trigger', JSON.stringify({
      changedReviewPreview: { selectedCommit }
    }))
    .render('partials/review-preview', {
      layout: false,
      siteId,
      siteDir: site.directory,
      selectedCommit,
      liveCommit,
      commit: treatedCommit,
      isLive: selectedCommit === liveCommit,
      previewUrl,
    });
  } catch (err) {
    log.error('[review:select]', err.message);
    res.status(500).send('Failed to select commit');
  }
});

router.post('/:siteId/go-live/:commit', async (req, res) => {
  const { siteId, commit } = req.params;
  if (!siteId || !commit) return res.sendStatus(400);

  try {
    const site = getSite(siteId);
    if (!site) return res.sendStatus(404);

    db.prepare(`
      UPDATE sites
      SET live_commit = ?
      WHERE uuid = ?
    `).run(commit, siteId);

    log.info('[review:go-live]', { siteId, commit });
    await triggerSiteCommit(res, siteId, commit, 'go-live');
    return res.sendStatus(204);
  } catch (err) {
    log.error('[review:go-live]', err.message);
    res.status(500).send('Failed to go live');
  }
});

export default router;
