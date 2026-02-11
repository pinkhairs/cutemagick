import express from 'express';
import db from '../../../infra/db/index.js';
import { resolveSiteAddress } from '../../../infra/resolveSiteAddress.js';
import { getCommitHistory, getHeadCommit, getLiveCommit } from '../../../infra/git/index.js';
import { link } from 'fs';

const router = express.Router();

function getSite(siteId) {
  return db.prepare(`
    SELECT uuid, name, directory, live_commit, domain, username, password
    FROM sites
    WHERE uuid = ?
  `).get(siteId);
}


router.get('/:siteId', async (req, res) => {
  const site = getSite(req.params.siteId);
  if (!site) return res.sendStatus(404);

  const siteAddress = resolveSiteAddress(site, 'admin-iframe');
  const publicUrl = resolveSiteAddress(site, 'public');

  // Iframe uses clean path (admin is authenticated, httpBasic will skip)
  const iframeHtml = `<iframe src="/iframe/site/${site.directory.replace(/["'<>&]/g, c =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])
  )}" class="w-full h-full border-none"></iframe>`;

  res.render('partials/site-window', {
    layout: false,
    id: site.uuid,
    title: site.name,
    siteAddress,
    publicUrl,
    directory: site.directory,
    body: iframeHtml
  });
});

router.get('/:siteId/preview-file-button', async (req, res) => {
  const site = getSite(req.params.siteId);
  if (!site) return res.sendStatus(404);

  const filePath = req.query.path;
  if (!filePath) return res.status(400).send('Missing path');

  const commitHash = await getHeadCommit({ siteId: site.uuid });

  return res.render('partials/preview-file-button', {
    layout: false,
    siteId: site.uuid,
    directory: site.directory,
    commitHash,
    filePath
  });
});

router.get('/:siteId/toolbar', async (req, res) => {
  const site = getSite(req.params.siteId);
  if (!site) return res.sendStatus(404);

  const siteAddress = resolveSiteAddress(site, 'admin-iframe');
  const publicUrl = resolveSiteAddress(site, 'public');

  return res.render('partials/site-toolbar', {
    layout: false,
    siteId: site.uuid,
    siteAddress,
    publicUrl,
    directory: site.directory
  });
});

router.get('/:siteId/actions', async (req, res) => {
  const site = getSite(req.params.siteId);
  if (!site) return res.sendStatus(404);

  const headCommit = await getHeadCommit({siteId: site.uuid});
  const liveCommit = await getLiveCommit({siteId: site.uuid});
  const siteAddress = resolveSiteAddress(site, 'admin-iframe');
  const publicUrl = resolveSiteAddress(site, 'public');

  return res.render('partials/site-actions', {
    layout: false,
    siteId: site.uuid,
    siteAddress,
    publicUrl,
    commitHash: headCommit,
    latest: liveCommit === headCommit,
    directory: site.directory,
    name: site.name
  });
});

router.get('/:siteId/:tab', async (req, res) => {
  const { siteId, tab } = req.params;

  const site = getSite(siteId);
  if (!site) return res.sendStatus(404);

  const siteAddress = resolveSiteAddress(site, 'admin-iframe');
  const publicUrl = resolveSiteAddress(site, 'public');

  try {
    switch (tab) {
      case 'home':
        // Iframe uses clean path (admin is authenticated)
        const escapedDir = site.directory.replace(/["'<>&]/g, c =>
          ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])
        );
        return res.send(`
          <iframe
            src="/iframe/site/${escapedDir}"
            class="w-full h-full border-none"
          ></iframe>
        `);

      case 'files':
        return res.render('partials/file-explorer', {
          siteAddress,
          publicUrl,
          siteId: site.uuid,
          layout: false
      });

      case 'time-machine':
        const commits = await getCommitHistory({ siteId });

        const annotatedCommits = commits.map(c => ({
          ...c,
          isLive: c.hash === site.live_commit
        }));

        return res.render('partials/time-machine', {
          siteAddress,
          publicUrl,
          commits: annotatedCommits,
          siteDir: site.directory,
          uuid: site.uuid,
          layout: false
        });

      case 'secrets':
        return res.render('partials/secrets', {
          siteAddress,
          publicUrl,
          siteId: site.uuid,
          layout: false
        });

      case 'settings':
        return res.render('partials/settings', {
          siteAddress,
          publicUrl,
          siteId: site.uuid,
          layout: false,
          wildcardDomain: process.env.WILDCARD_DOMAIN,
        });

      default:
        return res.status(404).send('Unknown tab');
    }
  } catch (err) {
    return res.send(`
      <div class="p-4 text-sm text-red-500">
        Failed to load tab
      </div>
    `);
  }
});

export default router;
