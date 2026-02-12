import path from 'path';
import fs from 'fs';
import mime from 'mime-types';

import db from '../../infra/db/index.js';
import { runProcess, executeRuntime } from '../../infra/index.js';
import { ensureRender } from '../../infra/fs/renders.js';
import { assertRealPathInside } from '../../infra/fs/assertInsideRoot.js';

/* -------------------------------------------------
   Site renderer
   ------------------------------------------------- */

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

  const commitToRender =
    mode === 'live' ? siteRow.live_commit : commit;

  if (!commitToRender) {
    return res.status(400).send('No commit specified');
  }

  let runtimeDir;
  try {
    runtimeDir = await ensureRender({
      site,
      commit: commitToRender
    });
  } catch (err) {
    console.error('[render] failed to materialize render:', err.message);
    return res.status(500).send('Failed to prepare site');
  }

  /* ---------------------------------
     Resolve default index files
     --------------------------------- */

  let effectivePath = relPath || '';

  if (effectivePath === '' || effectivePath.endsWith('/')) {
    const indexCandidates = [
      'index.php',
      'index.html',
      'index.js',
      'index.py',
      'index.sh',
      'index.lua'
    ];

    for (const name of indexCandidates) {
      const candidate = path.join(effectivePath, name);
      const candidatePath = path.join(runtimeDir, candidate);

      if (
        fs.existsSync(candidatePath) &&
        fs.statSync(candidatePath).isFile()
      ) {
        effectivePath = candidate;
        break;
      }
    }
  }

  // Directory requested with no index
  if (!effectivePath) {
    return res.status(404).send('Not found');
  }

  const absPath = path.resolve(runtimeDir, effectivePath);

  // 🔒 traversal + symlink guard
  try {
    assertRealPathInside(runtimeDir, absPath);
  } catch {
    return res.status(403).send('Forbidden');
  }

  const ext = path.extname(effectivePath);

/* ---------------------------------
   Executable vs static decision
   --------------------------------- */

let isExecutable = false;

// PHP, Python, Lua: always executable
if (ext === '.php' || ext === '.py' || ext === '.lua') {
  isExecutable = true;
}

// Bash: executable bit required
if (ext === '.sh') {
  isExecutable = true;
}

// Node: only if shebang explicitly says node
if (ext === '.js') {
  const shebang = readShebang(absPath);
  isExecutable = isNodeShebang(shebang);
}



  if (!isExecutable) {
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      return res.status(404).send('Not found');
    }

    const type =
      mime.lookup(effectivePath) ||
      (ext === '.js' ? 'application/javascript' : 'application/octet-stream');

    res.type(type);
    return res.send(fs.readFileSync(absPath));
  }

  /* ---------------------------------
     Executable scripts
     --------------------------------- */

  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    return res.status(404).send('Not found');
  }

  return executeScript({
    req,
    res,
    runtimeDir,
    scriptPath: effectivePath,
    ext
  });
}

/* -------------------------------------------------
   Script execution helpers
   ------------------------------------------------- */

async function executeScript({
  req,
  res,
  runtimeDir,
  scriptPath,
  ext
}) {
if (ext === '.php') {

  // Capture raw body (important for POST)
  let rawBody = null;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    rawBody = await new Promise((resolve, reject) => {
      let data = Buffer.alloc(0);

      req.on('data', chunk => {
        data = Buffer.concat([data, chunk]);
      });

      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  const { stdout, stderr } = await executeRuntime({
    lang: 'php',
    cwd: runtimeDir,
    scriptPath,
    body: rawBody,
    env: {
      REQUEST_METHOD: req.method,
      REQUEST_URI: req.originalUrl,
      QUERY_STRING: req.originalUrl.split('?')[1] || '',
      CONTENT_TYPE: req.headers['content-type'] || '',
      CONTENT_LENGTH: rawBody ? rawBody.length.toString() : '0',
    }
  });

  const { headers, body } = parseCgiOutput(stdout);

  delete headers['content-disposition'];

  for (const [key, value] of Object.entries(headers)) {
    if (key === 'content-length') continue;
    res.setHeader(key, value);
  }

  if (!headers['content-type']) {
    res.type('text/html');
  }

  return res.status(200).send(body);
}


if (ext === '.js') {
  const { stdout } = await executeRuntime({
    lang: 'node',
    cwd: runtimeDir,
    scriptPath,
    env: {
      REQUEST_METHOD: req.method,
      REQUEST_URI: req.originalUrl,
      QUERY_STRING: req.originalUrl.split('?')[1] || '',
      CONTENT_TYPE: req.headers['content-type'] || '',
      CONTENT_LENGTH: req.headers['content-length'] || '',
    },
  });

  const { headers, body } = parseCgiOutput(stdout);

  for (const [key, value] of Object.entries(headers)) {
    if (key === 'content-length') continue;
    res.setHeader(key, value);
  }

  if (!headers['content-type']) {
    res.type('text/html');
  }

  return res.send(body);
}
if (ext === '.py') {

  let rawBody = null;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    rawBody = await new Promise((resolve, reject) => {
      let data = Buffer.alloc(0);

      req.on('data', chunk => {
        data = Buffer.concat([data, chunk]);
      });

      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  const { stdout, stderr } = await executeRuntime({
    lang: 'python',
    cwd: runtimeDir,
    scriptPath,
    body: rawBody,
    env: {
      REQUEST_METHOD: req.method,
      REQUEST_URI: req.originalUrl,
      QUERY_STRING: req.originalUrl.split('?')[1] || '',
      CONTENT_TYPE: req.headers['content-type'] || '',
      CONTENT_LENGTH: rawBody ? rawBody.length.toString() : '0',
    }
  });

  const { headers, body } = parseCgiOutput(stdout);

  for (const [key, value] of Object.entries(headers)) {
    if (key === 'content-length') continue;
    res.setHeader(key, value);
  }

  if (!headers['content-type']) {
    res.type('text/html');
  }

  return res.status(200).send(body);
}

if (ext === '.lua') {
  let rawBody = null;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    rawBody = await new Promise((resolve, reject) => {
      let data = Buffer.alloc(0);
      req.on('data', chunk => data = Buffer.concat([data, chunk]));
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  const { stdout } = await runProcess(
    'lua',
    [scriptPath],
    {
      cwd: runtimeDir,
      env: {
        ...process.env,
        REQUEST_METHOD: req.method,
        REQUEST_URI: req.originalUrl,
        QUERY_STRING: req.originalUrl.split('?')[1] || '',
        CONTENT_TYPE: req.headers['content-type'] || '',
        CONTENT_LENGTH: rawBody ? rawBody.length.toString() : '0'
      },
      input: rawBody || undefined
    }
  );

  const { headers, body } = parseCgiOutput(stdout);

  for (const [key, value] of Object.entries(headers)) {
    if (key === 'content-length') continue;
    res.setHeader(key, value);
  }

  if (!headers['content-type']) {
    res.type('text/html');
  }

  return res.status(200).send(body);
}


if (ext === '.sh') {
  let rawBody = null;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    rawBody = await new Promise((resolve, reject) => {
      let data = Buffer.alloc(0);
      req.on('data', chunk => data = Buffer.concat([data, chunk]));
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  const { stdout } = await runProcess(
    '/bin/bash',
    [scriptPath],
    {
      cwd: runtimeDir,
      env: {
        ...process.env,
        REQUEST_METHOD: req.method,
        REQUEST_URI: req.originalUrl,
        QUERY_STRING: req.originalUrl.split('?')[1] || '',
        CONTENT_TYPE: req.headers['content-type'] || '',
        CONTENT_LENGTH: rawBody ? rawBody.length.toString() : '0'
      },
      input: rawBody || undefined
    }
  );

  const { headers, body } = parseCgiOutput(stdout);

  for (const [key, value] of Object.entries(headers)) {
    if (key === 'content-length') continue;
    res.setHeader(key, value);
  }

  if (!headers['content-type']) {
    res.type('text/html');
  }

  return res.status(200).send(body);
}


  return res.status(415).send('Unsupported script type');
}

/* -------------------------------------------------
   CGI parsing
   ------------------------------------------------- */

function parseCgiOutput(output) {
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

function readShebang(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(200);
  const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);

  if (bytes < 2) return null;

  const firstLine = buf
    .toString('utf8', 0, bytes)
    .split(/\r?\n/, 1)[0];

  if (!firstLine.startsWith('#!')) return null;

  return firstLine.slice(2).trim();
}

function isNodeShebang(shebang) {
  if (!shebang) return false;
  return (
    shebang === '/usr/bin/node' ||
    shebang === '/usr/bin/env node' ||
    shebang.endsWith('/node')
  );
}
