import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join('/app', 'data', 'cutemagick.db');
const db = new Database(DB_PATH);

// Load schema
const schema = fs.readFileSync('./data/schema.sql', 'utf8');

// Run schema (safe to re-run)
db.exec(schema);

export default db;
