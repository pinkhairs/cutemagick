import path from 'path';
import fs from 'fs';
import mime from 'mime-types';
import { runProcess } from './index.js';
import db from '../../database.js';
import {
  getFileAtCommit,
  getHeadCommit
} from './gitService.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

const PREVIEW_ROOT = path.join('/app/sites', '.previews');
const SITES_ROOT = '/app/sites';
const LIVE_ROOT = path.join('/app/sites', '.live');
const PREVIEW_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

/* ----------------------------
   Helpers (engine-level)
----------------------------- */

function resolveSite(siteId) {
  const dir = path.join(SITES_ROOT, siteId);
  if (!fs.existsSync(dir)) return null;
  return dir;
}

function assertRealPathInside(root, target) {
  const real = fs.realpathSync(target);
  const rel = path.relative(root, real);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Symlink escapes site root');
  }
}

/* ----------------------------
   Core renderer
----------------------------- */

export async function renderSite({
  req,
  res,
  site,
  relPath,
  commit,
  mode
}) {

const siteRow = db.prepare(`
  SELECT uuid, live_commit
  FROM sites
  WHERE directory = ?
`).get(site);

if (!siteRow) {
  return res.status(404).send('Site not found');
}

  const live_commit = siteRow.live_commit;
const runtimeDir =
  mode === 'live'
    ? await resolveLiveSiteDir(site, live_commit)
    : await resolvePreviewSite(site, commit);


  if (!runtimeDir) {
    return res.status(404).send('Site not found');
  }


  if (!siteRow) {
    return res.status(404).send('Site not found');
  }

  if (!commit) {
    return res.status(400).send('No commit specified');
  }


  // ---------------------------------
// Resolve default index files
// ---------------------------------

let effectivePath = relPath || '';

if (effectivePath === '' || effectivePath.endsWith('/')) {
  const indexCandidates = [
    'index.php',
    'index.html',
    'index.js',
    'index.py',
    'index.sh'
  ];

  for (const name of indexCandidates) {
    const candidate = path.join(effectivePath, name);

const candidatePath = path.join(runtimeDir, candidate);

if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
  effectivePath = candidate;
  break;
}
  }
}

// Now that index is resolved, determine extension
const ext = path.extname(effectivePath);


  /* ----------------------------
     Static files → git
  ----------------------------- */
if (!['.php', '.js', '.py', '.sh'].includes(ext)) {
  const filePath = path.resolve(runtimeDir, effectivePath);

  if (!filePath.startsWith(runtimeDir + path.sep)) {
    return res.status(403).send('Forbidden');
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).send('Not found');
  }

  res.type(mime.lookup(effectivePath) || 'application/octet-stream');
  return res.send(fs.readFileSync(filePath));
}


  /* ----------------------------
     Executables → disk (HEAD only)
  ----------------------------- */

  const filePath = path.resolve(runtimeDir, effectivePath);

  // 🔒 traversal guard
  if (!filePath.startsWith(runtimeDir + path.sep)) {
    return res.status(403).send('Forbidden');
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).send('Not found');
  }

  // 🔒 symlink guard
  try {
    assertRealPathInside(runtimeDir, filePath);
  } catch {
    return res.status(403).send('Forbidden');
  }

  let output;

if (ext === '.php') {
  const { stdout, stderr } = await runProcess({
    lang: 'php',
    cwd: runtimeDir,
    scriptPath: effectivePath,
    env: {
      REQUEST_METHOD: req.method,
      REQUEST_URI: req.originalUrl,
      QUERY_STRING: req.originalUrl.split('?')[1] || '',
      CONTENT_TYPE: req.headers['content-type'] || '',
      CONTENT_LENGTH: req.headers['content-length'] || ''
    }
  });

  const { headers, body } = parseCgiOutput(stdout);


  // 🚫 Prevent forced downloads
  delete headers['content-disposition'];

  // Forward CGI headers
  for (const [key, value] of Object.entries(headers)) {
    if (key === 'content-length') continue;
    res.setHeader(key, value);
  }

  if (!headers['content-type']) {
    res.type('text/html');
  }

  return res.send(body);

} else if (ext === '.js') {
  const { stdout } = await runProcess({
    lang: 'node',
    cwd: runtimeDir,
    scriptPath: effectivePath
  });

  res.type('text/plain');
  return res.send(stdout);

} else if (ext === '.py') {
  const { stdout } = await runProcess({
    lang: 'python',
    cwd: runtimeDir,
    scriptPath: effectivePath
  });

  res.type('text/plain');
  return res.send(stdout);

} else if (ext === '.sh') {
  const stat = fs.statSync(filePath);
  if (!(stat.mode & 0o111)) {
    return res.status(403).send('Script not executable');
  }

  const { stdout } = await runProcess({
    lang: 'bash',
    cwd: runtimeDir,
    scriptPath: effectivePath
  });

  res.type('text/plain');
  return res.send(stdout);
}


  return res.send(output);
}


function parseCgiOutput(output) {
  // Support both CRLF and LF
  const match = output.match(/\r?\n\r?\n/);

  if (!match) {
    return { headers: {}, body: output };
  }

  const idx = match.index;
  const sepLen = match[0].length;

  const headerBlock = output.slice(0, idx);
  const body = output.slice(idx + sepLen);

  const headers = {};

  for (const line of headerBlock.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;

    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    headers[key] = value;
  }

  return { headers, body };
}



async function git(cwd, args) {
  return exec('git', args, { cwd });
}

export async function resolvePreviewSite(site, commit) {
  const liveDir = path.join(SITES_ROOT, site);
  if (!fs.existsSync(liveDir)) {
    throw new Error(`Live site does not exist: ${site}`);
  }

  const sitePreviewRoot = path.join(PREVIEW_ROOT, site);
  const previewDir = path.join(sitePreviewRoot, commit);

  // Ensure parent exists
  fs.mkdirSync(sitePreviewRoot, { recursive: true });

  // Already materialized → reuse
  if (fs.existsSync(previewDir)) {
    return previewDir;
  }

  // Materialize using git worktree
  // This is fast and shares objects with the main repo
  try {
    await git(liveDir, [
      'worktree',
      'add',
      '--detach',
      previewDir,
      commit
    ]);
  } catch (err) {
    // If something partially created the dir, clean it up
    try {
      fs.rmSync(previewDir, { recursive: true, force: true });
    } catch {}

    throw new Error(
      `Failed to materialize preview for ${site}@${commit}: ${err.message}`
    );
  }

  return previewDir;
}

export async function resolveLiveSiteDir(site, liveCommit) {
  const liveDir = path.join(LIVE_ROOT, site);
  const repoDir = path.join(SITES_ROOT, site);

  fs.mkdirSync(LIVE_ROOT, { recursive: true });

  // 1️⃣ Always clean stale git metadata first
  await git(repoDir, ['worktree', 'prune']);

  // 2️⃣ Ensure directory is actually gone
  if (fs.existsSync(liveDir)) {
    fs.rmSync(liveDir, { recursive: true, force: true });
  }

  // 3️⃣ Recreate worktree (force is REQUIRED for runtime dirs)
  await git(repoDir, [
    'worktree',
    'add',
    '--detach',
    '-f',
    liveDir,
    liveCommit
  ]);

  return liveDir;
}


export function cleanupOldPreviews() {
  if (!fs.existsSync(PREVIEW_ROOT)) return;

  const now = Date.now();

  for (const site of fs.readdirSync(PREVIEW_ROOT)) {
    const siteDir = path.join(PREVIEW_ROOT, site);
    if (!fs.statSync(siteDir).isDirectory()) continue;

    for (const commit of fs.readdirSync(siteDir)) {
      const previewDir = path.join(siteDir, commit);

      try {
        const stat = fs.statSync(previewDir);
        const age = now - stat.mtimeMs;

        if (age > PREVIEW_TTL_MS) {
          console.log('[cleanup] removing preview', previewDir);
          fs.rmSync(previewDir, { recursive: true, force: true });
        }
      } catch {}
    }
  }
}
