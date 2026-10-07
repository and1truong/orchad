CREATE TABLE external_primary_assignments (
 record_id TEXT PRIMARY KEY REFERENCES external_records(id),
 assessor_id TEXT REFERENCES accounts(id),
 version INTEGER NOT NULL DEFAULT 0 CHECK(version BETWEEN 0 AND 100),
 updated_by TEXT REFERENCES accounts(id),
 reason TEXT,
 updated_at TEXT
);
CREATE TABLE moderation_assignment_notices (
 id TEXT PRIMARY KEY,
 tenant TEXT NOT NULL,
 principal TEXT NOT NULL REFERENCES accounts(id),
 record_id TEXT NOT NULL REFERENCES external_records(id),
 assignment_version INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN('assigned','removed')),
 created_at TEXT NOT NULL,
 read_at TEXT,
 UNIQUE(record_id,principal,assignment_version,kind)
);
CREATE INDEX moderation_notice_owner ON moderation_assignment_notices(tenant,principal,created_at,id);
INSERT INTO schema_version(version) VALUES(35);
