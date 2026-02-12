import path from 'path';

export const APP_ROOT = process.cwd();
export const DATA_ROOT = path.join(APP_ROOT, 'data');

export const SITES_ROOT = path.join(DATA_ROOT, 'sites');
export const RENDERS_ROOT = path.join(DATA_ROOT, 'renders');
export const LIVE_DATA_ROOT = path.join(DATA_ROOT, 'live');
export const DEPENDENCIES_ROOT = path.join(DATA_ROOT, 'dependencies');
export const NPM_CACHE_ROOT = path.join(DATA_ROOT, 'npm-cache');