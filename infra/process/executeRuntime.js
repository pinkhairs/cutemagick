// IMPORTANT: never pass full process.env
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import log from '../logs/index.js';
import { SITES_ROOT, RENDERS_ROOT, DEPENDENCIES_ROOT } from '../../config/index.js';
import { persistNewDatabaseFiles } from '../fs/dbPersistence.js';
import { loadEnvVars } from '../fs/envPersistence.js';
import { persistNewUploadFiles } from '../fs/uploadPersistence.js';
import { ensureNodeModules } from '../fs/nodeModules.js';

/* ----------------------------
   Policy / Configuration
----------------------------- */

export const DEFAULT_TIMEOUT_MS = 3000;
export const MAX_OUTPUT_BYTES = 1024 * 100;


export const EXEC_ROOTS = [
  SITES_ROOT,
  RENDERS_ROOT,
];

export const RUNTIMES = {
  php: {
    env: 'RUNTIME_PHP',
    cmd: 'php-cgi',
    args: ['-d', 'cgi.force_redirect=0'],
  },
  node: {
    env: 'RUNTIME_NODE',
    cmd: 'node',
    args: [],
  },
  python: {
    env: 'RUNTIME_PYTHON',
    cmd: 'python3',
    args: [],
  },
  bash: {
    env: 'RUNTIME_BASH',
    cmd: 'bash',
    args: [],
  },
  lua: {
    env: 'RUNTIME_LUA',
    cmd: 'lua',
    args: [],
  }
};

/* ----------------------------
   Guards
----------------------------- */

function isRuntimeEnabled(envKey) {
  return process.env[envKey] === '1';
}

function assertExecutablePathAllowed(target) {
  const realTarget = fs.realpathSync(target);

  for (const root of EXEC_ROOTS) {
    const realRoot = fs.realpathSync(root);
    const rel = path.relative(realRoot, realTarget);

    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return;
    }
  }

  throw new Error(`Path escapes execution roots: ${target}`);
}

/**
 * Extract site name from a cwd path (either working dir or render dir)
 * Returns null if not in a valid site directory
 */
function extractSiteFromPath(cwdPath) {
  const realSitesRoot = fs.realpathSync(SITES_ROOT);
  const realRendersRoot = fs.realpathSync(RENDERS_ROOT);
  const realCwd = fs.realpathSync(cwdPath);

  // Check if in SITES_ROOT
  let rel = path.relative(realSitesRoot, realCwd);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    return rel.split(path.sep)[0];
  }

  // Check if in RENDERS_ROOT
  rel = path.relative(realRendersRoot, realCwd);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    return rel.split(path.sep)[0];
  }

  return null;
}

/**
 * Extract site and commit from a render path
 * Returns { site, commit } or null if not a render path
 */
function extractRenderInfo(cwdPath) {
  try {
    const realRendersRoot = fs.realpathSync(RENDERS_ROOT);
    const realCwd = fs.realpathSync(cwdPath);

    const rel = path.relative(realRendersRoot, realCwd);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return null;
    }

    const parts = rel.split(path.sep);
    if (parts.length < 2) {
      return null;
    }

    return {
      site: parts[0],
      commit: parts[1],
    };
  } catch {
    return null;
  }
}

export async function executeRuntime({
  lang,
  scriptPath,
  cwd,
  env = {},
  body = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const rt = RUNTIMES[lang];
  if (!rt) {
    throw new Error(`Unknown runtime: ${lang}`);
  }

  if (!isRuntimeEnabled(rt.env)) {
    log.debug('[runtime]', `Blocked disabled runtime: ${lang}`);
    throw new Error(`Runtime disabled: ${lang}`);
  }

  if (!cwd) {
    throw new Error('cwd is required');
  }

  // Normalize and validate cwd
  const resolvedCwd = path.resolve(cwd);
  assertExecutablePathAllowed(resolvedCwd);

  if (!fs.existsSync(resolvedCwd)) {
    throw new Error(`Invalid cwd: ${resolvedCwd}`);
  }

  // Normalize scriptPath (you already handle object forms correctly)
  if (typeof scriptPath !== 'string') {
    if (scriptPath && typeof scriptPath === 'object') {
      const maybe =
        scriptPath.scriptPath ??
        scriptPath.path ??
        scriptPath.file ??
        scriptPath.name;

      if (typeof maybe === 'string') {
        scriptPath = maybe;
      } else {
        log.debug('[runtime]', 'Invalid scriptPath (object)', { scriptPath });
        throw new Error('scriptPath must be a string');
      }
    } else {
      log.debug('[runtime]', 'Invalid scriptPath (non-string)', { scriptPath });
      throw new Error('scriptPath must be a string');
    }
  }

  const resolvedScript = path.resolve(resolvedCwd, scriptPath);
  assertExecutablePathAllowed(resolvedScript);

  if (!fs.existsSync(resolvedScript)) {
    throw new Error(`Script not found: ${resolvedScript}`);
  }

  const command = rt.cmd ?? resolvedScript;
  const args = rt.cmd ? [...rt.args, resolvedScript] : [];

  // Load .env variables for this site
  const site = extractSiteFromPath(resolvedCwd);
  const siteEnvVars = site ? loadEnvVars(site) : {};

  // Minimal safe env - .env vars override defaults
  let childEnv = {
    PATH: process.env.PATH,
    HOME: resolvedCwd,
    ...env,
    ...siteEnvVars,
  };

// --- NODE.JS (with npm modules support) ---
if (lang === 'node') {
  const renderInfo = extractRenderInfo(resolvedCwd);

  if (renderInfo) {
    try {
      await ensureNodeModules({
        site: renderInfo.site,
        commit: renderInfo.commit,
        renderDir: resolvedCwd,
      });

      // Set NODE_PATH to allow require() to find modules
      const nodeModulesPath = path.join(DEPENDENCIES_ROOT, renderInfo.site, renderInfo.commit, 'node_modules');
      childEnv.NODE_PATH = nodeModulesPath;
    } catch (err) {
      log.error('[runtime:node]', 'npm install failed', {
        site: renderInfo.site,
        commit: renderInfo.commit,
        error: err.message,
        stderr: err.stderr,
      });
      throw new Error(`Failed to install dependencies: ${err.message}`);
    }
  }
}

// --- PHP CGI (HARDENED) ---
if (lang === 'php') {
  childEnv = {
    ...childEnv,

    GATEWAY_INTERFACE: 'CGI/1.1',
    SERVER_PROTOCOL: 'HTTP/1.1',
    SERVER_SOFTWARE: 'cutemagick-runtime',

    REDIRECT_STATUS: '200',

    SCRIPT_FILENAME: resolvedScript,
    SCRIPT_NAME: '/' + path.basename(resolvedScript),
    DOCUMENT_ROOT: resolvedCwd,

    REQUEST_METHOD: childEnv.REQUEST_METHOD || 'GET',
    REQUEST_URI: childEnv.REQUEST_URI || '/',
    QUERY_STRING: childEnv.QUERY_STRING || '',

    CONTENT_TYPE: childEnv.CONTENT_TYPE || '',
    CONTENT_LENGTH: childEnv.CONTENT_LENGTH || '0',
  };
}


  log.debug('[runtime]', `Executing ${lang}`, {
    cwd: resolvedCwd,
    script: resolvedScript,
  });

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: resolvedCwd,
      env: childEnv,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'], // <-- allow POST body
    });

    if (body && body.length > 0) {
      child.stdin.write(body);
    }
    child.stdin.end();

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      stdout += d;
      if (stdout.length > MAX_OUTPUT_BYTES) child.kill('SIGKILL');
    });

    child.stderr.on('data', (d) => {
      stderr += d;
      if (stderr.length > MAX_OUTPUT_BYTES) child.kill('SIGKILL');
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (killed) {
        log.debug('[runtime]', 'Process killed (timeout or output limit)');
        return reject(new Error('Process timeout'));
      }

      // Post-execution: persist any new database and upload files created during execution
      try {
        const site = extractSiteFromPath(resolvedCwd);
        if (site && resolvedCwd.includes(RENDERS_ROOT)) {
          persistNewDatabaseFiles({ site, renderDir: resolvedCwd });
          persistNewUploadFiles({ site, sourceDir: resolvedCwd });
        }
      } catch (err) {
        log.error('[runtime:persistFiles]', {
          cwd: resolvedCwd,
          error: err.message
        });
      }

      resolve({ code, stdout, stderr });
    });

    child.on('error', reject);
  });
}
