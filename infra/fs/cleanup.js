import fs from 'fs';
import path from 'path';
import { RENDERS_ROOT } from './roots.js';

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
