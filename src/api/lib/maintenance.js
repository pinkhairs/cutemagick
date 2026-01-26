import fs from 'fs';
import path from 'path';
import db from '../../database.js';
import { cleanupOldPreviews } from './siteRenderer.js';
import { pruneGitWorktrees } from './gitService.js';

const SITES_ROOT = '/app/sites';
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

async function runMaintenance() {
  console.log('[maintenance] starting daily cleanup');

  try {
    cleanupOldPreviews();
  } catch (err) {
    console.warn('[maintenance] preview cleanup skipped:', err?.message);
  }

  const sites = db
    .prepare(`SELECT directory FROM sites`)
    .all();

  for (const site of sites) {
    const repoDir = path.join(SITES_ROOT, site.directory);
    if (!fs.existsSync(repoDir)) continue;

    try {
      await pruneGitWorktrees(repoDir);
    } catch (err) {
      console.warn(
        '[maintenance] git cleanup skipped for:',
        site.directory,
        err?.message
      );
    }
  }

  console.log('[maintenance] cleanup complete');
}


export function startMaintenanceScheduler() {
  // 🔁 Run once on startup
  runMaintenance();

  // ⏱️ Then once per day
  setInterval(runMaintenance, ONE_DAY_MS);
}
