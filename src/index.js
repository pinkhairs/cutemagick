import express from 'express';
import { engine } from 'express-handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import pageAuth from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ----------------------------
   Middleware
----------------------------- */
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

/* ----------------------------
   Handlebars (.html templates)
----------------------------- */
app.engine(
  'html',
  engine({
    extname: '.html',
    layoutsExtname: '.html',
    layoutsDir: path.join(__dirname, 'dashboard/views/layouts'),
    defaultLayout: 'page',
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
app.use(pageAuth);

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
    title: 'Cute Magick',
    user: req.user,
  });
});

/* ----------------------------
   Server
----------------------------- */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🌙 Cute Magick running on http://localhost:${PORT}\n`);
});
