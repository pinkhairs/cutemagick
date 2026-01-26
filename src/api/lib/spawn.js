// IMPORTANT: never pass full process.env
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const RUNTIMES = {
  php: {
    env: 'RUNTIME_PHP',
    cmd: '/usr/bin/php-cgi',
    args: [],
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
  ruby: {
    env: 'RUNTIME_RUBY',
    cmd: '/usr/bin/ruby',
    args: [],
  },
  bash: {
    env: 'RUNTIME_BASH',
    cmd: '/bin/sh',
    args: [],
  },
  go: {
    env: 'RUNTIME_GO',
    cmd: null, // compiled binary
    args: [],
  },
  rust: {
    env: 'RUNTIME_RUST',
    cmd: null, // compiled binary
    args: [],
  },
};
const EXEC_ROOTS = [
  '/app/sites',
  '/app/.live',
  '/app/.previews'
];

function isEnabled(envKey) {
  return process.env[envKey] === '1';
}

function assertInsideAllowedRoots(target) {
  const realTarget = fs.realpathSync(target);

  for (const root of EXEC_ROOTS) {
    const realRoot = fs.realpathSync(root);
    const rel = path.relative(realRoot, realTarget);

    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return; // ✅ allowed
    }
  }

  throw new Error(`Path escapes execution roots: ${target}`);
}

export function runProcess({
  lang,
  scriptPath,
  cwd,
  env = {},
  timeoutMs = 3000,
}) {
  const rt = RUNTIMES[lang];
  if (!rt) {
    throw new Error(`Unknown runtime: ${lang}`);
  }

  if (!isEnabled(rt.env)) {
    throw new Error(`Runtime disabled: ${lang}`);
  }

  if (!cwd) {
    throw new Error('cwd is required');
  }

  // 🔒 Resolve and validate cwd
  const resolvedCwd = path.resolve(cwd);
  assertInsideAllowedRoots(resolvedCwd);

  if (!fs.existsSync(resolvedCwd)) {
    throw new Error(`Invalid cwd: ${resolvedCwd}`);
  }

  // 🔒 Resolve and validate script path
  const resolvedScript = path.resolve(resolvedCwd, scriptPath);
  assertInsideAllowedRoots(resolvedScript);

  if (!fs.existsSync(resolvedScript)) {
    throw new Error(`Script not found: ${resolvedScript}`);
  }

  const command = rt.cmd ?? resolvedScript;
  const args = rt.cmd ? [...rt.args, resolvedScript] : [];

  // 🧠 Base env (minimal, safe)
  let childEnv = {
    PATH: process.env.PATH,
    HOME: resolvedCwd,
    ...env,
  };

  // 🐘 PHP CGI requirements
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
      if (stdout.length > 1024 * 100) child.kill('SIGKILL');
    });

    child.stderr.on('data', (d) => {
      stderr += d;
      if (stderr.length > 1024 * 100) child.kill('SIGKILL');
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (killed) {
        return reject(new Error('Process timeout'));
      }

      resolve({ code, stdout, stderr });
    });

    child.on('error', reject);
  });
}

