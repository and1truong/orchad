ALTER TABLE scorm_sco_attempts ADD COLUMN finished INTEGER NOT NULL DEFAULT 0 CHECK(finished IN(0,1));
CREATE UNIQUE INDEX scorm_enrollment_tenant ON enrollments(id,tenant);
CREATE UNIQUE INDEX scorm_item_enrollment_tenant ON item_enrollments(id,tenant);
CREATE TABLE scorm_learning_bindings(
 registration_id TEXT PRIMARY KEY,tenant TEXT NOT NULL,
 course_enrollment_id TEXT,lesson_id TEXT,item_enrollment_id TEXT,
 context TEXT NOT NULL CHECK(json_valid(context)),
 CHECK((course_enrollment_id IS NOT NULL AND lesson_id IS NOT NULL AND item_enrollment_id IS NULL) OR (course_enrollment_id IS NULL AND lesson_id IS NULL AND item_enrollment_id IS NOT NULL)),
 FOREIGN KEY(registration_id,tenant) REFERENCES scorm_registrations(id,tenant),
 FOREIGN KEY(course_enrollment_id,tenant) REFERENCES enrollments(id,tenant),
 FOREIGN KEY(item_enrollment_id,tenant) REFERENCES item_enrollments(id,tenant)
);
CREATE TRIGGER scorm_binding_immutable BEFORE UPDATE ON scorm_learning_bindings BEGIN SELECT RAISE(ABORT,'SCORM learning binding is immutable'); END;
CREATE TABLE scorm_completion_proofs(
 registration_id TEXT NOT NULL,attempt_id TEXT NOT NULL,tenant TEXT NOT NULL,
 evidence TEXT NOT NULL CHECK(json_valid(evidence)),projected_at TEXT NOT NULL,
 PRIMARY KEY(registration_id,attempt_id),
 FOREIGN KEY(registration_id,tenant) REFERENCES scorm_registrations(id,tenant),
 FOREIGN KEY(attempt_id,tenant) REFERENCES scorm_engine_attempts(id,tenant)
);
CREATE TRIGGER scorm_proof_immutable BEFORE UPDATE ON scorm_completion_proofs BEGIN SELECT RAISE(ABORT,'SCORM completion proof is immutable'); END;
INSERT INTO schema_version VALUES(46);
