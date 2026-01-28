import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join('/app', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'cutemagick.db');
const db = new Database(DB_PATH);

// Load schema from source directory, not data directory
const schema = fs.readFileSync(
  path.join(__dirname, 'schema.sql'),  // Or wherever your schema.sql actually is
  'utf8'
);

// Run schema (safe to re-run)
db.exec(schema);

export default db;