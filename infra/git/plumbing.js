import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

import { SSH_PRIVATE_KEY_PATH } from '../../config/index.js';
import { ensureGitIdentity } from './ensureGitIdentity.js';

const exec = promisify(execFile);

/* -------------------------------------------------
   Raw git executor
-------------------------------------------------- */

export async function git(cwd, args) {
  if (
    !cwd ||
    cwd === process.cwd() ||
    cwd === path.parse(cwd).root
  ) {
    throw new Error(
      `[BUG] git called with unsafe cwd "${cwd}"`
    );
  }

  return exec('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_SSH_COMMAND: [
        'ssh',
        '-i', SSH_PRIVATE_KEY_PATH,
        '-o', 'IdentitiesOnly=yes',
        '-o', 'StrictHostKeyChecking=accept-new'
      ].join(' ')
    }
  });
}

/* -------------------------------------------------
   Repo state helpers
-------------------------------------------------- */

export async function hasCommits(sitePath) {
  try {
    await git(sitePath, ['rev-parse', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

export async function safeCheckout(sitePath, branch) {
  if (!branch) throw new Error('[BUG] safeCheckout called without branch');
  if (!(await hasCommits(sitePath))) return;
  await checkoutIfNeeded(sitePath, branch);
}

export async function hasUpstream(sitePath) {
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

/* -------------------------------------------------
   Safety guards
-------------------------------------------------- */

export function assertGitSafePath(filePath) {
  if (path.basename(filePath) === '.env') {
    throw new Error('Refusing to stage or commit .env');
  }
}

export async function assertNoEnvStaged(sitePath) {
  const { stdout } = await git(sitePath, [
    'diff',
    '--cached',
    '--name-only'
  ]);

  if (stdout.split('\n').includes('.env')) {
    throw new Error('Refusing to commit or push .env');
  }
}

/* -------------------------------------------------
   Repo setup
-------------------------------------------------- */

export async function ensureRepo(sitePath, branch = 'main') {
  let isNewRepo = false;

  const gitDir = path.join(sitePath, '.git');

  if (!fs.existsSync(gitDir)) {
    await git(sitePath, ['init', '-b', branch]);
    isNewRepo = true;
  }

  await ensureGitIdentity(sitePath);
  ensureLocalGitExclude(sitePath);

  // 🔑 Explicit branch existence check
  try {
    await git(sitePath, ['rev-parse', '--verify', branch]);
  } catch {
    await git(sitePath, ['checkout', '-b', branch]);
    return { isNewRepo };
  }
  
  if (!isNewRepo) {
    await checkoutIfNeeded(sitePath, branch);
  }

  return { isNewRepo };
}

async function checkoutIfNeeded(sitePath, branch) {
  const { stdout } = await git(sitePath, ['branch', '--show-current']);
  if (stdout.trim() !== branch) {
    await git(sitePath, ['checkout', branch]);
  }
}

export async function ensureBranch(sitePath, branch) {
  try {
    await git(sitePath, ['rev-parse', '--verify', branch]);
  } catch {
    throw new Error(`Managed branch "${branch}" does not exist`);
  }
}

/* -------------------------------------------------
   Worktrees
-------------------------------------------------- */

export async function addDetachedWorktree({ repoDir, targetDir, commit }) {
  await git(repoDir, ['worktree', 'prune']);
  await git(repoDir, ['worktree', 'add', '--detach', targetDir, commit]);
}

export async function pruneGitWorktrees(repoDir) {
  try {
    await git(repoDir, ['rev-parse', '--git-dir']);
    await git(repoDir, ['worktree', 'prune']);
  } catch {
    // intentionally quiet
  }
}

/* -------------------------------------------------
   Local excludes
-------------------------------------------------- */

function ensureLocalGitExclude(sitePath) {
  const infoDir = path.join(sitePath, '.git', 'info');
  const excludePath = path.join(infoDir, 'exclude');

  fs.mkdirSync(infoDir, { recursive: true });

  fs.writeFileSync(
    excludePath,
    `.env
.DS_Store
node_modules
uploads/
*.db
*.db-shm
*.db-wal
*.db-journal
*.sqlite
*.sqlite3
*.sqlite-shm
*.sqlite-wal
*.sqlite-journal
*.duckdb
*.duckdb.wal
*.mdb
*.accdb
`.trim() + '\n'
  );
}
