ALTER TABLE assigned_quiz_reviews RENAME TO assigned_quiz_reviews_037;
CREATE TABLE assigned_quiz_reviews(
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,source_enrollment TEXT NOT NULL REFERENCES enrollments(id),
 owner TEXT NOT NULL REFERENCES accounts(id),learner TEXT NOT NULL REFERENCES accounts(id),
 target_version INTEGER NOT NULL CHECK(target_version>0),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','accepted','cancelled')),
 created_at TEXT NOT NULL,expires_at TEXT NOT NULL,successor TEXT REFERENCES enrollments(id),
 previous_review TEXT REFERENCES assigned_quiz_reviews(id),cancelled_by TEXT REFERENCES accounts(id)
);
INSERT INTO assigned_quiz_reviews(id,tenant,source_enrollment,owner,learner,target_version,state,created_at,expires_at,successor)
 SELECT id,tenant,source_enrollment,owner,learner,target_version,state,created_at,expires_at,successor FROM assigned_quiz_reviews_037 ORDER BY rowid;
DROP TABLE assigned_quiz_reviews_037;
CREATE INDEX assigned_quiz_review_source ON assigned_quiz_reviews(source_enrollment,target_version,tenant);
INSERT INTO schema_version(version) VALUES(38);
