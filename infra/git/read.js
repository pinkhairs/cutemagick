import path from 'path';
import db from '../db/index.js';
import { git } from './plumbing.js';

/* -------------------------------------------------
   Helpers
-------------------------------------------------- */

function getSiteGitConfig(siteId) {
  const site = db
    .prepare('SELECT directory FROM sites WHERE uuid = ?')
    .get(siteId);

  if (!site) throw new Error('Site not found');

  return {
    sitePath: path.resolve(process.cwd(), 'data', 'sites', site.directory)
  };
}

/* -------------------------------------------------
   Commit inspection
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

/* -------------------------------------------------
   File inspection
-------------------------------------------------- */

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
