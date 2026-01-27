import express from 'express';
import crypto from 'crypto';
import db from '../../database.js';
import {
  getUniqueFolderNameSuffix,
  slugify
} from '../lib/siteNaming.js';
import fs from 'fs/promises';
import path from 'path';
import { listDirectory } from '../lib/fileExplorerFS.js';
import multer from 'multer';
const upload = multer();
const router = express.Router();
const SITES_DIR = path.resolve(process.cwd(), 'sites');
import {
  commitInitialScaffold,
  countCommitsSince,
  getCommitHistory,
  getHeadCommit,
  restoreCommitAsNew,
  checkoutLiveCommit,
  checkSSHAccess,
  pushLiveCommits,
  fetchRemote,
  pullFromRemote,
  countLiveCommitsToPush,
  countRemoteCommitsToPull,
} from '../lib/gitService.js'; // adjust path as needed


router.post('/', express.urlencoded({ extended: false }), async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) {
    return res.status(400).send('Name required');
  }

  const uuid = crypto.randomUUID();
  const slug = slugify(name);
  const suffix = await getUniqueFolderNameSuffix(SITES_DIR, slug);

  const domain = ``;
  const directory = `${slug}${suffix}`;
  const now = new Date().toISOString();

  const sitePath = path.join(SITES_DIR, directory);

  const readmeContent = `Welcome to your site!

This is your site’s home.

🔮 First steps:
1. Edit **index.html**
2. Add images or new files
3. Click **Preview**

May your code be clear.

Happy creating!
  `;

  const indexHtmlContent = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Welcome to Cute Magick</title>
  </head>
  <body>
    <h1>Hello 🌈</h1>
    <p>Your site is live!</p>
  </body>
</html>
  `;

  try {
    await fs.mkdir(sitePath, { recursive: true });

    await fs.writeFile(
      path.join(sitePath, 'README.md'),
      readmeContent,
      'utf8'
    );

    await fs.writeFile(
      path.join(sitePath, 'index.html'),
      indexHtmlContent,
      'utf8'
    );

  } catch (err) {
    console.error('Failed to scaffold site:', err);
    return res.status(500).send('Failed to create site files');
  }

  db.prepare(`
    INSERT INTO sites (
      uuid,
      name,
      icon,
      domain,
      directory,
      repository,
      live_commit,
      created_at,
      last_viewed
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuid,
    name,
    '/img/default-icon.png',
    domain,
    directory,
    null,
    null,
    now,
    now
  );

  const hash = await commitInitialScaffold({ siteId: uuid });
  if (!hash) {
  throw new Error('Failed to resolve initial scaffold commit');
}

  res
  .set('HX-Trigger', 'refreshSites')
  .sendStatus(204);
});


router.get('/:uuid/iframe', (req, res) => {
  const { uuid } = req.params;

  const site = db
    .prepare('SELECT directory FROM sites WHERE uuid = ?')
    .get(uuid);

  if (!site) {
    return res.status(404).send('Site not found');
  }

  res.send(`
  <iframe
    src="/${site.directory}/"
  ></iframe>
  `);
});

router.get('/:uuid/files', (req, res) => {
  const { uuid } = req.params;

  const site = db
    .prepare('SELECT directory FROM sites WHERE uuid = ?')
    .get(uuid);

  if (!site) return res.sendStatus(404);

  res.render('partials/explorer', {
    uuid,
    directory: site.directory,
    layout: false
  });
});

router.post('/:uuid/files', async (req, res) => {
  try {
    const { uuid } = req.params;

    const site = db
      .prepare('SELECT directory FROM sites WHERE uuid = ?')
      .get(uuid);

    if (!site) {
      return res.json({ success: false, error: 'Site not found' });
    }

    const baseDir = path.join(SITES_DIR, site.directory);

    const pathIDs = JSON.parse(req.body?.path || '[]');
    const relParts = pathIDs.map(p => p[0]);

    const absPath = path.resolve(baseDir, ...relParts);

    if (!absPath.startsWith(baseDir)) {
      return res.json({ success: false, error: 'Invalid path' });
    }

    const dirents = await fs.readdir(absPath, { withFileTypes: true });

    const entries = await Promise.all(
      dirents.map(async (dirent) => {
        const fullPath = path.join(absPath, dirent.name);

        if (dirent.isDirectory()) {
          return {
            id: dirent.name,
            name: dirent.name,
            type: 'folder',
            attrs: { canmodify: true }
          };
        }

        const stat = await fs.stat(fullPath);

        return {
          id: dirent.name,
          name: dirent.name,
          type: 'file',
          size: stat.size,
          attrs: { canmodify: true }
        };
      })
    );

    res.json({ success: true, entries });
  } catch (err) {
    console.error('FileExplorer refresh failed:', err);
    res.json({
      success: false,
      error: 'Failed to read directory'
    });
  }
});

router.post('/:uuid/files/list', upload.none(), async (req, res) => {
  const { uuid } = req.params;
  const relPath = req.body?.path || '';

  const site = db
    .prepare('SELECT directory FROM sites WHERE uuid = ?')
    .get(uuid);

  if (!site) return res.sendStatus(404);

  function normalizeRelPath(p) {
    if (!p || p === '/') return '';
    return p.replace(/^\/+/, '');
  }

  const safeRelPath = normalizeRelPath(relPath);

  const siteRoot = path.resolve(SITES_DIR, site.directory);
  const absPath = path.resolve(siteRoot, safeRelPath);

  // 🔒 Security: must stay inside site root
  if (!absPath.startsWith(siteRoot)) {
    return res.status(400).json([]);
  }

  const entries = await listDirectory(siteRoot, safeRelPath.split('/').filter(Boolean));
  const HIDDEN_NAMES = new Set(['.env', '.git']);

  const filtered = entries.filter(entry => !HIDDEN_NAMES.has(entry.name));

  res.json(filtered);
});

/* ------------------------------------------------------------------
   Time Machine: restore commit as new HEAD
------------------------------------------------------------------- */

router.post('/:uuid/restore', express.urlencoded({ extended: false }), async (req, res) => {
  const { uuid } = req.params;
  const commit = req.body.commit;

  if (!commit) {
    return res.status(400).send('Commit hash required');
  }

  const site = db
    .prepare('SELECT uuid FROM sites WHERE uuid = ?')
    .get(uuid);

  if (!site) {
    return res.status(404).send('Site not found');
  }

  try {
    newHead = await restoreCommitAsNew({
      siteId: uuid,
      commit
    });
  } catch (err) {
    console.error('Time Machine restore failed:', err.message);
    return res
      .status(409)
      .send(err.message || 'Restore failed');
  }

  res
    .set('HX-Trigger', 'commitsChanged')
    .sendStatus(204);
});



router.get('/:uuid/history', async (req, res) => {
  const { uuid } = req.params;

  const site = db
    .prepare('SELECT live_commit FROM sites WHERE uuid = ?')
    .get(uuid);

  if (!site) return res.sendStatus(404);

  const commits = await getCommitHistory({ siteId: uuid });

  const enriched = commits.map(c => ({
    ...c,
    isLive: site.live_commit === c.hash,
    isSystem: c.subject.startsWith('Cute Magick:')
  }));

  res.render('partials/history', {
    layout: false,
    uuid,
    commits: enriched
  });
});


router.get('/:uuid/secrets', (req, res) => {
  res.render('partials/secrets', {
    layout: false
  });
});

router.get('/:uuid/settings', (req, res) => {
  res.render('partials/settings', {
    layout: false
  });
});
router.post('/:uuid/go-live', async (req, res) => {
  const { uuid } = req.params;

  const site = db
    .prepare(`
      SELECT live_commit
      FROM sites
      WHERE uuid = ?
    `)
    .get(uuid);

  if (!site) {
    return res.status(404).send('Site not found');
  }

  let headCommit;
  try {
    headCommit = await getHeadCommit({ siteId: uuid });
  } catch (err) {
    console.error('Failed to resolve HEAD commit:', err);
    return res.status(500).send('Failed to go live');
  }

  if (!headCommit) {
    return res.status(400).send('No changes to make live.');
  }

  // No-op if already live
  if (site.live_commit === headCommit) {
    return res.sendStatus(204);
  }

  try {
    // 🔑 Canonical GitService entrypoint
    await checkoutLiveCommit({
      siteId: uuid,
      commit: headCommit
    });
  } catch (err) {
    console.error('Failed to checkout live commit:', err);
    return res.status(500).send('Failed to switch live version');
  }

  // Persist pointer AFTER filesystem success
  db.prepare(`
    UPDATE sites
    SET live_commit = ?
    WHERE uuid = ?
  `).run(headCommit, uuid);

  res
    .set('HX-Trigger', 'commitsChanged')
    .sendStatus(204);
});




router.post('/:uuid/editor', express.urlencoded({ extended: false }), async (req, res) => {
  const { uuid } = req.params;
  const relPath = req.body.path || '';
  
  if (relPath.includes('..')) {
    return res.status(400).send('Invalid path');
  }
  
  const site = db
    .prepare(`SELECT name, directory FROM sites WHERE uuid = ?`)
    .get(uuid);
  
  if (!site) {
    return res.status(404).send('Site not found');
  }
  
  const filename = relPath
    ? path.basename(relPath)
    : site.name;
  
  // Detect language from file extension
  const ext = path.extname(relPath).toLowerCase().substring(1); // Remove the dot
  const languageMap = {
    'php': 'php',
    'js': 'javascript',
    'ts': 'typescript',
    'jsx': 'javascript',
    'tsx': 'typescript',
    'py': 'python',
    'sh': 'sh',
    'bash': 'sh',
    'rb': 'ruby',
    'go': 'golang',
    'rs': 'rust',
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'json': 'json',
    'md': 'markdown',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'sql': 'sql',
    'txt': 'text'
  };
  
  const language = languageMap[ext] || 'text';
  
  // Read the file content
  const siteRoot = path.resolve(SITES_DIR, site.directory);
  const filePath = path.resolve(siteRoot, relPath);
  
  // Security: ensure file is within site directory
  if (!filePath.startsWith(siteRoot)) {
    return res.status(400).send('Invalid path');
  }
  
  let content = '';
  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      return res.status(400).send('Cannot open directory as file');
    }
    
    content = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    console.error('Failed to read file:', err);
    content = `// Error reading file: ${err.message}`;
  }
  
  // Create window ID by hashing the file path
  const pathHash = crypto
    .createHash('sha256')
    .update(relPath)
    .digest('hex')
    .substring(0, 12); // Use first 12 characters for brevity
  
  const windowId = `${uuid}-${pathHash}`;
  
  res.render('partials/editor', {
    layout: false,
    id: windowId,
    siteUUID: uuid,
    siteName: site.name,
    title: filename,
    path: relPath,
    directory: site.directory,
    content: content,
    language: language,
    fileHash: pathHash
  });
});
router.post('/:uuid/code', express.urlencoded({ extended: false }), async (req, res) => {
  const { uuid } = req.params;
  const relPath = req.body.path || '';
  
  if (relPath.includes('..')) {
    return res.status(400).send('Invalid path');
  }
  
  const site = db
    .prepare('SELECT directory FROM sites WHERE uuid = ?')
    .get(uuid);
  
  if (!site) {
    return res.status(404).send('Site not found');
  }
  
  // Read the file content
  const siteRoot = path.resolve(SITES_DIR, site.directory);
  const filePath = path.resolve(siteRoot, relPath);
  
  // Security: ensure file is within site directory
  if (!filePath.startsWith(siteRoot)) {
    return res.status(400).send('Invalid path');
  }
  
  let content = '';
  try {
    // Check if it's a directory
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      return res.status(400).send('Cannot open directory as file');
    }
    
    content = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    console.error('Failed to read file:', err);
    content = `// Error reading file: ${err.message}`;
  }
  
  // Return just the plain text content (no HTML wrapper)
  res.type('text/plain').send(content);
});
router.get('/:uuid/commits-count', async (req, res) => {
  const { uuid } = req.params;

  const site = db
    .prepare('SELECT live_commit FROM sites WHERE uuid = ?')
    .get(uuid);

  if (!site) {
    return res.type('text/plain').send('');
  }

  let count = 0;
  try {
    count = await countCommitsSince({
      siteId: uuid,
      sinceCommit: site.live_commit
    });
  } catch (err) {
    console.error('Toolbar commit count failed:', err);
    return res.type('text/plain').send('');
  }

  const label =
    count === 0
      ? ''
      : count;

  return res
    .type('text/plain')
    .send(
      `<span class="badge" data-count="${count}">
        ${label}
      </span>`
    );
});
router.get('/:uuid/sync-status', async (req, res) => {
  const { uuid } = req.params;

  console.log('[SYNC] start', { uuid });

  res.set('Cache-Control', 'no-store');

  const site = db.prepare(`
    SELECT repository
    FROM sites
    WHERE uuid = ?
  `).get(uuid);

  console.log('[SYNC] site row', site);

  // 1️⃣ No remote configured → hide sync entirely
  if (!site?.repository) {
    console.log('[SYNC] no repository configured → hide');
    return res.type('text/plain').send('');
  }
  await fetchRemote({ siteId: uuid });

  let ahead = 0;
  let behind = 0;
  let sshOk = true;

  try {
    console.log('[SYNC] checking SSH access');
    await checkSSHAccess({ siteId: uuid });
    console.log('[SYNC] SSH OK');
  } catch (err) {
    sshOk = false;
    console.log('[SYNC] SSH FAILED', err?.message);
  }

  // ⚠️ SSH not authorized
  if (!sshOk) {
    console.log('[SYNC] returning SSH warning');
    return res.type('text/plain').send(`
      <a
        href="/docs/git-ssh"
        target="_blank"
        class="sync-warning"
        title="SSH access required to use this remote"
      >
        ⚠️
      </a>
    `);
  }

  try {
    ahead = await countLiveCommitsToPush({ siteId: uuid });
behind = await countRemoteCommitsToPull({ siteId: uuid });

    console.log('[SYNC] counts resolved', { ahead, behind });
  } catch (err) {
    console.log('[SYNC] error computing sync counts', err?.message);
    return res.type('text/plain').send('');
  }

  // 2️⃣ Fully synced → hide
  if (ahead === 0 && behind === 0) {
    console.log('[SYNC] fully synced → hide');
    return res.type('text/plain').send('');
  }

  // 3️⃣ Diverged → warning + badge
  if (ahead > 0 && behind > 0) {
    console.log('[SYNC] diverged', { ahead, behind });
    return res.type('text/plain').send(`
      <span
        class="sync-warning"
        title="Local and remote histories have diverged"
      >
        ⚠️
        <span class="badge">&uarr;${ahead}&darr;${behind}</span>
      </span>
    `);
  }

  // 4️⃣ Remote ahead → pull
  if (behind > 0) {
    console.log('[SYNC] remote ahead → pull', { behind });
    return res.type('text/plain').send(`
      <button
        class="sync-action"
        hx-post="/sites/${uuid}/sync/pull"
        hx-swap="none"
        title="Pull ${behind} commit${behind === 1 ? '' : 's'} from remote"
      >
        ⬇️
        <span class="badge">${behind}</span>
      </button>
    `);
  }

  // 5️⃣ Local ahead → push
  console.log('[SYNC] local ahead → push', { ahead });

  return res.type('text/plain').send(`
    <button
      class="sync-action"
      hx-post="/sites/${uuid}/sync/push"
      hx-swap="none"
      title="Sync ${ahead} live changes${ahead === 1 ? '' : 's'} to remote"
    >
      ⬆️
      <span class="badge">${ahead}</span>
    </button>
  `);
});

router.post('/:uuid/sync/push', async (req, res) => {
  const { uuid } = req.params;

  console.log('[SYNC PUSH] start', { uuid });

  try {
    await pushLiveCommits({ siteId: uuid });
  } catch (err) {
    console.error('[SYNC PUSH] failed', err.message);
    return res.status(409).send(err.message);
  }

  res
    .set('HX-Trigger', 'commitsChanged')
    .sendStatus(204);
});



router.get('/:uuid/:path', (req, res) => {
  const { uuid, path } = req.params;

  const row = db.prepare(`SELECT name, directory FROM sites WHERE uuid = ?`).get(uuid);
  const siteName = row?.name;
  const data = {
    id: uuid,
    title: siteName,
    directory: row?.directory,
    body: `<div class="p-4">Loading...</div>`,
    path
  };

  res.render('partials/folder', {
    ...data,
    layout: false
  });
});

router.get('/:uuid', (req, res) => {
  const { uuid } = req.params;
  const row = db.prepare(`SELECT name, directory FROM sites WHERE uuid = ?`).get(uuid);
  const siteName = row?.name;
  const data = {
    id: uuid,
    directory: row?.directory,
    title: siteName,
    body: `<div class="p-4">Loading...</div>`,
    path: ''
  };

  res.render('partials/folder', {
    ...data,
    layout: false
  });
});

router.get('/', (req, res) => {
  const sites = db
    .prepare(`
      SELECT
        uuid,
        name,
        icon,
        domain,
        directory
      FROM sites
      ORDER BY last_viewed DESC
    `)
  .all();

  res.render('partials/sites', {
    sites,
    layout: false,
  });
});

router.post('/:uuid/sync/pull', async (req, res) => {
  const { uuid } = req.params;

  console.log('[SYNC PULL] start', { uuid });

  try {
    await pullFromRemote({ siteId: uuid });
  } catch (err) {
    console.error('[SYNC PULL] failed', err.message);
    return res.status(409).send(err.message);
  }

  res
    .set('HX-Trigger', 'commitsChanged')
    .sendStatus(204);
});



export default router;


