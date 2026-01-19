import 'dotenv/config';
import express from 'express';
import { engine } from 'express-handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import auth from './middleware/auth.js';
import accountRoutes from './api/account.js';
import connectRoutes from './api/connect.js';
import siteRoutes from './api/sites.js';
import publicRuntime from './runtime/public.js';
import { ensureSSHKeypair, validateEnv } from './lib/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ----------------------------
   Middleware
----------------------------- */
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

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

/* ----------------------------
   Static assets (PUBLIC)
----------------------------- */
app.use(express.static(path.join(__dirname, 'dashboard/public')));

/* ----------------------------
   Page auth (AFTER static)
----------------------------- */

app.use('/account', accountRoutes);
app.use('/site', publicRuntime);

app.use(auth);

validateEnv();
const publicKey = ensureSSHKeypair();
process.env.PUBLIC_SSH_KEY = publicKey;

app.use(express.json());
app.use('/sites', siteRoutes);
app.use('/connect', connectRoutes);

/* ----------------------------
   Routes
----------------------------- */
app.get('/login', (req, res) => {
  res.render('login', {
    title: 'Log in · Cute Magick',
    layout: false, // usually you want no chrome here
  });
});

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