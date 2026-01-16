import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
// import accountAPI from './api/account.js';      // TODO: create this
// import sitesAPI from './api/sites.js';          // TODO: create this
// import filesAPI from './api/files.js';          // TODO: create this
// import versionsAPI from './api/versions.js';    // TODO: create this
// import publicRoutes from './routes/public.js';  // TODO: create this
// import previewRoutes from './routes/preview.js';// TODO: create this
// import authMiddleware from './middleware/auth.js'; // TODO: create this

const app = express();
const isDev = process.env.NODE_ENV === 'development';

app.use(express.json());

// Temporary: just API placeholder
app.get('/api/test', (req, res) => {
  res.json({ message: 'API working!' });
});

// Dashboard
if (isDev) {
  app.use('/admin', createProxyMiddleware({
    target: 'http://localhost:5173',
    changeOrigin: true,
    ws: true
  }));
  app.use('/settings', createProxyMiddleware({
    target: 'http://localhost:5173',
    changeOrigin: true,
    ws: true
  }));
} else {
  app.use('/admin', express.static('public'));
  app.use('/settings', express.static('public'));
}

app.get('/', (req, res) => {
  res.redirect('/admin');
});

export default app;