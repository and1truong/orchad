-- Learner-owned working stores; official proofs/history stay immutable elsewhere.
CREATE TABLE scorm_system_objectives(
 tenant TEXT NOT NULL, learner TEXT NOT NULL, target_id TEXT NOT NULL CHECK(length(target_id) BETWEEN 1 AND 4000),
 state TEXT NOT NULL CHECK(length(state)<=16384 AND json_valid(state)), revision INTEGER NOT NULL CHECK(revision>0),
 source_registration_id TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(tenant,learner,target_id),
 FOREIGN KEY(learner,tenant) REFERENCES accounts(id,tenant),
 FOREIGN KEY(source_registration_id,tenant) REFERENCES scorm_registrations(id,tenant)
);
CREATE TRIGGER scorm_system_objectives_identity BEFORE UPDATE OF tenant,learner,target_id ON scorm_system_objectives
BEGIN SELECT RAISE(ABORT,'SCORM system store identity is immutable'); END;
INSERT INTO schema_version VALUES(50);
