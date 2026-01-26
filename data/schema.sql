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
  created_at TEXT,
  last_viewed TEXT
);

-- Helpful index (optional but cheap)
CREATE INDEX IF NOT EXISTS idx_sites_last_viewed
ON sites(last_viewed);
