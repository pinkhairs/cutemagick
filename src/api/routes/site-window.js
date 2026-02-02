import express from 'express';
import db from '../../../infra/db/index.js';
import { resolveSiteAddress } from '../../../infra/resolveSiteAddress.js';
import { getCommitHistory, getHeadCommit, getLiveCommit } from '../../../infra/git/index.js';
import { link } from 'fs';

const router = express.Router();

function getSite(siteId) {
  return db.prepare(`
    SELECT uuid, name, directory, live_commit, domain
    FROM sites
    WHERE uuid = ?
  `).get(siteId);
}

router.get('/:siteId', async (req, res) => {
  const site = getSite(req.params.siteId);
  if (!site) return res.sendStatus(404);
  const siteAddress = resolveSiteAddress(site);
  
  res.render('partials/site-window', {
    layout: false,
    id: site.uuid,
    title: site.name,
    siteAddress,
    siteAddressDisplay: siteAddress.split('//')[1].replace(/\/$/, ''),
    directory: site.directory,
    body: `
      <iframe
        src="/site/${site.directory}"
        class="w-full h-full border-none"
      ></iframe>
    `
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

router.get('/:siteId/actions', async (req, res) => {
  const site = getSite(req.params.siteId);
  if (!site) return res.sendStatus(404);

  const siteAddress = resolveSiteAddress(site);
  const headCommit = await getHeadCommit({siteId: site.uuid});
  const liveCommit = await getLiveCommit({siteId: site.uuid});

  console.log(liveCommit === headCommit);
  
  return res.render('partials/site-actions', {
    layout: false,
    siteId: site.uuid,
    siteAddress,
    commitHash: headCommit,
    latest: liveCommit === headCommit,
    siteAddressDisplay: siteAddress.split('//')[1].replace(/\/$/, ''),
    directory: site.directory,
    name: site.name
  });
});

router.get('/:siteId/:tab', async (req, res) => {
  const { siteId, tab } = req.params;

  const site = getSite(siteId);
  if (!site) return res.sendStatus(404);
  const siteAddress = resolveSiteAddress(site);

  try {
    switch (tab) {
      case 'home':
        return res.send(`
          <iframe
            src="/site/${site.directory}"
            class="w-full h-full border-none"
          ></iframe>
        `);

      case 'files':
        return res.render('partials/file-explorer', {
          siteAddress,
          siteAddressDisplay: siteAddress.split('//')[1].replace(/\/$/, ''),
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
          commits: annotatedCommits,
          siteDir: site.directory,
          siteAddressDisplay: siteAddress.split('//')[1].replace(/\/$/, ''),
          uuid: site.uuid,
          layout: false
        });

      case 'secrets':
        return res.render('partials/secrets', {
          siteAddress,
          siteAddressDisplay: siteAddress.split('//')[1].replace(/\/$/, ''),
          siteId: site.uuid,
          layout: false
        });

      case 'settings':
        return res.render('partials/settings', {
          siteAddress,
          siteAddressDisplay: siteAddress.split('//')[1].replace(/\/$/, ''),
          siteId: site.uuid,
          layout: false
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
