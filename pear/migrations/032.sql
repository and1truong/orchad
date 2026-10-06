CREATE TABLE IF NOT EXISTS digest_subscriptions(
 tenant TEXT NOT NULL,learner TEXT NOT NULL REFERENCES accounts(id),auth_version INTEGER NOT NULL,
 definition TEXT NOT NULL,version INTEGER NOT NULL,next_run TEXT,updated_at TEXT NOT NULL,
 PRIMARY KEY(tenant,learner));
CREATE INDEX IF NOT EXISTS digest_due ON digest_subscriptions(next_run);
CREATE TABLE IF NOT EXISTS digest_notifications(
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,learner TEXT NOT NULL REFERENCES accounts(id),
 auth_version INTEGER NOT NULL,subscription_version INTEGER NOT NULL,run_at TEXT NOT NULL,
 payload TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,read_at TEXT,
 UNIQUE(tenant,learner,subscription_version,run_at));
CREATE INDEX IF NOT EXISTS digest_own ON digest_notifications(tenant,learner,created_at);
INSERT OR IGNORE INTO schema_version VALUES(32);
