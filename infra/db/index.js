import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

import log from '../logs/index.js';
import { DATA_ROOT } from '../../config/index.js';

// Ensure DATA_ROOT exists
try {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
} catch (err) {
  log.error('[db]', 'failed to ensure DATA_ROOT', DATA_ROOT);
  throw err;
}

const DB_PATH = path.join(DATA_ROOT, 'cutemagick.db');
const SCHEMA_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  'schema.sql'
);

log.info('[db]', 'opening database', DB_PATH);
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

try {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
  log.info('[db]', 'schema applied');
} catch (err) {
  log.error('[db]', 'failed to apply schema');
  throw err;
}

export default db;
