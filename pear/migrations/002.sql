-- Additive/idempotent migration; existing enrollments and course JSON remain valid.
CREATE TABLE IF NOT EXISTS content_items(
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('draft','published','retired')),
 draft TEXT NOT NULL, latest_version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS content_item_versions(
 item_id TEXT NOT NULL REFERENCES content_items(id),
 version INTEGER NOT NULL, content TEXT NOT NULL,
 PRIMARY KEY(item_id,version)
);
INSERT OR IGNORE INTO schema_version VALUES(2);
