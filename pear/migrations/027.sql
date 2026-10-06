ALTER TABLE enrollments ADD COLUMN retake_of TEXT REFERENCES enrollments(id);
DROP INDEX enrollment_direct;
CREATE UNIQUE INDEX enrollment_direct ON enrollments(learner,course_id) WHERE assignment_cycle_id IS NULL AND retake_of IS NULL;
CREATE UNIQUE INDEX enrollment_retake ON enrollments(retake_of) WHERE retake_of IS NOT NULL;
INSERT INTO schema_version VALUES(27);
