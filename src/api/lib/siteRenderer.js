import path from 'path';
import fs from 'fs';
import mime from 'mime-types';
import { runProcess } from './index.js';
import db from '../../database.js';
import {
  getFileAtCommit,
  getHeadCommit
} from './gitService.js';

const SITES_ROOT = '/app/sites';

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
  commit
}) {
  const siteDir = resolveSite(site);
  if (!siteDir) {
    return res.status(404).send('Site not found');
  }

  const siteRow = db.prepare(`
    SELECT uuid
    FROM sites
    WHERE directory = ?
  `).get(site);

  if (!siteRow) {
    return res.status(404).send('Site not found');
  }

  if (!commit) {
    return res.status(400).send('No commit specified');
  }

  const siteId = siteRow.uuid;
  const ext = path.extname(relPath);

  /* ----------------------------
     Static files → git
  ----------------------------- */

  if (!['.php', '.js', '.py', '.sh'].includes(ext)) {
    const contents = await getFileAtCommit({
      siteId,
      commit,
      filePath: relPath
    });

    if (contents == null) {
      return res.status(404).send('Not found');
    }

    res.type(mime.lookup(relPath) || 'application/octet-stream');
    return res.send(contents);
  }

  /* ----------------------------
     Executables → disk (HEAD only)
  ----------------------------- */

  const head = await getHeadCommit({ siteId });

  if (head !== commit) {
    return res
      .status(409)
      .send('Executable previews require materialized snapshot');
  }

  const filePath = path.resolve(siteDir, relPath);

  // 🔒 traversal guard
  if (!filePath.startsWith(siteDir + path.sep)) {
    return res.status(403).send('Forbidden');
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).send('Not found');
  }

  // 🔒 symlink guard
  try {
    assertRealPathInside(siteDir, filePath);
  } catch {
    return res.status(403).send('Forbidden');
  }

  let output;

  if (ext === '.php') {
    const { stdout } = await runProcess({
      lang: 'php',
      cwd: site,
      scriptPath: relPath,
      env: {
        REQUEST_METHOD: req.method,
        REQUEST_URI: req.originalUrl
      }
    });
    output = stdout;

  } else if (ext === '.js') {
    const { stdout } = await runProcess({
      lang: 'node',
      cwd: site,
      scriptPath: relPath
    });
    output = stdout;

  } else if (ext === '.py') {
    const { stdout } = await runProcess({
      lang: 'python',
      cwd: site,
      scriptPath: relPath
    });
    output = stdout;

  } else if (ext === '.sh') {
    const stat = fs.statSync(filePath);
    if (!(stat.mode & 0o111)) {
      return res.status(403).send('Script not executable');
    }

    const { stdout } = await runProcess({
      lang: 'bash',
      cwd: site,
      scriptPath: relPath
    });
    output = stdout;
  }

  return res.send(output);
}
