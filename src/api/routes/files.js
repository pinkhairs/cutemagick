import express from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import archiver from 'archiver';
import fsSync from 'fs';
import fs from 'fs/promises';

import db from '../../../infra/db/index.js';
import log from '../../../infra/logs/index.js';

import {
  commitFileCreate,
  commitFileEdit,
  commitFileDelete,
} from '../../../infra/git/porcelain.js';

import { SITES_ROOT, BLOCKED_NAMES } from '../../../config/index.js';

const router = express.Router();

/* ----------------------------
   Helpers
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
  const fullPath = path.resolve(siteDir, relativePath);

  if (!fullPath.startsWith(siteDir)) {
    throw new Error('Forbidden');
  }

  return { siteDir, fullPath };
}

/* ----------------------------
   Save file
----------------------------- */

router.post('/:siteId/save', async (req, res) => {
  const { siteId } = req.params;
  const { path: filePath } = req.body;

  log.info('[files:save] start', { siteId, filePath });

  try {
    const { content, message = null } = req.body;
    if (!filePath || typeof content !== 'string') {
      return res.status(400).json({ error: 'Missing path or content' });
    }

    const { siteDir, fullPath } = validateAndResolvePath(siteId, filePath);

    assertRealPathInside(siteDir, fullPath);

    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Not a file' });
    }

    await fs.writeFile(fullPath, content, 'utf8');

    const commitHash = await commitFileEdit({ siteId, filePath, message });

    res.set(
      'HX-Trigger',
      JSON.stringify({
        [`siteCommit`]: {
          commitHash,
          source: 'file:save'
        },
        [`site:${siteId}:file:saved`]: {
          path: filePath,
          commitHash
        }
      })
    );

    log.info('[files:save] success', { siteId, filePath });
    res.sendStatus(204);
  } catch (err) {
    log.error('[files:save] failed', { siteId, filePath, error: err.message });
    res.status(err.message === 'Forbidden' ? 403 : 500).json({ error: 'Failed to save file' });
  }
});

/* ----------------------------
   Delete files / folders
----------------------------- */

router.post('/:siteId/delete', async (req, res) => {
  const { siteId } = req.params;
  let { paths } = req.body;

  log.info('[files:delete] start', { siteId, paths });

  try {
    if (typeof paths === 'string') paths = [paths];
    if (!Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'Expected paths[]' });
    }

    const deleted = [];
    const hashedPaths = [];

    for (const relativePath of paths) {
      const { siteDir, fullPath } =
        validateAndResolvePath(siteId, relativePath);

      assertRealPathInside(siteDir, fullPath);

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

    let commit;

    if (deleted.length > 0) {
      commit = await commitFileDelete({ siteId, paths: deleted });
    }

    log.info('[files:delete] success', {
      siteId,
      deletedCount: deleted.length
    });

    res.set(
      'HX-Trigger',
      JSON.stringify({
        [`siteCommit`]: {
          commitHash: commit?.head,
          source: 'file:delete'
        },
        [`site:${siteId}:file:deleted`]: {
          paths: deleted,
          commitHash: commit?.head
        }
      })
    ).json({
      success: true,
      deleted,
      requested: paths,
      commitsChanged: deleted.length > 0,
      hashedPaths
    });
  } catch (err) {
    log.error('[files:delete] failed', { siteId, error: err.message });
    res.status(err.message === 'Forbidden' ? 403 : 500).json({ error: 'Failed to delete' });
  }
});

/* ----------------------------
   New folder
----------------------------- */

router.post('/:siteId/new-folder', async (req, res) => {
  const { siteId } = req.params;
  const { name, parentPath = '' } = req.body;

  log.info('[files:new-folder] start', { siteId, name, parentPath });

  try {
    if (!name || name.includes('/') || name === '.' || name === '..') {
      return res.status(400).json({ error: 'Invalid folder name' });
    }

    if (BLOCKED_NAMES.has(name)) {
      return res.status(403).json({ error: 'Blocked name' });
    }

    const targetPath = path.join(parentPath, name);
    const { fullPath } = validateAndResolvePath(siteId, targetPath);

    await fs.mkdir(fullPath, { recursive: true });

    log.info('[files:new-folder] success', { siteId, targetPath });
    res.json({ success: true, folder: { name, path: targetPath } });
  } catch (err) {
    log.error('[files:new-folder] failed', { siteId, error: err.message });
    res.status(err.message === 'Forbidden' ? 403 : 500).json({ error: 'Failed to create folder' });
  }
});

/* ----------------------------
   New file
----------------------------- */

router.post('/:siteId/new-file', async (req, res) => {
  const { siteId } = req.params;
  const { name, parentPath = '', content = '' } = req.body;

  log.info('[files:new-file] start', { siteId, name, parentPath });

  try {
    if (!name || name.includes('/')) {
      return res.status(400).json({ error: 'Invalid file name' });
    }

    if (BLOCKED_NAMES.has(name)) {
      return res.status(403).json({ error: 'Blocked name' });
    }

    const targetPath = path.join(parentPath, name);
    const { fullPath } = validateAndResolvePath(siteId, targetPath);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');

    await commitFileCreate({ siteId, fullPath });

    log.info('[files:new-file] success', { siteId, targetPath });
    res.json({ success: true });
  } catch (err) {
    log.error('[files:new-file] failed', { siteId, error: err.message });
    res.status(err.message === 'Forbidden' ? 403 : 500).json({ error: 'Failed to create file' });
  }
});

export default router;
