-- Enable foreign keys (harmless even if unused)
PRAGMA foreign_keys = ON;

-- Sites table
CREATE TABLE IF NOT EXISTS sites (
  uuid TEXT PRIMARY KEY,
  name TEXT,
  icon TEXT,
  domain TEXT,
  directory TEXT,
  repository TEXT,
  branch TEXT,
  username TEXT,
  password TEXT,
  live_commit TEXT,
  status TEXT,
  created_at TEXT,
  last_viewed TEXT
);

-- Add status column if missing
ALTER TABLE sites
ADD COLUMN IF NOT EXISTS status TEXT;