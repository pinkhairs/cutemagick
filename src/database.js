import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const DATA_DIR = path.join('/app', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'cutemagick.db');
const db = new Database(DB_PATH);

// Load schema from src/db (source code), not data (runtime files)
const schema = fs.readFileSync(
  path.join('/app', 'src', 'schema.sql'),
  'utf8'
);

// Run schema (safe to re-run)
db.exec(schema);

export default db;