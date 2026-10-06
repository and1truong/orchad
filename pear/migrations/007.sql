ALTER TABLE attempts ADD COLUMN presentation TEXT;
ALTER TABLE attempts ADD COLUMN feedback_released INTEGER NOT NULL DEFAULT 0 CHECK(feedback_released IN (0,1));
ALTER TABLE attempts ADD COLUMN grading_state TEXT NOT NULL DEFAULT 'draft' CHECK(grading_state IN ('draft','pending_manual','graded'));
UPDATE attempts SET grading_state='graded' WHERE submitted=1;
CREATE TABLE course_assessors(course_id TEXT NOT NULL REFERENCES courses(id),assessor_id TEXT NOT NULL REFERENCES accounts(id),PRIMARY KEY(course_id,assessor_id));
CREATE TABLE essay_reviews(attempt_id TEXT NOT NULL REFERENCES attempts(id),question_id TEXT NOT NULL,assessor TEXT NOT NULL REFERENCES accounts(id),points INTEGER NOT NULL,reason TEXT NOT NULL,reviewed_at TEXT NOT NULL,PRIMARY KEY(attempt_id,question_id));
CREATE TABLE assessment_resets(enrollment_id TEXT PRIMARY KEY REFERENCES enrollments(id),extra_attempts INTEGER NOT NULL DEFAULT 0);
INSERT INTO schema_version VALUES(7);
