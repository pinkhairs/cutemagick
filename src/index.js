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
import publicRuntime from './api/routes/public.js';
import { ensureSSHKeypair, validateEnv } from './api/lib/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ----------------------------
  Middleware
----------------------------- */
app.use(cookieParser());
app.use(express.json());

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
  Page auth (AFTER static)
----------------------------- */

app.use('/account', accountRoutes);
app.use('/site', publicRuntime);

app.use(auth);

validateEnv();
ensureSSHKeypair();

app.use(express.static(path.join(__dirname, 'dashboard/assets')));
app.use('/sites', sitesRoutes);
app.use('/files', filesRoutes);
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