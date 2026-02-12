// .env file persistence via symlinks
import fs from 'fs';
import path from 'path';
import { SITES_ROOT, SECRETS_ROOT } from '../../config/index.js';
import log from '../logs/index.js';

/**
 * Parse .env file contents into key-value object
 * Supports basic .env format: KEY=value
 */
export function parseEnvFile(content) {
  const env = {};
  const lines = content.split('\n');

  for (const line of lines) {
    // Skip empty lines and comments
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=value
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      env[key] = value;
    }
  }

  return env;
}

/**
 * Load environment variables from .env file
 * @param {string} site - Site slug/directory name
 * @returns {Object} Key-value pairs of environment variables
 */
export function loadEnvVars(site) {
  const envPath = path.join(SECRETS_ROOT, site, '.env');

  try {
    if (!fs.existsSync(envPath)) {
      return {};
    }

    const content = fs.readFileSync(envPath, 'utf8');
    return parseEnvFile(content);
  } catch (err) {
    log.error('[envPersistence:loadEnvVars]', {
      site,
      error: err.message
    });
    return {};
  }
}

/**
 * Ensure secrets directory exists for a site
 * Migrates any existing .env file from site directory to secrets directory
 * @param {string} site - Site slug/directory name
 */
export function ensureSecretsDirectory(site) {
  const siteDir = path.join(SITES_ROOT, site);
  const secretsDir = path.join(SECRETS_ROOT, site);
  const secretsEnvPath = path.join(secretsDir, '.env');
  const siteEnvPath = path.join(siteDir, '.env');

  try {
    // Ensure secrets directory exists
    fs.mkdirSync(secretsDir, { recursive: true });

    // Migrate existing .env from site directory if it exists
    if (fs.existsSync(siteEnvPath)) {
      const stats = fs.lstatSync(siteEnvPath);

      // If it's a real file (not a symlink), migrate it
      if (!stats.isSymbolicLink()) {
        if (!fs.existsSync(secretsEnvPath)) {
          // Move to secrets directory
          fs.renameSync(siteEnvPath, secretsEnvPath);
          log.info('[envPersistence:ensureSecretsDirectory]', {
            site,
            message: 'Migrated existing .env to secrets directory'
          });
        } else {
          // Secrets already has .env, remove duplicate from sites
          fs.unlinkSync(siteEnvPath);
          log.warn('[envPersistence:ensureSecretsDirectory]', {
            site,
            message: 'Removed duplicate .env from site directory'
          });
        }
      } else {
        // It's a symlink, remove it (we don't use symlinks anymore)
        fs.unlinkSync(siteEnvPath);
        log.info('[envPersistence:ensureSecretsDirectory]', {
          site,
          message: 'Removed legacy .env symlink from site directory'
        });
      }
    }

    log.debug('[envPersistence:ensureSecretsDirectory]', {
      site,
      secretsDir
    });
  } catch (err) {
    log.error('[envPersistence:ensureSecretsDirectory]', {
      site,
      error: err.message
    });
  }
}

/**
 * Create symlink for .env file in render/working directory
 * @param {string} site - Site slug/directory name
 * @param {string} targetDir - Full path to render or working directory
 */
export function symlinkEnvFile({ site, targetDir }) {
  const secretsEnvPath = path.join(SECRETS_ROOT, site, '.env');
  const targetEnvPath = path.join(targetDir, '.env');

  // Only symlink if .env exists in secrets directory
  if (!fs.existsSync(secretsEnvPath)) {
    return;
  }

  try {
    // Remove existing file/symlink if present
    if (fs.existsSync(targetEnvPath)) {
      const stats = fs.lstatSync(targetEnvPath);
      if (stats.isSymbolicLink()) {
        const existing = fs.readlinkSync(targetEnvPath);
        if (existing === secretsEnvPath) {
          return; // Already correct
        }
      }
      fs.unlinkSync(targetEnvPath);
    }

    // Create symlink
    fs.symlinkSync(secretsEnvPath, targetEnvPath);
    log.debug('[envPersistence:symlinkEnvFile]', {
      site,
      source: secretsEnvPath,
      target: targetEnvPath
    });
  } catch (err) {
    log.error('[envPersistence:symlinkEnvFile]', {
      site,
      error: err.message
    });
  }
}

/**
 * Post-execution: Move any new .env file from render/working to secrets directory
 * and replace with symlink
 * @param {string} site - Site slug/directory name
 * @param {string} sourceDir - Full path to render or working directory
 */
export function persistNewEnvFile({ site, sourceDir }) {
  const secretsDir = path.join(SECRETS_ROOT, site);
  const secretsEnvPath = path.join(secretsDir, '.env');
  const sourceEnvPath = path.join(sourceDir, '.env');

  if (!fs.existsSync(sourceEnvPath)) {
    return;
  }

  try {
    const stats = fs.lstatSync(sourceEnvPath);

    // If it's already a symlink, nothing to do
    if (stats.isSymbolicLink()) {
      return;
    }

    // It's a real file - this is a new .env created during execution
    log.info('[envPersistence:persistNewEnvFile]', {
      site,
      message: 'Moving new .env file to secrets directory'
    });

    // Ensure secrets directory exists
    fs.mkdirSync(secretsDir, { recursive: true });

    // If .env exists in secrets directory, back it up
    if (fs.existsSync(secretsEnvPath)) {
      const backupPath = secretsEnvPath + '.backup-' + Date.now();
      fs.renameSync(secretsEnvPath, backupPath);
      log.info('[envPersistence:persistNewEnvFile]', {
        site,
        message: 'Backed up existing .env',
        backupPath
      });
    }

    // Move file to secrets directory
    fs.renameSync(sourceEnvPath, secretsEnvPath);

    // Create symlink in source directory
    fs.symlinkSync(secretsEnvPath, sourceEnvPath);

    log.info('[envPersistence:persistNewEnvFile]', {
      site,
      moved: true
    });
  } catch (err) {
    log.error('[envPersistence:persistNewEnvFile]', {
      site,
      error: err.message
    });
  }
}
