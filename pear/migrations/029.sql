CREATE TABLE IF NOT EXISTS provider_items (
 tenant TEXT NOT NULL, provider TEXT NOT NULL, source_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>0), definition TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 PRIMARY KEY(tenant,provider,source_id)
);
CREATE TABLE IF NOT EXISTS provider_grants (
 tenant TEXT NOT NULL, provider TEXT NOT NULL, source_id TEXT NOT NULL,
 learner TEXT NOT NULL REFERENCES accounts(id), valid_until INTEGER NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 PRIMARY KEY(tenant,provider,source_id,learner),
 FOREIGN KEY(tenant,provider,source_id) REFERENCES provider_items(tenant,provider,source_id)
);
CREATE TABLE IF NOT EXISTS provider_events (
 tenant TEXT NOT NULL, provider TEXT NOT NULL, sequence INTEGER NOT NULL CHECK(sequence>0),
 event_id TEXT NOT NULL, digest TEXT NOT NULL, source_time TEXT NOT NULL,
 result TEXT NOT NULL, received_at TEXT NOT NULL,
 PRIMARY KEY(tenant,provider,sequence), UNIQUE(tenant,provider,event_id)
);
INSERT OR IGNORE INTO schema_version VALUES(29);
