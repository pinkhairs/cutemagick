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
      'index.sh'
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
     Static files
     --------------------------------- */

  const EXECUTABLE_INDEXES = new Set([
    'index.php',
    'index.js',
    'index.py',
    'index.sh',
  ]);

  const isExecutable =
    EXECUTABLE_INDEXES.has(path.basename(effectivePath));

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
    const { stdout } = await executeRuntime({
      lang: 'php',
      cwd: runtimeDir,
      scriptPath,
      env: {
        REQUEST_METHOD: req.method,
        REQUEST_URI: req.originalUrl,
        QUERY_STRING: req.originalUrl.split('?')[1] || '',
        CONTENT_TYPE: req.headers['content-type'] || '',
        CONTENT_LENGTH: req.headers['content-length'] || ''
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

    return res.send(body);
  }

  if (ext === '.js') {
    // Node execution is handled by executeRuntime, not runProcess
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

    res.type('text/html');
    return res.send(stdout);
  }

  if (ext === '.py') {
    const { stdout } = await runProcess({
      lang: 'python',
      cwd: runtimeDir,
      scriptPath
    });

    res.type('text/plain');
    return res.send(stdout);
  }

  if (ext === '.sh') {
    const stat = fs.statSync(path.join(runtimeDir, scriptPath));
    if (!(stat.mode & 0o111)) {
      return res.status(403).send('Script not executable');
    }

    const { stdout } = await runProcess({
      lang: 'bash',
      cwd: runtimeDir,
      scriptPath
    });

    res.type('text/plain');
    return res.send(stdout);
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
