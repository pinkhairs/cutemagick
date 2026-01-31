import path from 'path';
import db from '../db/index.js';
import { SITES_ROOT } from '../../config/index.js';

import {
  git,
  ensureRepo,
  ensureBranch,
  safeCheckout,
  assertGitSafePath,
  assertNoEnvStaged
} from './plumbing.js';

/* -------------------------------------------------
   Helpers
-------------------------------------------------- */

function getSiteGitConfig(siteId) {
  const site = db
    .prepare('SELECT directory, branch FROM sites WHERE uuid = ?')
    .get(siteId);

  if (!site) {
    throw new Error('Site not found');
  }

  return {
    sitePath: path.join(SITES_ROOT, site.directory),
    branch: site.branch || 'main',
  };
}

function resolveCommitMessage(userMessage, fallback) {
  return userMessage?.trim() || fallback;
}

/* -------------------------------------------------
   Commit helpers
-------------------------------------------------- */

async function commitIfStaged(sitePath, message) {
  console.log('[COMMIT CHECK]', sitePath, message);
  await assertNoEnvStaged(sitePath);

  const { stdout } = await git(sitePath, [
    'status',
    '--porcelain'
  ]);

  console.log('[COMMIT PORCELAIN]', JSON.stringify(stdout));

  if (!stdout.trim()) return null;

  try {
    await git(sitePath, ['commit', '-m', message]);
  } catch (err) {
    console.error('[GIT COMMIT FAILED]', err.stderr || err);
    throw err;
  }

  const { stdout: hashOut } = await git(sitePath, [
    'rev-parse',
    'HEAD'
  ]);

  return hashOut.trim();
}

/* -------------------------------------------------
   File-based porcelain
-------------------------------------------------- */

export async function commitFileCreate({ siteId, fullPath, message }) {
  const { sitePath, branch } = getSiteGitConfig(siteId);
  const rel = path.relative(sitePath, fullPath);

  if (rel.startsWith('..')) {
    throw new Error('Git path escapes site root');
  }

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);

  assertGitSafePath(rel);
  await git(sitePath, ['add', rel]);

  return commitIfStaged(
    sitePath,
    resolveCommitMessage(message, `Created ${rel}`)
  );
}

export async function commitFileEdit({ siteId, filePath, message }) {
  const { sitePath, branch } = getSiteGitConfig(siteId);

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);

  assertGitSafePath(filePath);
  await git(sitePath, ['add', filePath]);

  await commitIfStaged(
    sitePath,
    resolveCommitMessage(message, `Saved ${filePath}`)
  );
}

export async function commitFileUpload({ siteId, filePath, message }) {
  return commitFileEdit({ siteId, filePath, message });
}

export async function commitFileDelete({ siteId, paths, message }) {
  const { sitePath, branch } = getSiteGitConfig(siteId);

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);

  console.log('[DEBUG] fs siteRoot:', siteRoot);
  console.log('[DEBUG] git sitePath:', sitePath);


  await git(sitePath, ['add', '-A']);

  await commitIfStaged(
    sitePath,
    resolveCommitMessage(message, `Deleted ${paths.length} items`)
  );
}

export async function commitFileRename({
  siteId,
  oldPath,
  newPath,
  message
}) {
  const { sitePath, branch } = getSiteGitConfig(siteId);

  await ensureRepo(sitePath, branch);
  await ensureBranch(sitePath, branch);
  await safeCheckout(sitePath, branch);

  await git(sitePath, ['mv', oldPath, newPath]);

  await git(sitePath, [
    'commit',
    '-m',
    resolveCommitMessage(
      message,
      `Rename ${oldPath} → ${newPath}`
    )
  ]);
}

/* -------------------------------------------------
   Time Machine
-------------------------------------------------- */

export async function restoreCommitAsNew({
  siteId,
  commit,
  message
}) {
  const { sitePath, branch } = getSiteGitConfig(siteId);

  await ensureRepo(sitePath, branch);
  await ensureBranch(sitePath, branch);
  await safeCheckout(sitePath, branch);

  // Ensure commit exists
  await git(sitePath, ['cat-file', '-e', `${commit}^{commit}`]);

  // 🔑 Reset index + worktree to EXACT tree snapshot
  await git(sitePath, [
    'read-tree',
    '-u',
    '--reset',
    commit
  ]);

  // Commit the new snapshot
  return commitIfStaged(
    sitePath,
    resolveCommitMessage(
      message,
      `(Restored snapshot ${commit.slice(0, 7)})`
    )
  );
}

/* -------------------------------------------------
   Read-only helpers
-------------------------------------------------- */

export async function getHeadCommit({ siteId }) {
  const { sitePath } = getSiteGitConfig(siteId);
  try {
    const { stdout } = await git(sitePath, ['rev-parse', 'HEAD']);
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function getCommitHistory({ siteId }) {
  const { sitePath } = getSiteGitConfig(siteId);

  const { stdout } = await git(sitePath, [
    'log',
    '--date=iso',
    '--pretty=format:%H%x1f%ad%x1f%s'
  ]);

  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [hash, date, subject] = line.split('\x1f');
      return { hash, date, subject };
    });
}
