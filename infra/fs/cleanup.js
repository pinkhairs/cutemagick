import fs from 'fs';
import path from 'path';
import { RENDERS_ROOT, DEPENDENCIES_ROOT } from './roots.js';

const RENDER_TTL_MS = 1000 * 60 * 60 * 24;

export function cleanupOldRenders() {
  if (!fs.existsSync(RENDERS_ROOT)) return;

  const now = Date.now();

  for (const site of fs.readdirSync(RENDERS_ROOT)) {
    const siteDir = path.join(RENDERS_ROOT, site);
    if (!fs.statSync(siteDir).isDirectory()) continue;

    for (const commit of fs.readdirSync(siteDir)) {
      const renderDir = path.join(siteDir, commit);

      try {
        const stat = fs.statSync(renderDir);
        if (now - stat.mtimeMs > RENDER_TTL_MS) {
          fs.rmSync(renderDir, { recursive: true, force: true });
        }
      } catch {}
    }
  }
}

export function cleanupOrphanedDependencies() {
  if (!fs.existsSync(DEPENDENCIES_ROOT)) return;

  for (const site of fs.readdirSync(DEPENDENCIES_ROOT)) {
    const siteDepsDir = path.join(DEPENDENCIES_ROOT, site);
    if (!fs.statSync(siteDepsDir).isDirectory()) continue;

    for (const commit of fs.readdirSync(siteDepsDir)) {
      const depsDir = path.join(siteDepsDir, commit);
      const renderDir = path.join(RENDERS_ROOT, site, commit);

      // If corresponding render doesn't exist, delete orphaned dependencies
      if (!fs.existsSync(renderDir)) {
        try {
          fs.rmSync(depsDir, { recursive: true, force: true });
        } catch {}
      }
    }

    // Clean up empty site directories
    try {
      const remaining = fs.readdirSync(siteDepsDir);
      if (remaining.length === 0) {
        fs.rmdirSync(siteDepsDir);
      }
    } catch {}
  }
}
