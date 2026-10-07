CREATE TABLE scorm_packages(
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,owner TEXT NOT NULL REFERENCES accounts(id),filename TEXT NOT NULL,title TEXT NOT NULL,
 language TEXT NOT NULL CHECK(language IN('en','vi')),sha256 TEXT NOT NULL,bytes BLOB NOT NULL,html TEXT NOT NULL,expanded_bytes INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'quarantined' CHECK(state IN('quarantined','published','retired')),created_at TEXT NOT NULL,review_reason TEXT,reviewer TEXT REFERENCES accounts(id)
);
CREATE TABLE scorm_records(
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,learner TEXT NOT NULL REFERENCES accounts(id),package_id TEXT NOT NULL REFERENCES scorm_packages(id),
 state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,reported_seconds REAL NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(learner,package_id)
);
CREATE TABLE scorm_launches(
 id TEXT PRIMARY KEY,record_id TEXT NOT NULL UNIQUE REFERENCES scorm_records(id),session_hash TEXT NOT NULL,nonce TEXT NOT NULL,
 ticket_hash TEXT NOT NULL,expires INTEGER NOT NULL,ticket_expires INTEGER NOT NULL,reported_seconds REAL NOT NULL DEFAULT 0
);
INSERT INTO schema_version VALUES(21);
