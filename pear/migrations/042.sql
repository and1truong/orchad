-- Additive binding and review history. Existing ledgers, triggers and FK IDs stay intact.
CREATE TABLE award_course_bindings(
 id TEXT PRIMARY KEY,award_enrollment_id TEXT NOT NULL REFERENCES award_enrollments(id),
 criterion_path TEXT NOT NULL,course_id TEXT NOT NULL REFERENCES courses(id),
 pinned_version INTEGER NOT NULL,current_version INTEGER NOT NULL,
 course_enrollment_id TEXT REFERENCES enrollments(id),revision INTEGER NOT NULL DEFAULT 0,
 UNIQUE(award_enrollment_id,criterion_path,course_id),
 FOREIGN KEY(course_id,pinned_version) REFERENCES course_versions(course_id,version),
 FOREIGN KEY(course_id,current_version) REFERENCES course_versions(course_id,version)
);
ALTER TABLE enrollments ADD COLUMN award_binding_id TEXT REFERENCES award_course_bindings(id);
DROP INDEX enrollment_direct;
DROP INDEX enrollment_cycle;
CREATE UNIQUE INDEX enrollment_direct ON enrollments(learner,course_id) WHERE assignment_cycle_id IS NULL AND retake_of IS NULL AND award_binding_id IS NULL;
CREATE UNIQUE INDEX enrollment_cycle ON enrollments(learner,assignment_cycle_id,course_id) WHERE assignment_cycle_id IS NOT NULL AND retake_of IS NULL AND award_binding_id IS NULL;
CREATE UNIQUE INDEX enrollment_award_binding ON enrollments(award_binding_id) WHERE award_binding_id IS NOT NULL AND retake_of IS NULL;
CREATE TABLE award_course_reviews(
 id TEXT PRIMARY KEY,binding_id TEXT NOT NULL REFERENCES award_course_bindings(id),
 owner TEXT NOT NULL REFERENCES accounts(id),source_enrollment_id TEXT NOT NULL REFERENCES enrollments(id),
 target_version INTEGER NOT NULL,binding_revision INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','accepted','cancelled','expired')),
 successor TEXT REFERENCES enrollments(id),created_at TEXT NOT NULL,expires_at TEXT NOT NULL
);
CREATE UNIQUE INDEX award_course_pending_review ON award_course_reviews(binding_id) WHERE state='pending';
CREATE TABLE award_completion_snapshots(certificate_id TEXT PRIMARY KEY REFERENCES award_enrollments(certificate_id), progress TEXT NOT NULL, provenance TEXT NOT NULL CHECK(provenance IN ('issuance','legacy_ledger_at_upgrade')));
CREATE TRIGGER immutable_award_snapshot_update BEFORE UPDATE ON award_completion_snapshots BEGIN SELECT RAISE(ABORT,'Immutable award completion snapshot'); END;
CREATE TRIGGER immutable_award_snapshot_delete BEFORE DELETE ON award_completion_snapshots BEGIN SELECT RAISE(ABORT,'Immutable award completion snapshot'); END;
CREATE TABLE webhook_claim_cursor(id INTEGER PRIMARY KEY CHECK(id=1),subscription_id TEXT NOT NULL);
INSERT INTO webhook_claim_cursor VALUES(1,'');
CREATE TRIGGER integration_enrollment_assignment_created AFTER INSERT ON enrollments WHEN NEW.assignment_cycle_id IS NOT NULL BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'enrollment.assignment_changed',NEW.id,json_object('enrollmentId',NEW.id,'learnerId',NEW.learner,'cycleId',NEW.assignment_cycle_id,'assignmentState',NEW.assignment_state));
END;
CREATE TRIGGER integration_award_assignment_created AFTER INSERT ON award_enrollments WHEN NEW.assignment_cycle_id IS NOT NULL AND (SELECT json_extract(content,'$.access') FROM collection_versions WHERE collection_id=NEW.award_id AND version=NEW.version)='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'award.assignment_changed',NEW.id,json_object('awardEnrollmentId',NEW.id,'learnerId',NEW.learner,'cycleId',NEW.assignment_cycle_id,'assignmentState',NEW.assignment_state));
END;
INSERT INTO schema_version VALUES(42);
