CREATE TABLE cmi5_packages(
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, owner TEXT NOT NULL REFERENCES accounts(id),
 filename TEXT NOT NULL, provenance TEXT NOT NULL, sha256 TEXT NOT NULL, archive BLOB NOT NULL,
 manifest TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'quarantined' CHECK(state IN('quarantined','published','retired','revoked')),
 reviewer TEXT REFERENCES accounts(id), review_reason TEXT, created_at TEXT NOT NULL
);
CREATE INDEX cmi5_packages_tenant ON cmi5_packages(tenant,created_at);
CREATE TABLE cmi5_resources(
 package_id TEXT NOT NULL REFERENCES cmi5_packages(id), path TEXT NOT NULL, bytes BLOB NOT NULL,
 PRIMARY KEY(package_id,path)
);
CREATE TABLE cmi5_registrations(
 id TEXT PRIMARY KEY, package_id TEXT NOT NULL REFERENCES cmi5_packages(id), tenant TEXT NOT NULL,
 learner TEXT NOT NULL REFERENCES accounts(id), mode TEXT NOT NULL CHECK(mode IN('Normal','Browse','Review')),
 actor TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX cmi5_registration_owner ON cmi5_registrations(tenant,learner,package_id);
CREATE TABLE cmi5_sessions(
 id TEXT PRIMARY KEY, registration_id TEXT NOT NULL REFERENCES cmi5_registrations(id), au_id TEXT NOT NULL,
 auth_version INTEGER NOT NULL, browser_session TEXT NOT NULL,
 fetch_hash TEXT NOT NULL UNIQUE, auth_hash TEXT UNIQUE, launch_data TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'launched' CHECK(status IN('launched','initialized','terminated','abandoned')),
 created_at TEXT NOT NULL, expires INTEGER NOT NULL, terminated_at INTEGER
);
CREATE INDEX cmi5_session_registration ON cmi5_sessions(registration_id);
CREATE TABLE cmi5_statements(
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
 session_id TEXT NOT NULL REFERENCES cmi5_sessions(id), registration_id TEXT NOT NULL REFERENCES cmi5_registrations(id),
 au_id TEXT NOT NULL, verb TEXT NOT NULL, defined INTEGER NOT NULL CHECK(defined IN(0,1)),
 source TEXT NOT NULL CHECK(source IN('lms','au')), timestamp TEXT NOT NULL, stored TEXT NOT NULL,
 payload_hash TEXT NOT NULL, statement TEXT NOT NULL
);
CREATE INDEX cmi5_statement_registration ON cmi5_statements(registration_id,au_id,timestamp);
CREATE TABLE cmi5_state(
 registration_id TEXT NOT NULL REFERENCES cmi5_registrations(id), au_id TEXT NOT NULL,
 state_id TEXT NOT NULL, body TEXT NOT NULL, etag TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(registration_id,au_id,state_id)
);
INSERT INTO schema_version VALUES(52);
