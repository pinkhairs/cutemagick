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
  // 🔒 never run git from /app (or empty) — this is what causes your exact error
  if (!siteDir || siteDir === process.cwd() || siteDir === '/app') {
    throw new Error(`[BUG] git called with unsafe cwd "${siteDir}" for: git ${args.join(' ')}`);
  }

  // Optional: refuse to run if it's not a repo for repo-scoped commands
  // (uncomment if you want it stricter)
  // if (!fs.existsSync(path.join(siteDir, '.git'))) { ... }

  return exec('git', args, {
    cwd: siteDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_SSH_COMMAND: [
        'ssh',
        '-i', SSH_KEY_PATH,
        '-o', 'IdentitiesOnly=yes',
        '-o', 'StrictHostKeyChecking=accept-new'
      ].join(' ')
    }
  });
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
  console.log('[BUG TRACE] safeCheckout called with:', {
    sitePath,
    branch
  });

  if (!branch) {
    throw new Error('[BUG] safeCheckout called without branch');
  }

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
  const { stdout } = await git(sitePath, ['diff', '--cached', '--name-only']);
  const files = String(stdout).split('\n');
  if (files.includes('.env')) {
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

try {
  await git(sitePath, ['checkout', branch]);
} catch {
  await git(sitePath, ['checkout', '-b', branch]);
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
    return null;
  }

  await git(sitePath, ['commit', '-m', message]);

  const { stdout: hashOut } = await git(sitePath, [
    'rev-parse',
    'HEAD'
  ]);

  return hashOut.trim();
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

  return await commitIfStaged(sitePath, finalMessage);
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

  return { committed };
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
  const { sitePath, branch } = getSiteGitConfig(siteId);

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);

  // Stage everything
  await git(sitePath, ['add', '-A']);

  // 1️⃣ Check if there is anything to commit
  const { stdout: statusOut } = await git(sitePath, [
    'status',
    '--porcelain'
  ]);

  const statusText = statusOut.trim();
  if (!statusText) {
    throw new Error('Initial scaffold has nothing to commit');
  }

  // 2️⃣ Commit
  await git(sitePath, [
    'commit',
    '-m',
    message || 'Create site'
  ]);

  // 3️⃣ Resolve the new HEAD hash
  const { stdout: hashOut } = await git(sitePath, [
    'rev-parse',
    'HEAD'
  ]);

  const hash = hashOut.trim(); // ← STRING, guaranteed

  // 4️⃣ Persist
  db.prepare(`
    UPDATE sites
    SET live_commit = ?
    WHERE uuid = ?
  `).run(hash, siteId);

  return hash;
}




export async function getCommitHistory({ siteId }) {
  const { sitePath } = getSiteGitConfig(siteId);

  try {
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
  } catch {
    return [];
  }
}

export async function getHeadCommit({ siteId }) {
  const { sitePath } = getSiteGitConfig(siteId);

  try {
    const { stdout } = await git(sitePath, ['rev-parse', 'HEAD']);
    return typeof stdout === 'string' ? stdout.trim() : null;
  } catch {
    return null;
  }
}


export async function getFileAtCommit({
  siteId,
  commit,
  filePath
}) {
  const { sitePath } = getSiteGitConfig(siteId);

  try {
    const { stdout } = await git(sitePath, [
      'show',
      `${commit}:${filePath}`
    ]);

    return stdout;
  } catch {
    return null;
  }
}


/* ------------------------------------------------------------------
   Time Machine: restore commit as new HEAD (cherry-pick)
------------------------------------------------------------------- */
export async function restoreCommitAsNew({
  siteId,
  commit,           // hash to restore
  message           // optional override message
}) {
  const { sitePath, branch } = getSiteGitConfig(siteId);

  await ensureRepo(sitePath, branch);
  await ensureBranch(sitePath, branch);
  await safeCheckout(sitePath, branch);

  // Ensure commit exists
  try {
    await git(sitePath, ['cat-file', '-e', `${commit}^{commit}`]);
  } catch {
    throw new Error(`Commit not found: ${commit}`);
  }

  // Read original commit subject
  let originalSubject = '';
  try {
    const { stdout } = await git(sitePath, [
      'log',
      '-1',
      '--pretty=%s',
      commit
    ]);
    originalSubject = stdout.trim();
  } catch {
    originalSubject = `snapshot ${commit.slice(0, 7)}`;
  }

  const fallbackMessage = `(Restored) ${originalSubject}`;

  const finalMessage = resolveCommitMessage(
    message,
    fallbackMessage
  );
  

  // Restore working tree + index to exact snapshot
  await git(sitePath, [
    'restore',
    '--source',
    commit,
    '--worktree',
    '--staged',
    '.'
  ]);

  // Commit only if something actually changed
  const committed = await commitIfStaged(sitePath, finalMessage);

  if (!committed) {
    // Snapshot already matches HEAD
    return null;
  }

  return committed;
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

  const finalMessage = resolveCommitMessage(
    message,
    `Rename ${oldPath} → ${newPath}`
  );

  await git(sitePath, [
    'commit',
    '-m',
    finalMessage
  ]);
}

/* ------------------------------------------------------------------
   Live site: checkout commit into working tree (no new commit)
------------------------------------------------------------------- */
export async function checkoutLiveCommit({ siteId, commit }) {
  const { sitePath } = getSiteGitConfig(siteId);

  // Ensure the commit exists
  try {
    await git(sitePath, ['cat-file', '-e', `${commit}^{commit}`]);
  } catch {
    throw new Error(`Commit not found: ${commit}`);
  }

  // Make working tree reflect the live commit
  await git(sitePath, ['checkout', commit]);
}


export async function pruneGitWorktrees(repoDir) {
  // console.log('[DEBUG prune] cwd candidate:', repoDir);

  try {
    // ✅ Verify repoDir is a repo (works for normal repos and worktrees)
    await git(repoDir, ['rev-parse', '--git-dir']);

    // ✅ Now safe to prune
    await git(repoDir, ['worktree', 'prune']);
  } catch (err) {
    const msg = err?.stderr || err?.message || '';
    console.warn('[DEBUG prune] failed for:', repoDir, msg);
  }
}


async function hasUpstream(sitePath) {
  try {
    await git(sitePath, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{u}'
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function syncToRemote({ siteId }) {
  const { sitePath, branch } = getSiteGitConfig(siteId);

  const site = db.prepare(`
    SELECT repository
    FROM sites WHERE uuid = ?
  `).get(siteId);

  if (!site?.repository) {
    throw new Error('No remote configured');
  }

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);
  await assertNoEnvStaged(sitePath);

  const remote = site.repository;

  const args = (await hasUpstream(sitePath))
    ? ['push', remote, branch]
    : ['push', '-u', remote, branch];

  await git(sitePath, args);

  return { pushed: true };
}

export async function getUnpushedCommitCount({ siteId }) {
  const { sitePath, branch } = getSiteGitConfig(siteId);

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);

  try {
    await git(sitePath, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{u}'
    ]);
  } catch {
    // ⬇️ THIS IS THE KEY CHANGE
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

  try {
    await git(sitePath, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{u}'
    ]);
  } catch {
    return null;
  }

  const { stdout } = await git(sitePath, [
    'rev-list',
    '--count',
    'HEAD..@{u}'
  ]);

  return Number(stdout.trim()) || 0;
}



const SSH_KEY_PATH = '/app/.ssh/id_ed25519';



export async function checkSSHAccess({ siteId }) {
  const { sitePath } = getSiteGitConfig(siteId);

  const { repository } = db.prepare(`
    SELECT repository FROM sites WHERE uuid = ?
  `).get(siteId);

  if (!repository) {
    throw new Error('No remote configured');
  }

  // IMPORTANT: test the URL directly, not "origin"
  await git(sitePath, [
    'ls-remote',
    repository
  ]);
}



function ensureLocalGitExclude(sitePath) {
  const infoDir = path.join(sitePath, '.git', 'info');
  const excludePath = path.join(infoDir, 'exclude');

  // ✅ Ensure parent dir exists
  fs.mkdirSync(infoDir, { recursive: true });

  // Then write exclude file
  fs.writeFileSync(
    excludePath,
    `
.env
.DS_Store
node_modules
`.trim() + '\n'
  );
}

export async function addDetachedWorktree({ repoDir, targetDir, commit }) {
  await git(repoDir, ['worktree', 'prune']);
  await git(repoDir, ['worktree', 'add', '--detach', targetDir, commit]);
}
/* ------------------------------------------------------------------
   Sync: push live commits to remote
------------------------------------------------------------------- */

export async function pushLiveCommits({ siteId }) {
  const { sitePath, branch } = getSiteGitConfig(siteId);

  const site = db.prepare(`
    SELECT repository, live_commit
    FROM sites
    WHERE uuid = ?
  `).get(siteId);

  if (!site) {
    throw new Error('Site not found');
  }

  if (!site.repository) {
    throw new Error('No remote configured');
  }

  if (!site.live_commit) {
    throw new Error('No live commit');
  }

  // Ensure repo + branch
  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);

  // Safety
  await assertNoEnvStaged(sitePath);

  // Ensure SSH access
  await checkSSHAccess({ siteId });

  // Ensure origin exists (idempotent)
  let hasOrigin = true;
  try {
    await git(sitePath, ['remote', 'get-url', 'origin']);
  } catch {
    hasOrigin = false;
  }

  if (!hasOrigin) {
    await git(sitePath, [
      'remote',
      'add',
      'origin',
      site.repository
    ]);
  }

  // Push current branch (live commits only by invariant)
  const args = (await hasUpstream(sitePath))
    ? ['push', 'origin', branch]
    : ['push', '-u', 'origin', branch];

  await git(sitePath, args);

  return { pushed: true };
}


/* ------------------------------------------------------------------
   Sync helpers
------------------------------------------------------------------- */
// ✅ CORRECT CODE — paste this whole function
export async function fetchRemote({ siteId }) {
  const { sitePath, branch } = getSiteGitConfig(siteId);

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);

  const site = db.prepare(`
    SELECT repository
    FROM sites
    WHERE uuid = ?
  `).get(siteId);

  if (!site?.repository) return;

  await git(sitePath, ['fetch', site.repository]);
}


/* ------------------------------------------------------------------
   Sync: pull remote commits (non-destructive)
------------------------------------------------------------------- */

export async function pullFromRemote({ siteId }) {
  const { sitePath, branch } = getSiteGitConfig(siteId);

  const site = db.prepare(`
    SELECT repository, live_commit
    FROM sites
    WHERE uuid = ?
  `).get(siteId);

  if (!site) {
    throw new Error('Site not found');
  }

  if (!site.repository) {
    throw new Error('No remote configured');
  }

  // We *allow* pull even if live_commit is null
  // (it just means nothing has ever been published yet)

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);
  await assertNoEnvStaged(sitePath);

  // Ensure SSH access
  await checkSSHAccess({ siteId });

  // Ensure origin exists
  let hasOrigin = true;
  try {
    await git(sitePath, ['remote', 'get-url', 'origin']);
  } catch {
    hasOrigin = false;
  }

  if (!hasOrigin) {
    await git(sitePath, [
      'remote',
      'add',
      'origin',
      site.repository
    ]);
  }

  // Always fetch first
  await git(sitePath, ['fetch', 'origin']);

  // Determine upstream
  let hasUpstream = true;
  try {
    await git(sitePath, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{u}'
    ]);
  } catch {
    hasUpstream = false;
  }

  if (!hasUpstream) {
    // First pull establishes tracking
    await git(sitePath, [
      'branch',
      '--set-upstream-to',
      `origin/${branch}`
    ]);
  }

  // Merge (NOT rebase, NOT reset)
  try {
    await git(sitePath, ['merge', '--no-edit', '@{u}']);
  } catch (err) {
    // Merge conflicts should surface clearly
    throw new Error(
      'Merge conflict while pulling from remote. Resolve conflicts manually.'
    );
  }

  return { pulled: true };
}


/* ------------------------------------------------------------------
   Sync counts relative to live_commit
------------------------------------------------------------------- */

export async function countLiveCommitsToPush({ siteId }) {
  const { sitePath, branch } = getSiteGitConfig(siteId);

  const site = db.prepare(`
    SELECT live_commit
    FROM sites
    WHERE uuid = ?
  `).get(siteId);

  if (!site?.live_commit) return 0;

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);

  // Needs upstream to exist; if none, treat as "all commits since live_commit"
  try {
    await git(sitePath, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{u}'
    ]);
  } catch {
    const { stdout } = await git(sitePath, [
      'rev-list',
      '--count',
      `${site.live_commit}..HEAD`
    ]);
    return Number(stdout.trim()) || 0;
  }

  const { stdout } = await git(sitePath, [
    'rev-list',
    '--count',
    `${site.live_commit}..HEAD`
  ]);

  return Number(stdout.trim()) || 0;
}


export async function countRemoteCommitsToPull({ siteId }) {
  const { sitePath, branch } = getSiteGitConfig(siteId);

  const site = db.prepare(`
    SELECT live_commit
    FROM sites
    WHERE uuid = ?
  `).get(siteId);

  if (!site?.live_commit) return 0;

  await ensureRepo(sitePath, branch);
  await safeCheckout(sitePath, branch);

  // If no upstream, you can't be "behind"
  try {
    await git(sitePath, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{u}'
    ]);
  } catch {
    return 0;
  }

  const { stdout } = await git(sitePath, [
    'rev-list',
    '--count',
    `HEAD..@{u}`
  ]);

  return Number(stdout.trim()) || 0;
}

/* ------------------------------------------------------------------
   Repo import
------------------------------------------------------------------- */
export async function cloneRepo({
  sitePath,
  repository
}) {
  if (!repository) {
    throw new Error('Repository URL required');
  }

  // Ensure parent exists
  fs.mkdirSync(sitePath, { recursive: true });

  // Clone directly into target dir
  await exec('git', ['clone', repository, sitePath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_SSH_COMMAND: [
        'ssh',
        '-i', SSH_KEY_PATH,
        '-o', 'IdentitiesOnly=yes',
        '-o', 'StrictHostKeyChecking=accept-new'
      ].join(' ')
    }
  });

  // Normalize repo state (identity, excludes, etc.)
  ensureGitIdentity(sitePath);
  ensureLocalGitExclude(sitePath);
}
