CREATE TABLE IF NOT EXISTS content_curation (
 tenant TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('course','item')), content_id TEXT NOT NULL,
 endorsed INTEGER NOT NULL DEFAULT 0 CHECK(endorsed IN (0,1)),
 featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)),
 spotlight INTEGER NOT NULL DEFAULT 0 CHECK(spotlight IN (0,1)),
 retiring INTEGER NOT NULL DEFAULT 0 CHECK(retiring IN (0,1)),
 replacement_id TEXT, updated_at TEXT NOT NULL,
 PRIMARY KEY(tenant,kind,content_id)
);
INSERT OR IGNORE INTO schema_version VALUES(14);
