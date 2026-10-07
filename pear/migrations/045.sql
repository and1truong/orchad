CREATE TABLE scorm_engine_launches(
 id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,tenant TEXT NOT NULL,
 registration_id TEXT NOT NULL,attempt_id TEXT NOT NULL,sco_id TEXT NOT NULL,
 session_hash TEXT NOT NULL,auth_version INTEGER NOT NULL,expires INTEGER NOT NULL,
 closed INTEGER NOT NULL DEFAULT 0 CHECK(closed IN(0,1)),
 finished INTEGER NOT NULL DEFAULT 0 CHECK(finished IN(0,1)),
 sequence INTEGER NOT NULL DEFAULT 0 CHECK(sequence>=0),
 session_seconds REAL NOT NULL DEFAULT 0 CHECK(session_seconds>=0),
 initial_state TEXT NOT NULL CHECK(json_valid(initial_state)),
 created_at TEXT NOT NULL,
 FOREIGN KEY(registration_id,tenant) REFERENCES scorm_registrations(id,tenant),
 FOREIGN KEY(attempt_id,tenant) REFERENCES scorm_engine_attempts(id,tenant)
);
CREATE TABLE scorm_engine_checkpoints(
 launch_id TEXT NOT NULL REFERENCES scorm_engine_launches(id),sequence INTEGER NOT NULL CHECK(sequence>0),
 payload_hash TEXT NOT NULL,result TEXT NOT NULL CHECK(json_valid(result)),
 PRIMARY KEY(launch_id,sequence)
);
INSERT INTO schema_version VALUES(45);
