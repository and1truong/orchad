-- Retain one original root course per cycle; reviewed successors use retake_of.
DROP INDEX enrollment_cycle;
CREATE UNIQUE INDEX enrollment_cycle ON enrollments(learner,assignment_cycle_id,course_id) WHERE assignment_cycle_id IS NOT NULL AND retake_of IS NULL;
ALTER TABLE assignment_deliveries ADD COLUMN review_id TEXT REFERENCES assigned_quiz_reviews(id);
ALTER TABLE assignment_deliveries ADD COLUMN original_enrollment_id TEXT REFERENCES enrollments(id);
INSERT INTO schema_version(version) VALUES(40);
