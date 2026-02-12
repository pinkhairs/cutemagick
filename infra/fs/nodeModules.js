import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { DEPENDENCIES_ROOT, NPM_CACHE_ROOT } from './roots.js';

const NPM_INSTALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const LOCK_ACQUIRE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (wait for other install)
const LOCK_CHECK_INTERVAL_MS = 500;

/**
 * Ensure node_modules are installed for a specific site+commit render.
 * Blocks until installation completes or fails.
 *
 * @param {string} site - Site directory name
 * @param {string} commit - Git commit hash
 * @param {string} renderDir - Path to render directory (contains package.json)
 * @throws {Error} If npm install fails or times out
 */
export async function ensureNodeModules({ site, commit, renderDir }) {
  const dependenciesDir = path.join(DEPENDENCIES_ROOT, site, commit);
  const nodeModulesPath = path.join(dependenciesDir, 'node_modules');
  const lockFile = path.join(dependenciesDir, '.lock');
  const packageJsonPath = path.join(renderDir, 'package.json');

  console.log('[nodeModules]', 'Checking dependencies', { site, commit });

  // Already installed → return immediately
  if (fs.existsSync(nodeModulesPath)) {
    console.log('[nodeModules]', 'Dependencies already installed');
    return nodeModulesPath;
  }

  // No package.json → nothing to install
  if (!fs.existsSync(packageJsonPath)) {
    console.log('[nodeModules]', 'No package.json found, skipping install');
    return null;
  }

  console.log('[nodeModules]', 'Acquiring lock for npm install...');

  // Acquire lock (wait if another process is installing)
  await acquireLock(lockFile);

  try {
    console.log('[nodeModules]', 'Lock acquired, checking if already installed...');

    // Double-check after acquiring lock (another process might have installed)
    if (fs.existsSync(nodeModulesPath)) {
      console.log('[nodeModules]', 'Another process installed while waiting, skipping');
      return nodeModulesPath;
    }

    console.log('[nodeModules]', 'Starting npm install...', { dependenciesDir });

    // Create target directory
    fs.mkdirSync(dependenciesDir, { recursive: true });

    // Copy package.json and package-lock.json to install directory
    fs.copyFileSync(packageJsonPath, path.join(dependenciesDir, 'package.json'));

    const packageLockPath = path.join(renderDir, 'package-lock.json');
    if (fs.existsSync(packageLockPath)) {
      fs.copyFileSync(packageLockPath, path.join(dependenciesDir, 'package-lock.json'));
      console.log('[nodeModules]', 'Using package-lock.json');
    }

    // Ensure npm cache directory exists
    fs.mkdirSync(NPM_CACHE_ROOT, { recursive: true });

    // Run npm install
    await runNpmInstall(dependenciesDir);

    console.log('[nodeModules]', '✓ npm install completed successfully');
    return nodeModulesPath;
  } catch (err) {
    console.error('[nodeModules]', '✗ npm install failed:', err.message);
    throw err;
  } finally {
    releaseLock(lockFile);
    console.log('[nodeModules]', 'Lock released');
  }
}

/**
 * Acquire a file lock, waiting if necessary
 */
async function acquireLock(lockFile) {
  const lockDir = path.dirname(lockFile);
  fs.mkdirSync(lockDir, { recursive: true });

  const startTime = Date.now();

  while (true) {
    try {
      // Try to create lock file exclusively
      fs.writeFileSync(lockFile, process.pid.toString(), { flag: 'wx' });
      return; // Lock acquired
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }

      // Lock exists - check if it's stale
      try {
        const lockContent = fs.readFileSync(lockFile, 'utf8');
        const lockPid = parseInt(lockContent, 10);

        // Check if process is still running
        try {
          process.kill(lockPid, 0); // Signal 0 checks if process exists
        } catch {
          // Process doesn't exist - lock is stale, remove it
          fs.unlinkSync(lockFile);
          continue;
        }
      } catch {
        // Can't read lock file - try again
      }

      // Check timeout
      if (Date.now() - startTime > LOCK_ACQUIRE_TIMEOUT_MS) {
        throw new Error('Timeout waiting for npm install lock');
      }

      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, LOCK_CHECK_INTERVAL_MS));
    }
  }
}

/**
 * Release a file lock
 */
function releaseLock(lockFile) {
  try {
    fs.unlinkSync(lockFile);
  } catch {
    // Lock file might already be gone - that's fine
  }
}

/**
 * Run npm install with timeout
 */
function runNpmInstall(cwd) {
  console.log('[nodeModules]', 'Running npm install in:', cwd);

  return new Promise((resolve, reject) => {
    const args = [
      'install',
      '--production',
      '--no-audit',
      '--no-fund',
      `--cache=${NPM_CACHE_ROOT}`,
    ];

    console.log('[nodeModules]', 'npm command:', 'npm', args.join(' '));

    const child = spawn('npm', args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, NPM_INSTALL_TIMEOUT_MS);

    child.stdout.on('data', (d) => {
      const chunk = d.toString();
      stdout += chunk;
      console.log('[npm]', chunk.trim());
    });

    child.stderr.on('data', (d) => {
      const chunk = d.toString();
      stderr += chunk;
      console.log('[npm:err]', chunk.trim());
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (killed) {
        console.error('[nodeModules]', 'npm install killed (timeout)');
        return reject(new Error('npm install timeout (5 minutes)'));
      }

      if (code !== 0) {
        console.error('[nodeModules]', `npm install failed with code ${code}`);
        console.error('[nodeModules]', 'stdout:', stdout);
        console.error('[nodeModules]', 'stderr:', stderr);
        const error = new Error(`npm install failed with code ${code}`);
        error.stdout = stdout;
        error.stderr = stderr;
        return reject(error);
      }

      console.log('[nodeModules]', 'npm install exit code 0 (success)');
      resolve();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      console.error('[nodeModules]', 'npm spawn error:', err);
      reject(err);
    });
  });
}
