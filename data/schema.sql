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

-- Preview links table
CREATE TABLE IF NOT EXISTS preview_links (
  uuid TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  username TEXT,
  password TEXT,
  commit_hash TEXT,

  FOREIGN KEY (site_id)
    REFERENCES sites(uuid)
    ON DELETE CASCADE
);

-- Helpful index for lookups by site
CREATE INDEX IF NOT EXISTS idx_preview_links_site_id
ON preview_links(site_id);
