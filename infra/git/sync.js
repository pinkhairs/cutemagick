import path from 'path';
import db from '../db/index.js';
import fs from 'fs/promises';

import {
  git,
  ensureRepo,
  safeCheckout,
  hasUpstream,
  assertNoEnvStaged
} from './plumbing.js';

import { SITES_ROOT } from '../../config/index.js';

/* -------------------------------------------------
   Helpers
-------------------------------------------------- */

function getSiteGitConfig(siteId) {
  const site = db
    .prepare(`
      SELECT directory, branch, repository, live_commit
      FROM sites
      WHERE uuid = ?
    `)
    .get(siteId);

  if (!site) throw new Error('Site not found');

  return {
    sitePath: path.resolve(process.cwd(), 'data', 'sites', site.directory),
    branch: site.branch || 'main',
    repository: site.repository,
    liveCommit: site.live_commit
  };
}

/* -------------------------------------------------
   SSH / remote validation
-------------------------------------------------- */

export async function checkSSHAccess({ siteId }) {
  const { sitePath, repository } = getSiteGitConfig(siteId);

  if (!repository) {
    throw new Error('No remote configured');
  }

  await git(sitePath, ['ls-remote', repository]);
}

/* -------------------------------------------------
   Fetch / pull
-------------------------------------------------- */

export async function fetchRemote({ siteId }) {
  const { sitePath, branch, repository } = getSiteGitConfig(siteId);

  if (!repository) return;

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);

  await git(sitePath, ['fetch', repository]);
}

export async function pullFromRemote({ siteId }) {
  const { sitePath, branch, repository } = getSiteGitConfig(siteId);

  if (!repository) {
    throw new Error('No remote configured');
  }

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);
  await assertNoEnvStaged(sitePath);
  await checkSSHAccess({ siteId });

  // ensure origin exists
  try {
    await git(sitePath, ['remote', 'get-url', 'origin']);
  } catch {
    await git(sitePath, ['remote', 'add', 'origin', repository]);
  }

  await git(sitePath, ['fetch', 'origin']);

  // establish upstream if missing
  if (!(await hasUpstream(sitePath))) {
    await git(sitePath, [
      'branch',
      '--set-upstream-to',
      `origin/${branch}`
    ]);
  }

  try {
    await git(sitePath, ['merge', '--no-edit', '@{u}']);
  } catch {
    throw new Error(
      'Merge conflict while pulling from remote. Resolve manually.'
    );
  }

  return { pulled: true };
}

/* -------------------------------------------------
   Push
-------------------------------------------------- */

export async function syncToRemote({ siteId }) {
  const { sitePath, branch, repository } = getSiteGitConfig(siteId);

  if (!repository) {
    throw new Error('No remote configured');
  }

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);
  await assertNoEnvStaged(sitePath);
  await checkSSHAccess({ siteId });

  const args = (await hasUpstream(sitePath))
    ? ['push', repository, branch]
    : ['push', '-u', repository, branch];

  await git(sitePath, args);

  return { pushed: true };
}

/* -------------------------------------------------
   Ahead / behind counts
-------------------------------------------------- */

export async function getUnpushedCommitCount({ siteId }) {
  const { sitePath, branch } = getSiteGitConfig(siteId);

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);

  if (!(await hasUpstream(sitePath))) {
    const { stdout } = await git(sitePath, [
      'rev-list',
      '--count',
      'HEAD'
    ]);
    return Number(stdout.trim()) || 0;
  }

  const { stdout } = await git(sitePath, [
    'rev-list',
    '--count',
    '@{u}..HEAD'
  ]);

  return Number(stdout.trim()) || 0;
}

export async function getRemoteAheadCount({ siteId }) {
  const { sitePath, branch } = getSiteGitConfig(siteId);

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);

  if (!(await hasUpstream(sitePath))) return 0;

  const { stdout } = await git(sitePath, [
    'rev-list',
    '--count',
    'HEAD..@{u}'
  ]);

  return Number(stdout.trim()) || 0;
}

/* -------------------------------------------------
   Counts relative to live_commit
-------------------------------------------------- */

export async function countLiveCommitsToPush({ siteId }) {
  const { sitePath, branch, liveCommit } =
    getSiteGitConfig(siteId);

  if (!liveCommit) return 0;

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);

  const { stdout } = await git(sitePath, [
    'rev-list',
    '--count',
    `${liveCommit}..HEAD`
  ]);

  return Number(stdout.trim()) || 0;
}

export async function countRemoteCommitsToPull({ siteId }) {
  const { sitePath, branch, liveCommit } =
    getSiteGitConfig(siteId);

  if (!liveCommit) return 0;

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);

  if (!(await hasUpstream(sitePath))) return 0;

  const { stdout } = await git(sitePath, [
    'rev-list',
    '--count',
    `HEAD..@{u}`
  ]);

  return Number(stdout.trim()) || 0;
}

export async function cloneRepo({ sitePath, repository }) {
  if (!repository) {
    throw new Error('No repository URL provided');
  }

  // Safety: sitePath must not already exist
  try {
    await fs.access(sitePath);
    throw new Error('Target directory already exists');
  } catch {
    // expected: directory does not exist
  }

  // Ensure parent directory exists
  await fs.mkdir(path.dirname(sitePath), { recursive: true });

  // Clone repo
  await git(path.dirname(sitePath), [
    'clone',
    repository,
    sitePath
  ]);

  const { stdout } = await git(sitePath, [
    'rev-parse',
    'HEAD'
  ]);

  return {
    cloned: true,
    head: stdout.trim()
  };
}

export async function pushLiveCommits({ siteId }) {
  const {
    sitePath,
    branch,
    repository,
    liveCommit
  } = getSiteGitConfig(siteId);

  if (!repository) {
    throw new Error('No remote configured');
  }

  if (!liveCommit) {
    throw new Error('No live_commit set for site');
  }

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);
  await assertNoEnvStaged(sitePath);
  await checkSSHAccess({ siteId });

  // Ensure origin exists
  try {
    await git(sitePath, ['remote', 'get-url', 'origin']);
  } catch {
    await git(sitePath, ['remote', 'add', 'origin', repository]);
  }

  // Ensure upstream exists
  if (!(await hasUpstream(sitePath))) {
    await git(sitePath, [
      'branch',
      '--set-upstream-to',
      `origin/${branch}`
    ]);
  }

  // Sanity: ensure live_commit is an ancestor of HEAD
  try {
    await git(sitePath, [
      'merge-base',
      '--is-ancestor',
      liveCommit,
      'HEAD'
    ]);
  } catch {
    throw new Error(
      'live_commit is not an ancestor of HEAD; refusing to push'
    );
  }

  // Push only the branch (which includes commits since live_commit)
  await git(sitePath, ['push', 'origin', branch]);

  return { pushed: true };
}

/* -------------------------------------------------
   Helpers
-------------------------------------------------- */

function getSitePath(siteId) {
  const site = db.prepare(`
    SELECT directory
    FROM sites
    WHERE uuid = ?
  `).get(siteId);

  if (!site) {
    throw new Error(`Site not found: ${siteId}`);
  }

  return path.join(SITES_ROOT, site.directory);
}

/* -------------------------------------------------
   Read: HEAD commit
-------------------------------------------------- */

/**
 * Returns the current HEAD commit hash for the site.
 * This is the tip of the working timeline.
 */
export async function getHeadCommit({ siteId }) {
  const sitePath = getSitePath(siteId);

  const { stdout } = await git(sitePath, [
    'rev-parse',
    'HEAD'
  ]);

  return stdout.trim();
}

/* -------------------------------------------------
   Read: live commit
-------------------------------------------------- */

/**
 * Returns the commit hash currently marked as live.
 * This is the public-facing pointer.
 */
export async function getLiveCommit({ siteId }) {
  const row = db.prepare(`
    SELECT live_commit
    FROM sites
    WHERE uuid = ?
  `).get(siteId);

  if (!row) {
    throw new Error(`Site not found: ${siteId}`);
  }

  return row.live_commit;
}

export async function getLocalAheadCount({ siteId }) {
  const { sitePath, branch, repository } = getSiteGitConfig(siteId);

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);

  // Ensure origin exists if we have a repository configured
  if (repository) {
    try {
      await git(sitePath, ['remote', 'get-url', 'origin']);
    } catch {
      await git(sitePath, ['remote', 'add', 'origin', repository]);
    }

    // Keep refs fresh (don't assume anything)
    await git(sitePath, ['fetch', 'origin']);
  }

  // If no upstream, treat "ahead" as "all local commits"
  if (!(await hasUpstream(sitePath))) {
    const { stdout } = await git(sitePath, [
      'rev-list',
      '--count',
      'HEAD'
    ]);
    return Number(stdout.trim()) || 0;
  }

  // Standard "ahead of upstream"
  const { stdout } = await git(sitePath, [
    'rev-list',
    '--count',
    '@{u}..HEAD'
  ]);

  return Number(stdout.trim()) || 0;
}
