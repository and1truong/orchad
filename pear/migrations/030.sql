CREATE TABLE IF NOT EXISTS provider_launches (
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, learner TEXT NOT NULL REFERENCES accounts(id),
 auth_version INTEGER NOT NULL, provider TEXT NOT NULL, source_id TEXT NOT NULL,
 source_version INTEGER NOT NULL, created_at TEXT NOT NULL, expires INTEGER NOT NULL,
 FOREIGN KEY(tenant,provider,source_id) REFERENCES provider_items(tenant,provider,source_id)
);
CREATE INDEX IF NOT EXISTS provider_launches_own ON provider_launches(tenant,learner,created_at,id);
INSERT OR IGNORE INTO schema_version VALUES(30);
