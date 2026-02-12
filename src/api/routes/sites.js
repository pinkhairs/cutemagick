// src/api/routes/admin/sites.js
import express from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import db from '../../../infra/db/index.js';
import log from '../../../infra/logs/index.js';

import {
  assertSSHReachable,
  pullFromRemote,
  syncToRemote
} from '../../../infra/git/sync.js';

import {
  restoreCommitAsNew
} from '../../../infra/git/porcelain.js';

import {
  generateRandomSubdomain,
  nextAvailableDirectorySuffix,
  slugify,
} from '../../../infra/siteNaming.js';

import { cloneRepo } from '../../../infra/git/sync.js';
import { ensureRepo } from '../../../infra/git/plumbing.js';
import { commitFileCreate } from '../../../infra/git/porcelain.js';
import { SITES_ROOT } from '../../../config/index.js';

const router = express.Router();


function getEnvPath(siteId) {
  const site = db.prepare(`
    SELECT directory
    FROM sites
    WHERE uuid = ?
  `).get(siteId);
    
    if (!site) {
      const err = new Error('Site not found');
      err.status = 404;
      throw err;
    }
    
    return path.join(SITES_ROOT, site.directory, '.env');
  }
  
  function serializeEnv(rows) {
    return rows
    .map(({ key, value }) => `${key}=${value ?? ''}`)
    .join('\n') + '\n';
  }
  
  
  router.get('/archive', (req, res) => {
    const sites = db.prepare(`
    SELECT
      uuid,
      name,
      directory
    FROM sites
    WHERE status = 'archived'
    ORDER BY name ASC
  `).all();
      
      res.json(sites);
    });
    /* -------------------------------------------------
    Create site
    -------------------------------------------------- */
    router.post('/', express.urlencoded({ extended: false }), async (req, res) => {
      let sitePath;
      
      try {
        const input = req.body.nameOrUrl?.trim();
        if (!input) return res.sendStatus(400);
        
        const isGitRepo =
        /^(git@|https?:\/\/).+(\.git)?$/.test(input);
        
        const uuid = crypto.randomUUID();
        const now = new Date().toISOString();
        
        const name = isGitRepo
        ? path.basename(input, '.git')
        : input;
        
        const slug = slugify(name);
        const suffix = await nextAvailableDirectorySuffix(SITES_ROOT, slug);
        const directory = `${slug}${suffix}`;
        sitePath = path.join(SITES_ROOT, directory);
        
        log.info('[sites:create]', { uuid, name, isGitRepo });
        
        let liveCommit = null;
        let repository = null;
        let branch = null;
        
        await fs.mkdir(sitePath, { recursive: true });
        
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
          null,
          null,
          directory,
          repository,
          branch,
          liveCommit,
          now,
          now
        );
        
        if (isGitRepo) {
          await assertSSHReachable(input);
          const { head } = await cloneRepo({ sitePath, repository: input });
          liveCommit = head;
          repository = input;
          branch = 'main';

          db.prepare(`
          UPDATE sites
          SET repository = ?, branch = ?, live_commit = ?
          WHERE uuid = ?
        `).run(repository, branch, liveCommit, uuid);
        } else {
            await ensureRepo(sitePath, 'main');
            const indexPath = path.join(sitePath, 'index.html');
            await fs.writeFile(indexPath, `<!DOCTYPE html>
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
`);
              liveCommit = await commitFileCreate({ siteId: uuid, fullPath: indexPath });
              db.prepare(`
              UPDATE sites
              SET live_commit = ?
              WHERE uuid = ?
            `).run(liveCommit, uuid)
            }
            res.set('HX-Trigger', 'refreshSites').sendStatus(204);
            
          } catch (err) {
            log.error('[sites:create] failed', {
              err: err.message,
              stack: err.stack
            });
            
            db.prepare(`
          DELETE FROM sites
          WHERE uuid = ?
        `).run(uuid);
              
              if (sitePath) {
                await fs.rm(sitePath, { recursive: true, force: true }).catch(() => {});
              }
              res.status(500).send('Site creation failed');
            }
          });
          
          
          /* -------------------------------------------------
          List sites (HTML fragment)
          -------------------------------------------------- */
          
          router.get('/', (req, res) => {
            const sites = db.prepare(`
    SELECT uuid, name, icon, domain, directory
    FROM sites
    WHERE status IS NULL
      OR status != 'archived'
    ORDER BY last_viewed DESC
  `).all();
              
              res.render('partials/sites', {
                layout: false,
                sites
              });
            });
            
            /* -------------------------------------------------
            Get site metadata (JSON)
            -------------------------------------------------- */
            
            router.get('/:siteId', (req, res) => {
              const site = db.prepare(`
    SELECT *
    FROM sites
    WHERE uuid = ?
  `).get(req.params.siteId);
                
                if (!site) return res.sendStatus(404);
                res.json(site);
              });
              
              /* -------------------------------------------------
              Update site identity
              -------------------------------------------------- */
              
              router.post('/:siteId/update', express.urlencoded({ extended: false }), (req, res) => {
                const { siteId } = req.params;
                const { name, icon } = req.body;
                
                db.prepare(`
    UPDATE sites
    SET name = ?, icon = ?
    WHERE uuid = ?
  `).run(name, icon, siteId);
                  
                  res
                  .set('HX-Trigger', 'refreshSites')
                  .sendStatus(204);
                });
                
                /* -------------------------------------------------
                Delete site
                -------------------------------------------------- */
                
                router.post('/:siteId/delete', async (req, res) => {
                  const site = db.prepare(`
    SELECT directory
    FROM sites
    WHERE uuid = ?
  `).get(req.params.siteId);
                    
                    if (!site) return res.sendStatus(404);
                    
                    await fs.rm(path.join(SITES_ROOT, site.directory), {
                      recursive: true,
                      force: true
                    });
                    
                    db.prepare(`DELETE FROM sites WHERE uuid = ?`)
                    .run(req.params.siteId);
                    
                    res
                    .set('HX-Trigger', 'refreshSites')
                    .sendStatus(204);
                  });
                  
                  router.post('/:siteId/pull', async (req, res) => {
                    const { siteId } = req.params;
                    
                    try {
                      const result = await pullFromRemote({ siteId });
                      
                      if (result.changed) {
                        res.set(
                          'HX-Trigger',
                          JSON.stringify({
                            [`siteCommit`]: {
                              commitHash: result.head,
                              previousHead: result.previousHead,
                              source: 'pull'
                            }
                          })
                        );
                      }
                      
                      res.sendStatus(204);
                    } catch (err) {
                      log.error('[site:pull]', { siteId, err: err.message });
                      res.status(409).send(err.message);
                    }
                  });
                  
                  
                  router.post('/:siteId/push', async (req, res) => {
                    const { siteId } = req.params;
                    
                    try {
                      const result = await syncToRemote({ siteId });
                      
                      res.set(
                        'HX-Trigger',
                        JSON.stringify({
                          [`site:${siteId}:sync`]: {
                            pushed: true,
                            head: result.head
                          }
                        })
                      );
                      
                      res.sendStatus(204);
                    } catch (err) {
                      log.error('[site:push]', { siteId, err: err.message });
                      res.status(409).send(err.message);
                    }
                  });
                  
                  router.post('/:siteId/make-live', async (req, res) => {
                    const { siteId } = req.params;
                    
                    try {
                      const head = await getHeadCommit({ siteId });
                      
                      if (!head) {
                        return res.status(400).send('Nothing to publish');
                      }
                      
                      db.prepare(`
      UPDATE sites
      SET live_commit = ?
      WHERE uuid = ?
    `).run(head, siteId);
                        
                        log.info('[site:make-live]', { siteId, head });
                        res.sendStatus(204);
                      } catch (err) {
                        log.error('[site:make-live]', { siteId, err: err.message });
                        res.status(500).send('Failed to make site live');
                      }
                    });
                    
                    router.post('/:siteId/restore', express.urlencoded({ extended: false }), async (req, res) => {
                      const { siteId } = req.params;
                      const { commit } = req.body;
                      
                      if (!commit) return res.sendStatus(400);
                      
                      try {
                        await restoreCommitAsNew({
                          siteId,
                          commit
                        });
                        
                        log.info('[site:restore]', { siteId, commit });
                        res.sendStatus(204);
                      } catch (err) {
                        log.error('[site:restore]', { siteId, commit, err: err.message });
                        res.status(409).send(err.message);
                      }
                    });
                    
                    router.get('/:siteId/secrets', async (req, res) => {
                      try {
                        const envPath = getEnvPath(req.params.siteId);
                        const text = await fs.readFile(envPath, 'utf8');
                        
                        const rows = text
                        .split('\n')
                        .map(line => {
                          if (!line || line.startsWith('#')) return null;
                          const idx = line.indexOf('=');
                          if (idx === -1) return null;
                          return {
                            key: line.slice(0, idx),
                            value: line.slice(idx + 1)
                          };
                        })
                        .filter(Boolean);
                        
                        res.json(rows);
                      } catch (err) {
                        if (err.code === 'ENOENT') {
                          // No .env yet is fine
                          return res.json([]);
                        }
                        
                        log.error('[secrets:read]', { err: err.message });
                        res.status(err.status || 500).send('Failed to read secrets');
                      }
                    });
                    
                    router.get('/:siteId/settings', (req, res) => {
                      const row = db.prepare(`
    SELECT
      name,
      domain,
      icon,
      repository,
      branch,
      username,
      password
    FROM sites
    WHERE uuid = ?
  `).get(req.params.siteId);
                        
                        if (!row) return res.sendStatus(404);
                        
                        res.json({
                          name: row.name,
                          customDomain: row.domain,
                          iconUrl: row.icon,
                          repository: row.repository,
                          branch: row.branch,
                          authUser: row.username,
                          authPass: row.password
                        });
                      });
                      
                      
                      router.post(
                        '/:siteId/settings',
                        express.json(),
                        async (req, res) => {

                          
                          const {
                            name,
                            customDomain,
                            iconUrl,
                            repository,
                            branch,
                            authUser,
                            authPass
                          } = req.body;
                          
                          // Strip protocol from customDomain
                          const cleanDomain = customDomain
                          ? customDomain.replace(/^https?:\/\//, '')
                          : null;
console.log('[settings:domain] loading current domain for site', req.params.siteId);

const site = db.prepare(`
  SELECT domain
  FROM sites
  WHERE uuid = ?
`).get(req.params.siteId);

if (!site) {
  console.log('[settings:domain] site not found');
  return res.sendStatus(404);
}

const oldDomain = site.domain;
console.log('[settings:domain] oldDomain =', oldDomain);
console.log('[settings:domain] newDomain =', cleanDomain);

if (
  hasDomainRegistryConfigured() &&
  cleanDomain &&
  cleanDomain !== oldDomain &&
  !cleanDomain.includes('/')
) {
  console.log('[settings:domain] registry check required');

  let registryResponse;
  try {
    registryResponse = await fetch(
      `${process.env.DOMAIN_REGISTRY_URL}/domains/check/${encodeURIComponent(cleanDomain)}`,
      {
        headers: {
          'X-Registry-Secret': process.env.REGISTRY_SECRET,
          'MAGICK_INSTANCE_ID': process.env.MAGICK_INSTANCE_ID
        }
      }
    );
  } catch (err) {
    console.log('[settings:domain] registry fetch FAILED', err.message);
    return res.status(503).json({
      error: 'domain_registry_unreachable'
    });
  }

  console.log('[settings:domain] registry status', registryResponse.status);

  let body = null;
  try {
    body = await registryResponse.json();
  } catch (err) {
    console.log('[settings:domain] registry JSON parse failed', err.message);
  }

  console.log('[settings:domain] registry body', body);
  // IMPORTANT: only explicit ok:true passes
  if (!registryResponse.ok || body?.ok !== true) {
    console.log('[settings:domain] domain rejected by registry');

    return res.status(409).json({
      error: 'domain_taken_or_not_verified'
    });
  }

    await fetch(`${process.env.DOMAIN_REGISTRY_URL}/domains/rename`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Registry-Secret': process.env.REGISTRY_SECRET,
      'magick-instance-id': process.env.MAGICK_INSTANCE_ID
    },
    body: JSON.stringify({
      from: oldDomain,
      to: cleanDomain
    })
  });
  console.log('[settings:domain] domain accepted by registry');
} else {
  console.log('[settings:domain] registry check skipped');
}

                          const result = db.prepare(`
      UPDATE sites
      SET
        name = ?,
        domain     = ?,
        icon       = ?,
        repository = ?,
        branch     = ?,
        username   = ?,
        password   = ?
      WHERE uuid = ?
    `).run(
                            name || null,
                            cleanDomain,
                            iconUrl || null,
                            repository || null,
                            branch || null,
                            authUser || null,
                            authPass || null,
                            req.params.siteId
                          );
                          
                          if (result.changes === 0) {
                            return res.sendStatus(404);
                          }
                          res.set('HX-Trigger', 'refreshSites');
                          
                          res.sendStatus(204);
                        }
                      );
                      
                      
                      
                      router.post(
                        '/:siteId/secrets',
                        express.json(),
                        async (req, res) => {
                          try {
                            const rows = Array.isArray(req.body) ? req.body : [];
                            
                            const clean = rows
                            .filter(r => r && typeof r.key === 'string')
                            .map(r => ({
                              key: r.key.trim(),
                              value: r.value ?? ''
                            }))
                            .filter(r => r.key !== '');
                            
                            const envPath = getEnvPath(req.params.siteId);
                            const content = serializeEnv(clean);
                            
                            // Write atomically
                            const dir = path.dirname(envPath);
                            const tmpPath = path.join(dir, `.env.${process.pid}.tmp`);
                            
                            await fs.writeFile(tmpPath, content, { mode: 0o600 });
                            await fs.rename(tmpPath, envPath);
                            
                            log.info('[secrets:write]', {
                              siteId: req.params.siteId,
                              count: clean.length
                            });
                            
                            res.sendStatus(204);
                          } catch (err) {
                            log.error('[secrets:write] failed', {
                              siteId: req.params.siteId,
                              err: err.message
                            });
                            
                            res.status(err.status || 500).send('Failed to save secrets');
                          }
                        }
                      );
                      router.post('/:siteId/archive', async (req, res) => {
                        const { siteId } = req.params;
                        
                        const result = db.prepare(`
    UPDATE sites
    SET
      status = 'archived',
      domain = NULL
    WHERE uuid = ?
  `).run(siteId);
                          
                          if (result.changes === 0) {
                            return res.sendStatus(404);
                          }
                          
                          log.info('[site:archive]', { siteId });
                          
                          res
                          .set('HX-Trigger', 'refreshSites')
                          .sendStatus(204);
                        });
                        
                        
                        
                        router.post('/:siteId/restore-archive', async (req, res) => {
                          const { siteId } = req.params;
                          
                          const result = db.prepare(`
    UPDATE sites
    SET
      status = NULL
    WHERE uuid = ?
      AND status = 'archived'
  `).run(siteId);
                            
                            if (result.changes === 0) {
                              return res.sendStatus(404);
                            }
                            
                            log.info('[site:restore-archive]', { siteId });
                            
                            res
                            .set('HX-Trigger', 'refreshSites')
                            .sendStatus(204);
                          });
                          
function hasDomainRegistryConfigured() {
  // for magick.host customers only
  // hope you don't mind
  return Boolean(
    process.env.REGISTRY_SECRET &&
    process.env.DOMAIN_REGISTRY_URL &&
    process.env.MAGICK_INSTANCE_ID
  );
}

async function checkDomainAvailable(domain) {
  const res = await fetch(
    `${process.env.DOMAIN_REGISTRY_URL}/domains/check/${encodeURIComponent(domain)}`,
    {
      headers: {
        'X-Registry-Secret': process.env.REGISTRY_SECRET,
        'MAGICK_INSTANCE_ID': process.env.MAGICK_INSTANCE_ID
      }
    }
  );

  if (!res.ok) return false;

  const data = await res.json();
  return data.ok === true;
}



                          export default router;
                          