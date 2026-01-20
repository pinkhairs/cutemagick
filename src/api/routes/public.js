import express from 'express';
import path from 'path';
import fs from 'fs';
import mime from 'mime-types';
import { runProcess } from '../lib/index.js';

const router = express.Router();
const SITES_ROOT = '/app/sites';

/* ----------------------------
  Helpers
----------------------------- */

function sendCgiResponse(res, stdout) {
const parts = stdout.split(/\r?\n\r?\n/);

if (parts.length === 1) {
  return res.send(stdout);
}

const headerLines = parts[0].split(/\r?\n/);
const body = parts.slice(1).join('\n\n');

for (const line of headerLines) {
  const idx = line.indexOf(':');
  if (idx === -1) continue;

  const key = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();

  if (!key || !value) continue;

  if (key.toLowerCase() === 'status') {
    const code = parseInt(value, 10);
    if (!isNaN(code)) {
      res.status(code);
    }
    continue;
  }

  res.setHeader(key, value);
}

return res.send(body);
}

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
  Regex-based handler
----------------------------- */

router.all(/^\/([^/]+)(?:\/(.*))?$/, async (req, res) => {
const site = req.params[0];
const reqPath = req.params[1] || '';
const siteDir = resolveSite(site);

if (!siteDir) {
  return res.status(404).send('Site not found');
}

const relPath = reqPath || 'index.html';
const filePath = path.resolve(siteDir, relPath);

// 🔒 traversal guard
if (!filePath.startsWith(siteDir + path.sep)) {
  return res.status(403).send('Forbidden');
}

if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
  return res.status(404).send('Not found');
}

// 🔒 symlink guard (real filesystem check)
try {
  assertRealPathInside(siteDir, filePath);
} catch {
  return res.status(403).send('Forbidden');
}

/* ----------------------------
    1️⃣ Explicit executable file
----------------------------- */
const ext = path.extname(filePath);

if (ext === '.php') {
  const { stdout, stderr } = await runProcess({
    lang: 'php',
    cwd: site,
    scriptPath: relPath,
    env: {
      REQUEST_METHOD: req.method,
      REQUEST_URI: req.originalUrl,
    },
  });

  if (stderr) console.warn(stderr);
  return sendCgiResponse(res, stdout);
}

if (ext === '.js') {
  const { stdout, stderr } = await runProcess({
    lang: 'node',
    cwd: site,
    scriptPath: relPath,
  });

  if (stderr) console.warn(stderr);
  return res.send(stdout);
}

if (ext === '.py') {
  const { stdout, stderr } = await runProcess({
    lang: 'python',
    cwd: site,
    scriptPath: relPath,
  });

  if (stderr) console.warn(stderr);
  return res.send(stdout);
}

if (ext === '.sh') {
  const stat = fs.statSync(filePath);
  if (!(stat.mode & 0o111)) {
    return res.status(403).send('Script not executable');
  }

  const { stdout, stderr } = await runProcess({
    lang: 'bash',
    cwd: site,
    scriptPath: relPath,
  });

  if (stderr) console.warn(stderr);
  return sendCgiResponse(res, stdout);
}

/* ----------------------------
    Static file
----------------------------- */
res.type(mime.lookup(filePath) || 'application/octet-stream');
return fs.createReadStream(filePath).pipe(res);
});

export default router;
