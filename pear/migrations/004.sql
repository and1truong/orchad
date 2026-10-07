CREATE TABLE IF NOT EXISTS user_profiles(user_id TEXT PRIMARY KEY REFERENCES accounts(id),created_at TEXT NOT NULL,preferred_language TEXT NOT NULL DEFAULT 'en',interests TEXT NOT NULL DEFAULT '[]',custom_fields TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS learning_groups(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,owner TEXT NOT NULL REFERENCES accounts(id),name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('static','dynamic')),definition TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS group_tenant ON learning_groups(tenant,id);
INSERT OR IGNORE INTO user_profiles(user_id,created_at) SELECT id,'2026-10-05T00:00:00.000Z' FROM accounts;
INSERT OR IGNORE INTO schema_version VALUES(4);
