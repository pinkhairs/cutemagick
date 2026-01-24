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
  countCommitsSince
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
    src="/site/${site.directory}/"
  ></iframe>
  `);
});

router.get('/:uuid/files', (req, res) => {
  const { uuid } = req.params;

  const site = db
    .prepare('SELECT name FROM sites WHERE uuid = ?')
    .get(uuid);

  if (!site) return res.sendStatus(404);

  res.render('partials/explorer', {
    uuid,
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

router.get('/:uuid/history', (req, res) => {
  res.render('partials/history', {
    layout: false
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
    content: content,
    language: language
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

router.get('/:uuid/:path', (req, res) => {
  const { uuid, path } = req.params;

  const row = db.prepare(`SELECT name FROM sites WHERE uuid = ?`).get(uuid);
  const siteName = row?.name;
  const data = {
    id: uuid,
    title: siteName,
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
  const row = db.prepare(`SELECT name FROM sites WHERE uuid = ?`).get(uuid);
  const siteName = row?.name;
  const data = {
    id: uuid,
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
router.get('/:uuid/commits/count', async (req, res) => {
  const { uuid } = req.params;

  const site = db
    .prepare('SELECT live_commit FROM sites WHERE uuid = ?')
    .get(uuid);

  if (!site) {
    return res.status(404).send('');
  }

  let count = 0;
  try {
    count = await countCommitsSince({
      siteId: uuid,
      sinceCommit: site.live_commit
    });
  } catch (err) {
    console.error('Commit count failed:', err);
    return res.type('text/plain').send('');
  }

  if (count === 0) {
    return res.type('text/plain').send('No changes');
  }

  res
    .type('text/plain')
    .send(`${count} change${count === 1 ? '' : 's'}`);
});



export default router;

