CREATE TABLE assigned_quiz_reviews(
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,source_enrollment TEXT NOT NULL REFERENCES enrollments(id),
 owner TEXT NOT NULL REFERENCES accounts(id),learner TEXT NOT NULL REFERENCES accounts(id),
 target_version INTEGER NOT NULL CHECK(target_version>0),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','accepted')),
 created_at TEXT NOT NULL,expires_at TEXT NOT NULL,successor TEXT REFERENCES enrollments(id),
 UNIQUE(source_enrollment,target_version)
);
INSERT INTO schema_version(version) VALUES(37);
