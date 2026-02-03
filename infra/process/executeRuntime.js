// IMPORTANT: never pass full process.env
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import log from '../logs/index.js';
import { SITES_ROOT, RENDERS_ROOT } from '../../config/index.js';

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
    cmd: 'php',
    args: ['-d', 'cgi.force_redirect=0'],
  },
  node: {
    env: 'RUNTIME_NODE',
    cmd: '/usr/local/bin/node',
    args: [],
  },
  python: {
    env: 'RUNTIME_PYTHON',
    cmd: '/usr/bin/python3',
    args: [],
  },
  bash: {
    env: 'RUNTIME_BASH',
    cmd: '/bin/bash',
    args: [],
  },
  lua: {
    env: 'RUNTIME_LUA',
    cmd: '/usr/bin/lua',
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

export async function executeRuntime({
  lang,
  scriptPath,
  cwd,
  env = {},
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

  // Minimal safe env
  let childEnv = {
    PATH: process.env.PATH,
    HOME: resolvedCwd,
    ...env,
  };

  // --- PHP CGI (UNCHANGED) ---
  if (lang === 'php') {
    childEnv = {
      ...childEnv,
      REDIRECT_STATUS: '200',
      SCRIPT_FILENAME: resolvedScript,
      SCRIPT_NAME: '/' + path.basename(resolvedScript),
      REQUEST_METHOD: childEnv.REQUEST_METHOD || 'GET',
      CONTENT_TYPE: childEnv.CONTENT_TYPE || 'text/html',
      QUERY_STRING: childEnv.QUERY_STRING || '',
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
      stdio: ['ignore', 'pipe', 'pipe'],
    });

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

      resolve({ code, stdout, stderr });
    });

    child.on('error', reject);
  });
}
