import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';

const router = express.Router();
const SITES_ROOT = '/app/sites';

// Configure multer for file uploads
const upload = multer({ 
  dest: '/tmp/uploads',
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

/* ----------------------------
   Helpers (same pattern as sites.js)
----------------------------- */
function resolveSite(siteId) {
  const dir = path.join(SITES_ROOT, siteId);
  if (!fsSync.existsSync(dir)) return null;
  return dir;
}

function assertRealPathInside(root, target) {
  const real = fsSync.realpathSync(target);
  const rel = path.relative(root, real);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Symlink escapes site root');
  }
}

function validateAndResolvePath(siteId, relativePath) {
  const siteDir = resolveSite(siteId);
  if (!siteDir) {
    throw new Error('Site not found');
  }

  const fullPath = path.resolve(siteDir, relativePath);

  // 🔒 traversal guard
  if (!fullPath.startsWith(siteDir + path.sep)) {
    throw new Error('Forbidden');
  }

  return { siteDir, fullPath };
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
router.post('/:siteId/upload', upload.single('file'), async (req, res) => {
  try {
    const { siteId } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const { destination = '' } = req.body;
    const targetPath = path.join(destination, req.file.originalname);
    const { siteDir, fullPath } = validateAndResolvePath(siteId, targetPath);
    
    // Ensure destination directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    
    // Move file from temp to destination
    await fs.rename(req.file.path, fullPath);
    
    res.json({ 
      success: true, 
      file: {
        name: req.file.originalname,
        path: targetPath,
        size: req.file.size
      }
    });
  } catch (err) {
    // Clean up temp file if it exists
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    console.error('Error uploading file:', err);
    if (err.message === 'Site not found') {
      return res.status(404).json({ error: 'Site not found' });
    }
    if (err.message === 'Forbidden') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.status(500).json({ error: 'Failed to upload file' });
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

export default router;