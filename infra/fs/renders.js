import fs from 'fs';
import path from 'path';
import { SITES_ROOT, RENDERS_ROOT } from './roots.js';
import { addDetachedWorktree } from '../git/index.js';

export function renderPath(site, commit) {
  return path.join(RENDERS_ROOT, site, commit);
}

export async function ensureRender({ site, commit }) {
  const repoDir = path.join(SITES_ROOT, site);
  const siteRenderRoot = path.join(RENDERS_ROOT, site);
  const renderDir = renderPath(site, commit);

  if (!fs.existsSync(repoDir)) {
    throw new Error(`Site repo does not exist: ${site}`);
  }

  fs.mkdirSync(siteRenderRoot, { recursive: true });

  // Already materialized → reuse
  if (fs.existsSync(renderDir)) {
    return renderDir;
  }

  try {
    await addDetachedWorktree({
      repoDir,
      targetDir: renderDir,
      commit
    });
    console.log(
    '[ensureRender] renderDir contents:',
      fs.readdirSync(renderDir)
    );
  } catch (err) {
    // clean partial materialization
    try {
      fs.rmSync(renderDir, { recursive: true, force: true });
    } catch {}

    throw new Error(
      `Failed to materialize render ${site}@${commit}: ${err.message}`
    );
  }

  return renderDir;
}
