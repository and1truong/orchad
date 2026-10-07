CREATE TABLE course_feedback(
 tenant TEXT NOT NULL, learner TEXT NOT NULL REFERENCES accounts(id),
 course_id TEXT NOT NULL, version INTEGER NOT NULL,
 enrollment_id TEXT NOT NULL REFERENCES enrollments(id),
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(learner,course_id,version),
 FOREIGN KEY(course_id,version) REFERENCES course_versions(course_id,version)
);
CREATE INDEX course_feedback_scope ON course_feedback(tenant,course_id,version);
INSERT INTO schema_version VALUES(11);
