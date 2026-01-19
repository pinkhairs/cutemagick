import fs from 'fs';
import Database from 'better-sqlite3';

const db = new Database('./data/cutemagick.db');

// Load schema
const schema = fs.readFileSync('./data/schema.sql', 'utf8');

// Run schema (safe to re-run)
db.exec(schema);

export default db;
