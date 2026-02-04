// Database file persistence via symlinks
import fs from 'fs';
import path from 'path';
import { SITES_ROOT, LIVE_DATA_ROOT } from '../../config/index.js';
import log from '../logs/index.js';

// Patterns for database files to persist
export const DB_FILE_PATTERNS = [
  /\.db$/i,
  /\.db-shm$/i,
  /\.db-wal$/i,
  /\.db-journal$/i,
  /\.sqlite$/i,
  /\.sqlite3$/i,
  /\.sqlite-shm$/i,
  /\.sqlite-wal$/i,
  /\.sqlite-journal$/i,
  /\.duckdb$/i,
  /\.duckdb\.wal$/i,
  /\.mdb$/i,
  /\.accdb$/i,
];

/**
 * Check if a filename matches database file patterns
 */
export function isDatabaseFile(filename) {
  return DB_FILE_PATTERNS.some(pattern => pattern.test(filename));
}

/**
 * Recursively find all database files in a directory
 */
export function findDatabaseFiles(dir, baseDir = dir) {
  const results = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip .git and node_modules
      if (entry.name === '.git' || entry.name === 'node_modules') {
        continue;
      }

      if (entry.isDirectory()) {
        results.push(...findDatabaseFiles(fullPath, baseDir));
      } else if (entry.isFile() && isDatabaseFile(entry.name)) {
        const relativePath = path.relative(baseDir, fullPath);
        results.push(relativePath);
      }
    }
  } catch (err) {
    // Directory may not exist or be readable
    log.debug('[dbPersistence:findDatabaseFiles]', {
      dir,
      error: err.message
    });
  }

  return results;
}

/**
 * Create symlinks in render directory for all database files in live data directory
 * @param {string} site - Site slug/directory name
 * @param {string} renderDir - Full path to render directory
 */
export function symlinkDatabaseFiles({ site, renderDir }) {
  const liveDataDir = path.join(LIVE_DATA_ROOT, site);

  // Ensure live data directory exists
  fs.mkdirSync(liveDataDir, { recursive: true });

  const dbFiles = findDatabaseFiles(liveDataDir);

  for (const relativePath of dbFiles) {
    const sourcePath = path.join(liveDataDir, relativePath);
    const targetPath = path.join(renderDir, relativePath);

    // Ensure parent directory exists in render
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Skip if symlink already exists and points to correct location
    try {
      if (fs.existsSync(targetPath)) {
        const stats = fs.lstatSync(targetPath);
        if (stats.isSymbolicLink()) {
          const existing = fs.readlinkSync(targetPath);
          if (existing === sourcePath) {
            continue; // Already correct
          }
          // Remove incorrect symlink
          fs.unlinkSync(targetPath);
        } else {
          // Real file exists (e.g., from git worktree materialization)
          // Remove it - live data directory is source of truth for renders
          log.info('[dbPersistence:symlinkDatabaseFiles]', {
            site,
            relativePath,
            message: 'Removing render file (live data directory is source of truth)'
          });
          fs.unlinkSync(targetPath);
        }
      }

      // Create symlink
      fs.symlinkSync(sourcePath, targetPath);
      log.debug('[dbPersistence:symlinkDatabaseFiles]', {
        site,
        relativePath,
        source: sourcePath,
        target: targetPath
      });
    } catch (err) {
      log.error('[dbPersistence:symlinkDatabaseFiles]', {
        site,
        relativePath,
        error: err.message
      });
    }
  }
}

/**
 * Post-execution: Move any new database files from render to live data directory
 * and replace with symlinks
 * @param {string} site - Site slug/directory name
 * @param {string} renderDir - Full path to render directory
 */
export function persistNewDatabaseFiles({ site, renderDir }) {
  const liveDataDir = path.join(LIVE_DATA_ROOT, site);

  if (!fs.existsSync(renderDir)) {
    return;
  }

  // Ensure live data directory exists
  fs.mkdirSync(liveDataDir, { recursive: true });

  const renderDbFiles = findDatabaseFiles(renderDir);

  for (const relativePath of renderDbFiles) {
    const renderPath = path.join(renderDir, relativePath);
    const livePath = path.join(liveDataDir, relativePath);

    try {
      const stats = fs.lstatSync(renderPath);

      // If it's already a symlink, nothing to do
      if (stats.isSymbolicLink()) {
        continue;
      }

      // It's a real file - this is a new database created during execution
      log.info('[dbPersistence:persistNewDatabaseFiles]', {
        site,
        relativePath,
        message: 'Moving new database file to live data directory'
      });

      // Ensure parent directory exists in live data directory
      const liveParent = path.dirname(livePath);
      if (!fs.existsSync(liveParent)) {
        fs.mkdirSync(liveParent, { recursive: true });
      }

      // If file exists in live data directory, remove it first (overwrite with new version)
      if (fs.existsSync(livePath)) {
        fs.unlinkSync(livePath);
      }

      // Move file to live data directory
      fs.renameSync(renderPath, livePath);

      // Create symlink in render directory
      fs.symlinkSync(livePath, renderPath);

      log.info('[dbPersistence:persistNewDatabaseFiles]', {
        site,
        relativePath,
        moved: true
      });
    } catch (err) {
      log.error('[dbPersistence:persistNewDatabaseFiles]', {
        site,
        relativePath,
        error: err.message
      });
    }
  }
}
