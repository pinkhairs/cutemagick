import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

import log from '../logs/index.js';
import { DATA_ROOT } from '../../config/index.js';

// Ensure DATA_ROOT exists with proper permissions
try {
  if (!fs.existsSync(DATA_ROOT)) {
    log.info('[db]', 'creating DATA_ROOT', DATA_ROOT);
    fs.mkdirSync(DATA_ROOT, { recursive: true, mode: 0o755 });
  }

  // Verify the directory is writable by attempting to write a test file
  const testFile = path.join(DATA_ROOT, '.write-test');
  fs.writeFileSync(testFile, 'test', 'utf8');
  fs.unlinkSync(testFile);
  log.info('[db]', 'DATA_ROOT is writable', DATA_ROOT);
} catch (err) {
  log.error('[db]', 'DATA_ROOT is not writable', {
    path: DATA_ROOT,
    error: err.message,
    code: err.code
  });
  throw new Error(`Cannot write to DATA_ROOT: ${DATA_ROOT}. ${err.message}`);
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
