import express from 'express';
const router = express.Router();
import multer from 'multer';
import path from 'path';
import db from '../../database.js';

const SITES_ROOT = '/app/sites';
import fsSync from 'fs';
import crypto from 'crypto';
import { commitFileCreate, commitFileDelete, commitFileUpload, commitFileEdit } from '../lib/gitService.js';

import fs from 'fs/promises';
const BLOCKED_NAMES = new Set(['.env', '.git']);

const storage = multer.diskStorage({
destination(req, file, cb) {
  const siteId = req.params.siteId;

  try {
    const row = db
      .prepare('SELECT directory FROM sites WHERE uuid = ?')
      .get(siteId);

    if (!row?.directory) {
      return cb(new Error('Site directory not found'));
    }

    const folderPath = JSON.parse(req.body.path || '[]');

    const safeParts = folderPath.filter(
      p => typeof p === 'string' && !p.includes('..') && !p.includes('/')
    );

    const dest = path.join('/app/sites', row.directory, ...safeParts);

    fsSync.mkdirSync(dest, { recursive: true });

    cb(null, dest);
  } catch (err) {
    cb(err);
  }
},
  filename(req, file, cb) {
    cb(null, file.originalname);
  }
});



const upload = multer({ storage });
/* ----------------------------
   Helpers (same pattern as sites.js)
----------------------------- */
function assertRealPathInside(root, target) {
  const real = fsSync.realpathSync(target);
  const rel = path.relative(root, real);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Symlink escapes site root');
  }
}

function validateAndResolvePath(siteUUID, relativePath = '') {
  const site = db
    .prepare('SELECT directory FROM sites WHERE uuid = ?')
    .get(siteUUID);


  if (!site) {
    throw new Error('Site not found');
  }

  const siteDir = path.resolve(SITES_ROOT, site.directory);

  if (!siteDir) {
    throw new Error('Site directory missing');
  }

  const fullPath = path.resolve(siteDir, relativePath);

  // 🚨 SECURITY CHECK: prevent traversal
  if (!fullPath.startsWith(path.resolve(siteDir))) {
    throw new Error('Forbidden');
  }

  return {
    siteDir,
    fullPath
  };
}

// Save / edit file
router.post('/:siteId/save', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { path: filePath, content, message = null } = req.body;

    if (!filePath || typeof content !== 'string') {
      return res.status(400).json({ error: 'Missing path or content' });
    }

    const { siteDir, fullPath } = validateAndResolvePath(siteId, filePath);

    // 🔒 symlink escape guard
    try {
      assertRealPathInside(siteDir, fullPath);
    } catch {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Ensure file exists
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Not a file' });
    }

    // Write contents
    await fs.writeFile(fullPath, content, 'utf8');

    // Git commit (single-file edit)
    await commitFileEdit({
      siteId,
      filePath,
      message
    });

    // 🔔 HTMX / UI signal
    res.set(
      'HX-Trigger-After-Settle',
      JSON.stringify({
        'file:saved': {
          siteId,
          path: filePath
        },
        commitsChanged: true
      })
    )

    res.sendStatus(204);
  } catch (err) {
    console.error('[save] failed:', err);

    if (err.message === 'Site not found') {
      return res.status(404).json({ error: 'Site not found' });
    }
    if (err.message === 'Forbidden') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.status(500).json({ error: 'Failed to save file' });
  }
});


router.post('/:siteId/delete', async (req, res) => {
  try {
    const { siteId } = req.params;

    let { paths } = req.body;

    if (typeof paths === 'string') {
      paths = [paths];
    }

    if (!Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'Expected paths[]' });
    }

    const deleted = [];
    const hashedPaths = [];

    let siteDirForCommit; // ✨ remember once

    for (const relativePath of paths) {
      let siteDir, fullPath;

      ({ siteDir, fullPath } = validateAndResolvePath(siteId, relativePath));
      siteDirForCommit ??= siteDir; // ✨ capture repo root

      // 🔒 symlink escape guard
      try {
        const real = await fs.realpath(fullPath);
        const rel = path.relative(siteDir, real);

        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      } catch {
        return res.status(403).json({ error: 'Forbidden' });
      }

      let stats;
      try {
        stats = await fs.stat(fullPath);
      } catch (err) {
        if (err.code === 'ENOENT') continue;
        throw err;
      }

      if (stats.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);

        const pathHash = crypto
          .createHash('sha256')
          .update(relativePath)
          .digest('hex')
          .slice(0, 12);

        hashedPaths.push(`${siteId}-${pathHash}`);
      }

      deleted.push(relativePath);
    }
      // after the for-loop, before sending the response
      if (deleted.length > 0) {
        await commitFileDelete({
          siteId,
          paths: deleted
        });
      }
res.status(200).json({
  success: true,
  deleted,        // array of relative paths actually removed
  requested: paths, // what the client asked for
  commitsChanged: deleted.length > 0,
  hashedPaths
});
  } catch (err) {
    console.error('Delete failed:', err);

    if (err.message === 'Site not found') {
      return res.status(404).json({ error: 'Site not found' });
    }
    if (err.message === 'Forbidden') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.status(500).json({ error: 'Failed to delete' });
  }
});

// Create new folder
router.post('/:siteId/new-folder', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { name, parentPath = '' } = req.body;
    
    if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      return res.status(400).json({ error: 'Invalid folder name' });
    }

    if (BLOCKED_NAMES.has(name)) {
      return res.status(403).json({
        error: `Creation of "${name}" is not allowed`
      });
    }
    
    const targetPath = path.join(parentPath, name);
    const { siteDir, fullPath } = validateAndResolvePath(siteId, targetPath);
    
    await fs.mkdir(fullPath, { recursive: true });
    
    res.json({ 
      success: true, 
      folder: { 
        name, 
        path: targetPath
      } 
    });
  } catch (err) {
    console.error('Error creating folder:', err);
    if (err.message === 'Site not found') {
      return res.status(404).json({ error: 'Site not found' });
    }
    if (err.message === 'Forbidden') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Create new file
router.post('/:siteId/new-file', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { name, parentPath = '', content = '' } = req.body;

    if (!name || name.includes('/') || name.includes('\\')) {
      return res.status(400).json({ error: 'Invalid file name' });
    }

    if (BLOCKED_NAMES.has(name)) {
      return res.status(403).json({
        error: `Creation of "${name}" is not allowed`
      });
    }

    const targetPath = path.join(parentPath, name);
    const { siteDir, fullPath } = validateAndResolvePath(siteId, targetPath);

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // Create file
    await fs.writeFile(fullPath, content, 'utf8');

    await commitFileCreate({
      siteId,
      fullPath
    });

    res.json({
      success: true,
      file: {
        id: name,
        name,
        type: 'file',
        size: 0
      }
    });

  } catch (err) {
    console.error('Error creating file:', err);

    if (err.message === 'Site not found') {
      return res.status(404).json({ error: 'Site not found' });
    }
    if (err.message === 'Forbidden') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.status(500).json({ error: 'Failed to create file' });
  }
});


// Rename file or folder
router.post('/:siteId/rename', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { oldPath, newName } = req.body;

    if (!oldPath || !newName) {
      return res.status(400).json({ error: 'Old path and new name required' });
    }

    if (
      newName.includes('/') ||
      newName.includes('\\') ||
      newName === '.' ||
      newName === '..'
    ) {
      return res.status(400).json({ error: 'Invalid new name' });
    }

    if (BLOCKED_NAMES.has(newName)) {
      return res.status(403).json({
        error: `Creation of "${newName}" is not allowed`
      });
    }

    const { siteDir, fullPath: oldFullPath } =
      validateAndResolvePath(siteId, oldPath);

    // Build new path (same parent directory, new name)
    const parentDir = path.dirname(oldPath);
    const newPath = path.join(parentDir, newName);
    const { fullPath: newFullPath } =
      validateAndResolvePath(siteId, newPath);

    /* ---------------------------------
     * 1. Check if old path exists FIRST
     * --------------------------------- */
    try {
      await fs.stat(oldFullPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Already renamed → idempotent success
        return res.json({
          success: true,
          oldPath,
          newPath
        });
      }
      throw err;
    }

    /* ---------------------------------
     * 2. Symlink guard (only if exists)
     * --------------------------------- */
    try {
      assertRealPathInside(siteDir, oldFullPath);
    } catch {
      return res.status(403).json({ error: 'Forbidden' });
    }

    /* ---------------------------------
     * 3. Check if new path already exists
     * --------------------------------- */
    try {
      await fs.stat(newFullPath);
      return res
        .status(409)
        .json({ error: 'File or folder with new name already exists' });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      // New path doesn't exist — good to proceed
    }

    /* ---------------------------------
     * 4. Rename
     * --------------------------------- */
    await fs.rename(oldFullPath, newFullPath);

    res.json({
      success: true,
      oldPath,
      newPath
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'File or folder not found' });
    }
    if (err.message === 'Site not found') {
      return res.status(404).json({ error: 'Site not found' });
    }
    if (err.message === 'Forbidden') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    console.error('Error renaming:', err);
    res.status(500).json({ error: 'Failed to rename' });
  }
});

router.post('/:siteId/upload', upload.single('file'), async (req, res) => {
  try {
    const { siteId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const site = db
      .prepare('SELECT directory FROM sites WHERE uuid = ?')
      .get(siteId);

    if (!site || !site.directory) {
      return res.status(404).json({ error: 'Site not found' });
    }

    const siteDir = path.resolve(SITES_ROOT, site.directory);

    // Convert absolute FS path → repo-relative path
    const relativePath = path.relative(siteDir, req.file.path);

    if (relativePath.startsWith('..')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    try {
  await commitFileUpload({ siteId, filePath: relativePath });


res.status(200).json({
  id: req.file.originalname,
  name: req.file.originalname,
  type: 'file',
  size: req.file.size
});

} catch (err) {
  console.error('[upload] git commit failed:', err);
  // IMPORTANT: still return 200 or client will think upload failed
  res.status(200);
}

  } catch (err) {
    console.error('[upload] commit failed:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});



// Download file
router.get('/:siteId/download', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { filePath } = req.query;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }
    
    const { siteDir, fullPath } = validateAndResolvePath(siteId, filePath);
    
    // 🔒 symlink guard (real filesystem check)
    try {
      assertRealPathInside(siteDir, fullPath);
    } catch {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    // Check if file exists and is a file
    const stats = await fs.stat(fullPath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Not a file' });
    }
    
    // Send file
    res.download(fullPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }
    if (err.message === 'Site not found') {
      return res.status(404).json({ error: 'Site not found' });
    }
    if (err.message === 'Forbidden') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    console.error('Error downloading file:', err);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Open file via public URL (binary / direct access)
router.get('/:siteId/open', (req, res) => {
  try {
    const { siteId } = req.params;
    const { path: filePath = '' } = req.query;
    console.log({path})

    const site = db
      .prepare('SELECT directory, domain FROM sites WHERE uuid = ?')
      .get(siteId);

    if (!site || !site.directory) {
      return res.status(404).json({ error: 'Site not found' });
    }

    // Normalize path (no leading slashes)
    const cleanPath = String(filePath).replace(/^\/+/, '');

    let baseUrl;

    if (!site.domain) {
      // hosted under Cute Magick
      baseUrl = `/site/${site.directory}`;
    } else {
      // custom domain
      baseUrl = site.domain.startsWith('http')
        ? site.domain
        : `https://${site.domain}`;
    }

    const url = cleanPath
      ? `${baseUrl}/${cleanPath}`
      : baseUrl;

    res.json({ url });
  } catch (err) {
    console.error('Error resolving open URL:', err);
    res.status(500).json({ error: 'Failed to resolve URL' });
  }
});

export default router;

