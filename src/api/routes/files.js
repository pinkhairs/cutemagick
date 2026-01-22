import express from 'express';
const router = express.Router();
import multer from 'multer';
import path from 'path';
import db from '../../database.js';

const SITES_ROOT = '/app/sites';
import fs from 'fs/promises';

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      const siteId = req.params.siteId;

      // ✅ CORRECT: sites.directory
      const row = db
        .prepare('SELECT directory FROM sites WHERE uuid = ?')
        .get(siteId);

      if (!row || !row.directory) {
        throw new Error('Site directory not found');
      }

      const folderPath = JSON.parse(req.body.path || '[]');

      const safeParts = folderPath.filter(
        p => typeof p === 'string' &&
             !p.includes('..') &&
             !p.includes('/')
      );

      const dest = path.join(
        '/app/sites',
        row.directory,
        ...safeParts
      );

      fs.mkdir(dest, { recursive: true });

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
  const real = fs.realpath(target);
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


// Create new folder
router.post('/:siteId/new-folder', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { name, parentPath = '' } = req.body;
    
    if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      return res.status(400).json({ error: 'Invalid folder name' });
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
    
    
    const targetPath = path.join(parentPath, name);
    const { siteDir, fullPath } = validateAndResolvePath(siteId, targetPath);
    console.log({
  body: req.body,
  parentPath,
  targetPath
});
    // Ensure parent directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    
    // Create file
    await fs.writeFile(fullPath, content, 'utf8');
    
    res.json({ 
      success: true, 
      file: { 
        name, 
        path: targetPath
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
    
    if (newName.includes('/') || newName.includes('\\') || newName === '.' || newName === '..') {
      return res.status(400).json({ error: 'Invalid new name' });
    }
    
    const { siteDir, fullPath: oldFullPath } = validateAndResolvePath(siteId, oldPath);
    
    // 🔒 symlink guard on old path
    try {
      assertRealPathInside(siteDir, oldFullPath);
    } catch {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    // Build new path (same parent directory, new name)
    const parentDir = path.dirname(oldPath);
    const newPath = path.join(parentDir, newName);
    const { fullPath: newFullPath } = validateAndResolvePath(siteId, newPath);
    
    // Check if old path exists
    await fs.stat(oldFullPath);
    
    // Check if new path already exists
    try {
      await fs.stat(newFullPath);
      return res.status(409).json({ error: 'File or folder with new name already exists' });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      // New path doesn't exist, good to proceed
    }
    
    // Rename
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

// Delete file or folder
router.delete('/:siteId/delete', async (req, res) => {
  try {
    const { siteId } = req.params;
    const { filePath } = req.body;
    
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
    
    // Check if path exists
    const stats = await fs.stat(fullPath);
    
    // Remove file or directory
    if (stats.isDirectory()) {
      await fs.rm(fullPath, { recursive: true, force: true });
    } else {
      await fs.unlink(fullPath);
    }
    
    res.json({ success: true });
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
    console.error('Error deleting:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// Upload file
router.post('/:siteId/upload', upload.single('file'), (req, res) => {
  res.sendStatus(200);
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