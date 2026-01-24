import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import ensureGitIdentity from './ensureGitIdentity.js';
import db from '../../database.js';

const exec = promisify(execFile);
const SITES_DIR = path.resolve(process.cwd(), 'sites');

/* ------------------------------------------------------------------
   Low-level Git helpers
------------------------------------------------------------------- */

async function git(siteDir, args) {
  return exec('git', args, { cwd: siteDir });
}

async function hasCommits(sitePath) {
  try {
    await git(sitePath, ['rev-parse', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

async function safeCheckout(sitePath, branch) {
  if (!(await hasCommits(sitePath))) return;
  await git(sitePath, ['checkout', branch]);
}

/* ------------------------------------------------------------------
   Safety guards
------------------------------------------------------------------- */

function assertGitSafePath(filePath) {
  if (path.basename(filePath) === '.env') {
    throw new Error('Refusing to stage or commit .env');
  }
}

async function assertNoEnvStaged(sitePath) {
  const { stdout } = await git(sitePath, [
    'diff',
    '--cached',
    '--name-only'
  ]);

  if (stdout.split('\n').includes('.env')) {
    throw new Error('Refusing to commit or push .env');
  }
}

/* ------------------------------------------------------------------
   Repo + branch setup
------------------------------------------------------------------- */

export async function ensureRepo(sitePath, branch = 'main') {
  let isNewRepo = false;

  if (!fs.existsSync(sitePath)) {
    throw new Error(`Site path does not exist: ${sitePath}`);
  }

  try {
    await git(sitePath, ['rev-parse', '--git-dir']);
  } catch {
    await git(sitePath, ['init', '-b', branch]);
    isNewRepo = true;
  }

  ensureGitIdentity(sitePath);
  ensureLocalGitExclude(sitePath);

  if (!isNewRepo) {
    try {
      await git(sitePath, ['rev-parse', '--verify', branch]);
    } catch {
      await git(sitePath, ['checkout', '-b', branch]);
    }
  }

  return { isNewRepo };
}

export async function ensureBranch(sitePath, branch) {
  try {
    await git(sitePath, ['rev-parse', '--verify', branch]);
  } catch {
    throw new Error(`Managed branch "${branch}" does not exist`);
  }
}

/* ------------------------------------------------------------------
   Commit message helpers
------------------------------------------------------------------- */

function fmt(p) {
  return p.replace(/^\/+/, '');
}

function describeAction(action, paths = []) {
  if (!paths.length) return action;

  if (paths.length === 1) {
    return `${action} ${fmt(paths[0])}`;
  }

  return `${action} ${paths.length} items`;
}

function resolveCommitMessage(userMessage, fallback) {
  if (typeof userMessage === 'string' && userMessage.trim()) {
    return userMessage.trim();
  }
  return fallback;
}

async function commitIfStaged(sitePath, message) {
  await assertNoEnvStaged(sitePath);

  const { stdout } = await git(sitePath, [
    'status',
    '--porcelain'
  ]);

  if (!stdout.trim()) {
    return false;
  }

  await git(sitePath, ['commit', '-m', message]);
  return true;
}

/* ------------------------------------------------------------------
   Canonical commit entrypoint
------------------------------------------------------------------- */

async function commitSiteChange({
  siteId,
  action,
  paths = [],
  stageAll = true,
  message // ← optional user message
}) {
  const { sitePath, branch } = getSiteGitConfig(siteId);

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);

  if (stageAll) {
    await git(sitePath, ['add', '-A']);
  } else {
    for (const p of paths) {
      assertGitSafePath(p);
      await git(sitePath, ['add', p]);
    }
  }

  const fallback = describeAction(action, paths);
  const finalMessage = resolveCommitMessage(message, fallback);

  await commitIfStaged(sitePath, finalMessage);
}

/* ------------------------------------------------------------------
   Public commit actions (system-authored by default)
------------------------------------------------------------------- */

export async function commitFileCreate({ siteId, fullPath, message }) {
  const { sitePath } = getSiteGitConfig(siteId);
  const filePath = path.relative(sitePath, fullPath);

  if (filePath.startsWith('..')) {
    throw new Error('Git path escapes site root');
  }

  await commitSiteChange({
    siteId,
    action: 'Created file',
    paths: [filePath],
    stageAll: false,
    message
  });
}

export async function commitFileEdit({ siteId, filePath, message }) {
  await commitSiteChange({
    siteId,
    action: 'Saved',
    paths: [filePath],
    stageAll: false,
    message
  });
}

export async function commitFileUpload({ siteId, filePath, message }) {
  await commitSiteChange({
    siteId,
    action: 'Uploaded',
    paths: [filePath],
    stageAll: false,
    message
  });
}

export async function commitFileDelete({ siteId, paths, message }) {
  await commitSiteChange({
    siteId,
    action: 'Deleted',
    paths,
    stageAll: true,
    message
  });
}

export async function commitFileRename({
  siteId,
  oldPath,
  newPath,
  message
}) {
  await commitSiteChange({
    siteId,
    action: 'Renamed',
    paths: [`${oldPath} → ${newPath}`],
    stageAll: true,
    message
  });
}

/* ------------------------------------------------------------------
   Draft / semantic commits (repo-wide)
------------------------------------------------------------------- */

export async function saveDraft({
  sitePath,
  branch,
  message,
  repository
}) {
  await ensureRepo(sitePath, branch);
  await ensureBranch(sitePath, branch);
  await safeCheckout(sitePath, branch);

  await git(sitePath, ['add', '-A']);

  const finalMessage = resolveCommitMessage(
    message,
    'Save draft'
  );

  const committed = await commitIfStaged(sitePath, finalMessage);

  let pushed = false;
  if (committed && repository) {
    try {
      await assertNoEnvStaged(sitePath);
      await git(sitePath, ['push', 'origin', branch]);
      pushed = true;
    } catch (err) {
      console.warn('Git push blocked:', err.message);
    }
  }

  return { committed, pushed };
}

/* ------------------------------------------------------------------
   Helpers
------------------------------------------------------------------- */

function getSiteGitConfig(siteId) {
  const site = db
    .prepare('SELECT directory, branch FROM sites WHERE uuid = ?')
    .get(siteId);

  if (!site) throw new Error('Site not found');

  return {
    sitePath: path.resolve(SITES_DIR, site.directory),
    branch: site.branch || 'main'
  };
}

function ensureLocalGitExclude(sitePath) {
  const excludePath = path.join(sitePath, '.git', 'info', 'exclude');

  let contents = '';
  if (fs.existsSync(excludePath)) {
    contents = fs.readFileSync(excludePath, 'utf8');
  }

  if (!contents.includes('.env')) {
    contents += (contents.endsWith('\n') ? '' : '\n') + '.env\n';
    fs.writeFileSync(excludePath, contents, 'utf8');
  }
}

/* ------------------------------------------------------------------
   Commit inspection helpers (read-only)
------------------------------------------------------------------- */

export async function getCommitList({ siteId }) {
  const { sitePath } = getSiteGitConfig(siteId);

  try {
    const { stdout } = await git(sitePath, [
      'rev-list',
      '--reverse',
      'HEAD'
    ]);

    return stdout
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function countCommitsSince({
  siteId,
  sinceCommit // may be null
}) {
  const commits = await getCommitList({ siteId });

  if (!commits.length) return 0;

  if (!sinceCommit) {
    return commits.length;
  }

  const idx = commits.indexOf(sinceCommit);
  if (idx === -1) {
    // live_commit no longer exists → treat as all changes
    return commits.length;
  }

  return commits.length - (idx + 1);
}

/* ------------------------------------------------------------------
   Initial scaffold commit (system-authored)
------------------------------------------------------------------- */

export async function commitInitialScaffold({ siteId, message }) {
  await commitSiteChange({
    siteId,
    action: 'Create site',
    stageAll: true,
    message: message || 'Create site'
  });
}
