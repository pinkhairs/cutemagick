// src/api/routes/fs.js
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import multer from 'multer';
import crypto from 'crypto';
import archiver from 'archiver';

import db from '../../../infra/db/index.js';
import log from '../../../infra/logs/index.js';
import { HIDDEN_NAMES } from '../../../config/index.js';

import {
  commitFileCreate,
  commitFileEdit,
  commitFileUpload,
  commitFileDelete,
  commitFileRename
} from '../../../infra/git/porcelain.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/* -------------------------------------------------
   Helpers
-------------------------------------------------- */

function fileId(siteId, relPath) {
  return crypto
    .createHash('sha256')
    .update(`${siteId}:${relPath}`)
    .digest('hex');
}

function getSiteRoot(siteId) {
  const site = db.prepare(`
    SELECT directory
    FROM sites
    WHERE uuid = ?
  `).get(siteId);

  if (!site) return null;

  return path.resolve(process.cwd(), 'data', 'sites', site.directory);
}

function resolveSafePath(siteRoot, relPath = '') {
  const cleaned = String(relPath)
  .replace(/^\/+/, '')   // strip leading slash
  .replace(/\\/g, '/');  // normalize windows slashes

  const resolved = path.resolve(siteRoot, cleaned);

  if (resolved !== siteRoot && !resolved.startsWith(siteRoot + path.sep)) {
    throw new Error('Path escape detected');
  }

  // block hidden roots (except .gitignore)
  for (const name of HIDDEN_NAMES) {
    if (name === '.git') continue; // handled separately
    if (resolved.includes(`/${name}`)) {
      throw new Error('Forbidden path');
    }
  }

  // block .git entirely
  if (resolved.includes('/.git/')) {
    throw new Error('Forbidden path');
  }

  return resolved;
}

/* -------------------------------------------------
   GET /fs/:siteId/list
-------------------------------------------------- */

router.get('/:siteId/list', async (req, res) => {
  const siteId = req.params.siteId;
  const siteRoot = getSiteRoot(siteId);
  if (!siteRoot) return res.sendStatus(404);

  try {
    const relBase = req.query.path || '';
    const dirPath = resolveSafePath(siteRoot, relBase);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    res.json(
      entries
        .filter(e => {
          if (HIDDEN_NAMES.has(e.name) && e.name !== '.gitignore') return false;
          return true;
        })
        .map(e => {
          const relPath = relBase ? `${relBase}/${e.name}` : e.name;

          return {
            id: e.name, // ✅ FileExplorer uses this for navigation/path
            name: e.name,
            type: e.isDirectory() ? 'folder' : 'file',
            hash: fileId(siteId, relPath) // ✅ your stable id (NOT used for paths)
          };
        })
    );
  } catch (err) {
    log.error('[fs:list]', err.message);
    res.status(400).send(err.message);
  }
});

/* -------------------------------------------------
   GET /fs/:siteId/file
-------------------------------------------------- */

router.get('/:siteId/file', async (req, res) => {
  const siteRoot = getSiteRoot(req.params.siteId);
  if (!siteRoot) return res.sendStatus(404);

  try {
    const filePath = resolveSafePath(siteRoot, req.query.path);
    const content = await fs.readFile(filePath, 'utf8');
    res.send(content);
  } catch (err) {
    log.error('[fs:file]', err.message);
    res.status(400).send(err.message);
  }
});

/* -------------------------------------------------
   POST /fs/:siteId/file
-------------------------------------------------- */

router.post('/:siteId/file', express.urlencoded({ extended: false }), async (req, res) => {
  const siteId = req.params.siteId;
  const siteRoot = getSiteRoot(siteId);
  if (!siteRoot) return res.sendStatus(404);

  const { path: relPath, content = '', message } = req.body;

  try {
    const filePath = resolveSafePath(siteRoot, relPath);

    let existed = true;
    try {
      await fs.stat(filePath);
    } catch {
      existed = false;
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');

    if (existed) {
      await commitFileEdit({
        siteId,
        filePath: relPath,
        message
      });
    } else {
      await commitFileCreate({
        siteId,
        fullPath: filePath,
        message
      });
    }

    res.sendStatus(204);
  } catch (err) {
    log.error('[fs:file]', err.message);
    res.status(400).send(err.message);
  }
});

/* -------------------------------------------------
   POST /fs/:siteId/folder
-------------------------------------------------- */

router.post('/:siteId/folder', express.urlencoded({ extended: false }), async (req, res) => {
  const siteRoot = getSiteRoot(req.params.siteId);
  if (!siteRoot) return res.sendStatus(404);

  try {
    const folderPath = resolveSafePath(siteRoot, req.body.path);
    await fs.mkdir(folderPath, { recursive: true });
    res.sendStatus(204);
  } catch (err) {
    log.error('[fs:folder]', err.message);
    res.status(400).send(err.message);
  }
});

/* -------------------------------------------------
   POST /fs/:siteId/rename
-------------------------------------------------- */

router.post('/:siteId/rename', express.urlencoded({ extended: false }), async (req, res) => {
  const siteId = req.params.siteId;
  const siteRoot = getSiteRoot(siteId);
  if (!siteRoot) return res.sendStatus(404);

  const { from, to, message } = req.body;

  try {
    // Validate paths without mutating FS
    resolveSafePath(siteRoot, from);
    resolveSafePath(siteRoot, to);

    await commitFileRename({
      siteId,
      oldPath: from,
      newPath: to,
      message
    });

    res.sendStatus(204);
  } catch (err) {
    log.error('[fs:rename]', err.message);
    res.status(400).send(err.message);
  }
});

/* -------------------------------------------------
   POST /fs/:siteId/delete
-------------------------------------------------- */

router.post('/:siteId/delete', express.urlencoded({ extended: false }), async (req, res) => {
  const siteId = req.params.siteId;
  const siteRoot = getSiteRoot(siteId);
  if (!siteRoot) return res.sendStatus(404);

  const { path: relPath, message } = req.body;

  try {
    const target = resolveSafePath(siteRoot, relPath);

    await fs.rm(target, { recursive: true, force: true });

    await commitFileDelete({
      siteId,
      paths: [relPath],
      message
    });

    res.sendStatus(204);
  } catch (err) {
    log.error('[fs:delete]', err.message);
    res.status(400).send(err.message);
  }
});

/* -------------------------------------------------
   POST /fs/:siteId/upload
-------------------------------------------------- */

router.post('/:siteId/upload', upload.any(), async (req, res) => {
  const siteId = req.params.siteId;
  const siteRoot = getSiteRoot(siteId);
  if (!siteRoot) return res.sendStatus(404);

  const { path: basePath = '', message } = req.body;

  try {
    for (const file of req.files) {
      const relPath = path.join(basePath, file.originalname);
      const targetPath = resolveSafePath(siteRoot, relPath);

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, file.buffer);
      
      await commitFileUpload({
        siteId,
        filePath: relPath,
        message
      });
    }

    res.sendStatus(204);
  } catch (err) {
    log.error('[fs:upload]', err.message);
    res.status(400).send(err.message);
  }
});

/* -------------------------------------------------
   GET /fs/:siteId/download
-------------------------------------------------- */

router.get('/:siteId/download', async (req, res) => {
  const siteRoot = getSiteRoot(req.params.siteId);
  if (!siteRoot) return res.sendStatus(404);

  const relPath = req.query.path;

  // Ignore FileExplorer's probe request
  if (!relPath) {
    return res.sendStatus(204);
  }

  try {
    const filePath = resolveSafePath(siteRoot, relPath);
    const filename = path.basename(filePath);

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 🔑 Disable caching completely
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, private'
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.sendFile(filePath);
  } catch (err) {
    log.error('[fs:download]', err.message);
    return res.status(400).send(err.message);
  }
});

/* -------------------------------------------------
   POST /fs/:siteId/download-zip
-------------------------------------------------- */

router.get(
  '/:siteId/download-zip',
  async (req, res) => {
    const siteId = req.params.siteId;
    const siteRoot = getSiteRoot(siteId);
    if (!siteRoot) return res.sendStatus(404);

    let paths = req.query.paths;

    // Normalize to array
    if (Array.isArray(paths)) {
      // ok
    } else if (typeof paths === 'string') {
      paths = [paths];
    } else {
      return res.status(400).send('Invalid paths payload');
    }

    // Clean paths
    paths = paths
      .map(p => String(p).replace(/^\/+/, '').replace(/\\/g, '/'))
      .filter(Boolean);

    if (!paths.length) {
      return res.status(400).send('No paths provided');
    }

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="site-${siteId}-files.zip"`
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, private'
    );

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', err => {
      log.error('[fs:download-zip]', err.message);
      if (!res.headersSent) res.status(500).end();
    });

    archive.pipe(res);

    try {
      for (const relPath of paths) {
        const absPath = resolveSafePath(siteRoot, relPath);
        const stat = await fs.stat(absPath);

        if (stat.isDirectory()) {
          archive.directory(absPath, relPath);
        } else {
          archive.file(absPath, { name: relPath });
        }
      }

      await archive.finalize();
    } catch (err) {
      log.error('[fs:download-zip]', err.message);
      if (!res.headersSent) {
        res.status(400).send(err.message);
      }
    }
  }
);

export default router;
