-- Engine records are separate from the legacy pear-scorm12-inline/1 tables.
-- Legacy status is package-reported and must never be promoted during migration.
CREATE UNIQUE INDEX accounts_id_tenant ON accounts(id,tenant);
CREATE TABLE scorm_engine_packages(
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,owner TEXT NOT NULL,title TEXT NOT NULL,
 created_at TEXT NOT NULL,UNIQUE(id,tenant),
 FOREIGN KEY(owner,tenant) REFERENCES accounts(id,tenant)
);
CREATE TABLE scorm_engine_versions(
 package_id TEXT NOT NULL,tenant TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),
 standard TEXT NOT NULL CHECK(standard IN('1.2','2004-2','2004-3','2004-4')),
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),archive BLOB NOT NULL,
 manifest TEXT NOT NULL CHECK(json_valid(manifest)),
 state TEXT NOT NULL DEFAULT 'quarantined' CHECK(state IN('quarantined','published','retired','revoked')),
 created_at TEXT NOT NULL,reviewer TEXT,review_reason TEXT,
 PRIMARY KEY(package_id,version),UNIQUE(package_id,version,tenant),
 FOREIGN KEY(package_id,tenant) REFERENCES scorm_engine_packages(id,tenant),
 FOREIGN KEY(reviewer,tenant) REFERENCES accounts(id,tenant)
);
CREATE TRIGGER scorm_engine_version_immutable BEFORE UPDATE OF package_id,tenant,version,standard,sha256,archive,manifest ON scorm_engine_versions
BEGIN SELECT RAISE(ABORT,'SCORM package version is immutable'); END;
CREATE TABLE scorm_engine_resources(
 package_id TEXT NOT NULL,version INTEGER NOT NULL,tenant TEXT NOT NULL,
 path TEXT NOT NULL,bytes BLOB NOT NULL,mime TEXT NOT NULL,
 PRIMARY KEY(package_id,version,path),
 FOREIGN KEY(package_id,version,tenant) REFERENCES scorm_engine_versions(package_id,version,tenant)
);
CREATE TRIGGER scorm_engine_resource_immutable BEFORE UPDATE ON scorm_engine_resources
BEGIN SELECT RAISE(ABORT,'SCORM package resource is immutable'); END;
CREATE TABLE scorm_registrations(
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,learner TEXT NOT NULL,
 package_id TEXT NOT NULL,version INTEGER NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN('normal','preview')),
 binding_key TEXT NOT NULL DEFAULT 'standalone',
 created_at TEXT NOT NULL,UNIQUE(id,tenant),UNIQUE(tenant,learner,package_id,version,binding_key,mode),
 FOREIGN KEY(learner,tenant) REFERENCES accounts(id,tenant),
 FOREIGN KEY(package_id,version,tenant) REFERENCES scorm_engine_versions(package_id,version,tenant)
);
CREATE TABLE scorm_engine_attempts(
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,registration_id TEXT NOT NULL,
 attempt_number INTEGER NOT NULL CHECK(attempt_number>0),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 sequencing_state TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(sequencing_state)),
 created_at TEXT NOT NULL,UNIQUE(id,tenant),UNIQUE(registration_id,attempt_number),
 FOREIGN KEY(registration_id,tenant) REFERENCES scorm_registrations(id,tenant)
);
CREATE TABLE scorm_sco_attempts(
 attempt_id TEXT NOT NULL,tenant TEXT NOT NULL,sco_id TEXT NOT NULL,
 sco_attempt_number INTEGER NOT NULL DEFAULT 1 CHECK(sco_attempt_number>0),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 runtime_state TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(runtime_state)),
 reported_seconds REAL NOT NULL DEFAULT 0 CHECK(reported_seconds>=0),
 PRIMARY KEY(attempt_id,sco_id,sco_attempt_number),
 FOREIGN KEY(attempt_id,tenant) REFERENCES scorm_engine_attempts(id,tenant)
);
INSERT INTO schema_version VALUES(43);
