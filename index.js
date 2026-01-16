import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import accountAPI from './api/account.js';
import sitesAPI from './api/sites.js';
import filesAPI from './api/files.js';
import versionsAPI from './api/versions.js';
import publicRoutes from './routes/public.js';
import previewRoutes from './routes/preview.js';
import authMiddleware from './middleware/auth.js';

const app = express();
const isDev = process.env.NODE_ENV === 'development';

app.use(express.json());

// Public API (no auth)
app.use('/api/account', accountAPI);

// Protected API (requires auth)
app.use('/api/sites', authMiddleware, sitesAPI);
app.use('/api/sites/:id/files', authMiddleware, filesAPI);
app.use('/api/sites/:id/versions', authMiddleware, versionsAPI);

// Dashboard
if (isDev) {
  app.use('/admin', createProxyMiddleware({
    target: 'http://localhost:5173',
    changeOrigin: true,
    ws: true
  }));
  app.use('/settings', createProxyMiddleware({
    target: 'http://localhost:5173',
    changeOrigin: true
  }));
} else {
  app.use(express.static('public'));
}

// Preview (authenticated)
app.use('/preview', authMiddleware, previewRoutes);

// Public sites (no auth, runs live_commit)
app.use('/:site', publicRoutes);

export default app;