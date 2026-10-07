CREATE TABLE assets(
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, owner TEXT NOT NULL REFERENCES accounts(id),
 filename TEXT NOT NULL, mime TEXT NOT NULL, sha256 TEXT NOT NULL, bytes BLOB NOT NULL,
 created_at TEXT NOT NULL, operation_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
 UNIQUE(owner,operation_key)
);
CREATE INDEX assets_tenant ON assets(tenant);
INSERT INTO schema_version VALUES(8);
