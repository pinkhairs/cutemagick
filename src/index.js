import 'dotenv/config';
import express from 'express';
import { engine } from 'express-handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import auth from './api/middleware/auth.js';
import accountRoutes from './api/routes/account.js';
import connectRoutes from './api/routes/connect.js';
import sitesRoutes from './api/routes/sites.js';
import filesRoutes from './api/routes/files.js';
import liveRuntime from './api/routes/live.js';
import previewRuntime from './api/routes/preview.js';
import { ensureSSHKeypair, validateEnv } from './api/lib/index.js';
import { startMaintenanceScheduler } from './api/lib/maintenance.js';
const DATA_ROOT = path.join('/app', 'data');
const APP_ROOT = path.join('/app', 'src');
startMaintenanceScheduler();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// app.use((req, res, next) => {
//   console.log(`➡️  ${req.method} ${req.originalUrl}`);
//   next();
// });

/* ----------------------------
  Middleware
----------------------------- */
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

// ... other code ...

// Serve static assets with correct MIME types
app.use('/assets', express.static(path.join(DATA_ROOT, 'assets'), {
  setHeaders: (res, filepath) => {
    if (filepath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (filepath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filepath.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
    }
  }
}));

// REMOVE THIS BROKEN LINE:
// app.use(
//   express.static(
//     path.join(APP_ROOT, 'src', 'dashboard', 'assets')
//   )
// );

/* ----------------------------
  Page auth (AFTER static)
----------------------------- */

app.use('/account', accountRoutes);
app.use('/site', liveRuntime);
/* ----------------------------
  Routes
----------------------------- */
app.get('/login', (req, res) => {
res.render('login', {
  title: 'Log in · Cute Magick',
  layout: false, // usually you want no chrome here
});
});
app.use(auth);

validateEnv();
ensureSSHKeypair();

app.use('/sites', sitesRoutes);
app.use('/files', filesRoutes);
app.use('/connect', connectRoutes);
app.use('/preview', previewRuntime);

app.get('/', (req, res) => {
res.render('index', {
  title: 'Cute Magick'
});
});


/* ----------------------------
  Server
----------------------------- */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
console.log(`\n🌙 Cute Magick running on http://localhost:${PORT}\n`);
});