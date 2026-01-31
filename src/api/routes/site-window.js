import express from 'express';
import db from '../../../infra/db/index.js';
import { resolveSiteAddress } from '../../../infra/resolveSiteAddress.js';

const router = express.Router();

/* -------------------------------------------------
   Helpers
-------------------------------------------------- */

function getSite(siteId) {
  return db.prepare(`
    SELECT uuid, name, directory
    FROM sites
    WHERE uuid = ?
  `).get(siteId);
}

/* -------------------------------------------------
   Routes
-------------------------------------------------- */

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

router.get('/:siteId/actions', async (req, res) => {
  const site = getSite(req.params.siteId);
  if (!site) return res.sendStatus(404);

  const siteAddress = resolveSiteAddress(site);

  return res.render('partials/site-actions', {
    layout: false,
    siteId: site.uuid,
    siteAddress,
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

      case 'history':
        return res.render('partials/history', {
          siteAddress,
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
