import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';


const app = express();

// ESM __dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Body parsing (HTMX forms need this)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Optional but very useful
app.use((req, _res, next) => {
  req.isHtmx = req.get('HX-Request') === 'true';
  next();
});

// ---- STATIC ASSETS ----
app.use(
  '/public',
  express.static(path.join(__dirname, 'dashboard/public'))
);

// ---- FULL PAGES ----
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/index.html'));
});

export default app;
