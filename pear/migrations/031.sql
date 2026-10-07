CREATE TABLE IF NOT EXISTS provider_reviews (
 tenant TEXT NOT NULL, provider TEXT NOT NULL, owner TEXT NOT NULL REFERENCES accounts(id),
 auth_version INTEGER NOT NULL, policy_hash TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 reason TEXT NOT NULL, reviewed_at TEXT NOT NULL,
 PRIMARY KEY(tenant,provider)
);
INSERT OR IGNORE INTO schema_version VALUES(31);
