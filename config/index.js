import path from 'path';

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_DEV = NODE_ENV === 'development';
export const IS_PROD = NODE_ENV === 'production';

export const PROJECT_ROOT = process.cwd();

export const DATA_ROOT = path.resolve(
  process.env.DATA_ROOT || path.join(PROJECT_ROOT, 'data')
);

export const ASSETS_ROOT = path.join(DATA_ROOT, 'assets');
export const SITES_ROOT = path.join(DATA_ROOT, 'sites');

export const BLOCKED_NAMES = new Set(['.env', '.git']);
export const HIDDEN_NAMES = new Set(['.env', '.git']);

export const SSH_DIR = path.join(DATA_ROOT, '.ssh');
export const SSH_PRIVATE_KEY_PATH = path.join(SSH_DIR, 'id_ed25519');
export const SSH_PUBLIC_KEY_PATH = path.join(SSH_DIR, 'id_ed25519.pub');
