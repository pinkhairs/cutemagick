import 'dotenv/config';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

import express from 'express';
import { engine } from 'express-handlebars';
import cookieParser from 'cookie-parser';
import Handlebars from 'handlebars';

import auth from './api/middleware/auth.js';

import accountRoutes from './api/routes/account.js';
import configRoutes from './api/routes/config.js';
import sitesRoutes from './api/routes/sites.js';
import fsRoutes from './api/routes/fs.js';
import siteRoutes from './api/routes/site.js';
import siteWindowRoutes from './api/routes/site-window.js';
import previewRouter from './api/routes/preview.js';
import timeRoutes from './api/routes/time.js';

import { db } from '../infra/index.js';
import { getHeadCommit } from '../infra/git/index.js';

import log from '../infra/logs/index.js';
import {
  ensureSSHKeypair,
  validateEnv,
  startMaintenanceScheduler,
} from '../infra/index.js';

import { DATA_ROOT } from '../config/index.js';
import csrf from './api/middleware/csrf.js';

/* ----------------------------
   Paths
----------------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ----------------------------
   Startup checks
----------------------------- */

validateEnv();

// Ensure DATA_ROOT exists explicitly
if (!fs.existsSync(DATA_ROOT)) {
  log.info('[init]', 'creating data root', DATA_ROOT);
  fs.mkdirSync(DATA_ROOT, { recursive: true });
}

ensureSSHKeypair();
startMaintenanceScheduler();

/* ----------------------------
   App setup
----------------------------- */

const app = express();
/* ----------------------------
   Middleware
----------------------------- */

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTMX: disable caching for fragment responses
app.use((req, res, next) => {
  if (req.headers['hx-request']) {
    res.set('Cache-Control', 'no-store');
  }
  next();
});

/* ----------------------------
   Handlebars (.html templates)
----------------------------- */

app.engine(
  'html',
  engine({
    extname: '.html',
    layoutsExtname: '.html',
    layoutsDir: path.join(__dirname, 'dashboard/views/layouts'),
    partialsDir: path.join(__dirname, 'dashboard/views/partials'),
  })
);

app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'dashboard/views'));

Handlebars.registerHelper('eq',  (a, b) => a === b);
Handlebars.registerHelper('ne',  (a, b) => a !== b);
Handlebars.registerHelper('gt',  (a, b) => Number(a) >  Number(b));
Handlebars.registerHelper('gte', (a, b) => Number(a) >= Number(b));
Handlebars.registerHelper('lt',  (a, b) => Number(a) <  Number(b));
Handlebars.registerHelper('lte', (a, b) => Number(a) <= Number(b));
Handlebars.registerHelper('or',  (...args) => args.slice(0, -1).some(Boolean));
Handlebars.registerHelper('and', (...args) => args.slice(0, -1).every(Boolean));

/* ----------------------------
   Static assets
----------------------------- */

app.use(
  '/assets',
  express.static(path.join(DATA_ROOT, 'assets'))
);

/* ----------------------------
   Public routes
----------------------------- */

app.get('/login', (req, res) => {
  res.render('login', {
    title: 'Log in · Cute Magick',
    layout: false,
  });
});

// Public hosted sites
app.use('/account', accountRoutes);
app.use('/site', (req, res, next) => {
  next();
});

app.use('/site', siteRoutes);
app.use(csrf);

/* ----------------------------
   Authenticated routes
----------------------------- */

app.use(auth);
app.use('/sites', sitesRoutes);
app.use('/site-window', siteWindowRoutes);
app.use('/fs', fsRoutes);
app.use('/config', configRoutes);
app.use('/time', timeRoutes);
app.use('/preview', previewRouter);
app.get(/^\/editor\/([^/]+)\/(.+)$/, async (req, res) => {
  const siteId = req.params[0];
  const relPath = req.params[1];
  const filename = path.basename(relPath);
  const hash = crypto.createHash('sha256').update(relPath).digest('hex');
  const windowId = `editor-${siteId}-${hash}`;

  if (!siteId || !relPath) {
    return res.status(400).send('Missing parameters');
  }

  const site = db.prepare(`
    SELECT uuid, name
    FROM sites
    WHERE uuid = ?
  `).get(siteId);

  if (!site) {
    return res.sendStatus(404);
  }

  const headCommit = await getHeadCommit({siteId});

  return res.render('partials/editor', {
    id: windowId,
    layout: false,
    siteId,
    siteName: site.name,
    path: relPath,
    fileHash: hash,
    filename: filename,
    commitHash: headCommit
  });
});


app.get('/', (req, res) => {
  res.render('index', {
    title: 'Cute Magick',
  });
});

/* ----------------------------
   Server
----------------------------- */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  log.info('app', `Cute Magick running on http://localhost:${PORT}`);
});
