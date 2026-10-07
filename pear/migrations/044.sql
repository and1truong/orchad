ALTER TABLE scorm_engine_versions ADD COLUMN filename TEXT NOT NULL DEFAULT 'package.zip';
ALTER TABLE scorm_engine_versions ADD COLUMN provenance TEXT NOT NULL DEFAULT 'Engine fixture';
CREATE TABLE scorm_import_jobs(
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,owner TEXT NOT NULL,auth_version INTEGER NOT NULL,
 filename TEXT NOT NULL,provenance TEXT NOT NULL,package_id TEXT,version INTEGER NOT NULL CHECK(version>0),
 archive BLOB,sha256 TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','ready','failed')),
 warnings TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(warnings)),error TEXT,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 FOREIGN KEY(owner,tenant) REFERENCES accounts(id,tenant)
);
INSERT INTO schema_version VALUES(44);
