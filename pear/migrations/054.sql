CREATE TABLE cmi5_learning_bindings(
 registration_id TEXT PRIMARY KEY REFERENCES cmi5_registrations(id),
 tenant TEXT NOT NULL, learner TEXT NOT NULL REFERENCES accounts(id), binding_key TEXT NOT NULL,
 course_enrollment_id TEXT REFERENCES enrollments(id), lesson_id TEXT,
 item_enrollment_id TEXT REFERENCES item_enrollments(id), context TEXT NOT NULL,
 UNIQUE(tenant,learner,binding_key),
 CHECK((course_enrollment_id IS NOT NULL AND lesson_id IS NOT NULL AND item_enrollment_id IS NULL)
 OR (course_enrollment_id IS NULL AND lesson_id IS NULL AND item_enrollment_id IS NOT NULL))
);
CREATE TABLE cmi5_completion_proofs(
 registration_id TEXT PRIMARY KEY REFERENCES cmi5_learning_bindings(registration_id),
 tenant TEXT NOT NULL, proof TEXT NOT NULL, projected_at TEXT NOT NULL
);
CREATE TRIGGER cmi5_proof_immutable_update BEFORE UPDATE ON cmi5_completion_proofs BEGIN SELECT RAISE(ABORT,'cmi5 completion proof is immutable'); END;
CREATE TRIGGER cmi5_proof_immutable_delete BEFORE DELETE ON cmi5_completion_proofs BEGIN SELECT RAISE(ABORT,'cmi5 completion proof is immutable'); END;
CREATE TRIGGER cmi5_binding_immutable_update BEFORE UPDATE ON cmi5_learning_bindings BEGIN SELECT RAISE(ABORT,'cmi5 learning binding is immutable'); END;
CREATE TRIGGER cmi5_binding_immutable_delete BEFORE DELETE ON cmi5_learning_bindings BEGIN SELECT RAISE(ABORT,'cmi5 learning binding is immutable'); END;
INSERT INTO schema_version VALUES(54);
