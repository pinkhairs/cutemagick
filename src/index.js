import 'dotenv/config';

import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

import express from 'express';
import { engine } from 'express-handlebars';
import cookieParser from 'cookie-parser';
import Handlebars from 'handlebars';

import auth from './api/middleware/auth.js';
import domainResolver from './api/middleware/domainResolver.js';

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
  ensureFirstSite,
} from '../infra/index.js';

import { DATA_ROOT, PUBLIC_ROOT } from '../config/index.js';
import csrf from './api/middleware/csrf.js';
import httpBasic from './api/middleware/httpBasic.js';

/* ----------------------------
   Paths
----------------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ----------------------------
   Startup checks
----------------------------- */

validateEnv();

ensureSSHKeypair();
startMaintenanceScheduler();

// Ensure first site exists
await ensureFirstSite();

/* ----------------------------
   App setup
----------------------------- */

const app = express();

// Trust proxy for correct Host headers behind reverse proxies
app.set('trust proxy', true);

/* ----------------------------
   Middleware
----------------------------- */

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
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

// Safe URL validation helper for CSS url() contexts
Handlebars.registerHelper('safeUrl', function(url) {
  if (!url) return '';

  try {
    const parsed = new URL(url, 'http://localhost');
    // Only allow http, https, and data URLs
    if (!['http:', 'https:', 'data:'].includes(parsed.protocol)) {
      return '';
    }
    // Escape quotes and backslashes for CSS context
    return url.replace(/["'\\]/g, '\\$&');
  } catch {
    return '';
  }
});

// JSON-safe escaping for hx-vals and other JSON contexts
Handlebars.registerHelper('jsonEscape', function(value) {
  if (value == null) return '';
  return JSON.stringify(String(value)).slice(1, -1); // Remove surrounding quotes
});

// HTML attribute escaping
Handlebars.registerHelper('escapeAttr', function(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
});


/* ----------------------------
   Domain resolver
----------------------------- */

// Serves sites based on Host header (skips /admin and /site routes)
app.use(domainResolver);
app.use(httpBasic);

function adminSecurityHeaders(req, res, next) {
  // Core hardening (safe for admin UI)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // STRICT CSP — admin UI only (ACE editor from CDN, fonts local)
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com blob:",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "frame-src 'self'",
      "base-uri 'self'",
    ].join('; ')
  );

  next();
}

app.use('/admin', adminSecurityHeaders);

/* ----------------------------
   Static assets
----------------------------- */
app.use(
  '/admin/assets',
  express.static(`${PUBLIC_ROOT}/admin`)
);

app.use('/admin/assets/js',  express.static(`${PUBLIC_ROOT}/admin/assets/js`));
app.use('/admin/assets/css', express.static(`${PUBLIC_ROOT}/admin/assets/css`));
app.use('/admin/assets/img', express.static(`${PUBLIC_ROOT}/admin/assets/img`));

/* ----------------------------
   Public routes
----------------------------- */

app.get('/admin/login', (req, res) => {
  res.render('login', {
    title: 'Log in · Cute Magick',
    layout: false,
  });
});

// Public hosted sites
app.use('/admin/account', accountRoutes);
app.use('/site', siteRoutes);
app.use('/iframe/site', siteRoutes);

/* ----------------------------
   Authenticated routes
----------------------------- */

app.use(auth);
app.use(csrf);

app.use('/admin/sites', sitesRoutes);
app.use('/admin/site-window', siteWindowRoutes);
app.use('/admin/fs', fsRoutes);
app.use('/admin/config', configRoutes);
app.use('/admin/time', timeRoutes);
app.use('/admin/preview', previewRouter);

app.get(/^\/admin\/editor\/([^/]+)\/(.+)$/, async (req, res) => {
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


app.get('/admin', (req, res) => {
  res.render('index', {
    title: 'Cute Magick',
  });
});

/* ----------------------------
   Server
----------------------------- */

log.info('boot', {
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV,
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  log.info('app', `Cute Magick listening on ${PORT}`);
});