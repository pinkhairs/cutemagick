import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import db from '../db/index.js';
import log from '../logs/index.js';
import { ensureRepo } from '../git/plumbing.js';
import { commitFileCreate } from '../git/porcelain.js';
import { SITES_ROOT } from '../../config/index.js';
import { ensureUploadsSymlink } from '../fs/uploadPersistence.js';

export async function ensureFirstSite() {
  if (process.env.AUTO_CREATE_FIRST_SITE !== '1') {
    return;
  }
  // Check if any sites exist
  const existingSites = db.prepare('SELECT COUNT(*) as count FROM sites').get();

  if (existingSites.count > 0) {
    log.info('[init:firstSite]', 'sites already exist, skipping');
    return;
  }

  const uuid = crypto.randomUUID();
  const now = new Date().toISOString();
  const name = 'My Website';
  const directory = 'my-website';
  const sitePath = path.join(SITES_ROOT, directory);

  log.info('[init:firstSite]', { uuid, name, directory });

  try {
    // Insert site into database first (required for git operations)
    db.prepare(`
      INSERT INTO sites (
        uuid, name, icon, domain, directory,
        repository, branch, live_commit,
        created_at, last_viewed
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid,
      name,
      null, // icon
      null,
      directory,
      null, // repository
      null, // branch
      null, // live_commit - will be set after commit
      now,
      now
    );

    // Create the site directory
    await fs.mkdir(sitePath, { recursive: true });

    // Initialize git repo
    await ensureRepo(sitePath, 'main');

    // Ensure uploads directory symlink exists
    ensureUploadsSymlink(directory);

    // Create index.html
    const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Welcome to Cute Magick</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <h1>✨ Welcome to Cute Magick</h1>
  <p>This site exists, but is waiting to be changed.</p>
  <p>
    Edit this <code>index.html</code> file and bring this site online.
  </p>
  <p>
    <a href="https://cutemagick.com/docs/getting-started">
      Read the docs →
    </a>
  </p>
</body>
</html>
`;

    const indexPath = path.join(sitePath, 'index.html');
    await fs.writeFile(indexPath, indexHtml, 'utf8');

    // Commit the file
    const head = await commitFileCreate({
      siteId: uuid,
      fullPath: indexPath,
      message: 'Initial commit'
    });

    // Update live_commit to HEAD (publish the site)
    db.prepare(`
      UPDATE sites
      SET live_commit = ?
      WHERE uuid = ?
    `).run(head, uuid);

    log.info('[init:firstSite]', 'first site created and published', { uuid, head });
  } catch (err) {
    log.error('[init:firstSite] failed', { err: err.message });
    // Clean up on failure
    await fs.rm(sitePath, { recursive: true, force: true }).catch(() => {});
    db.prepare('DELETE FROM sites WHERE uuid = ?').run(uuid);
    throw err;
  }
}
