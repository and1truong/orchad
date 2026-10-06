CREATE TABLE IF NOT EXISTS saved_reports(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,owner TEXT NOT NULL REFERENCES accounts(id),spec TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS saved_report_owner ON saved_reports(tenant,owner,id);
ALTER TABLE award_enrollments ADD COLUMN due_date TEXT;
-- Recover prior award deadlines from the immutable cycle and actual delivery.
UPDATE award_enrollments SET due_date=(
 SELECT CASE json_extract(c.definition,'$.dueKind')
  WHEN 'fixed' THEN c.due_date
  WHEN 'rolling' THEN strftime('%Y-%m-%dT%H:%M:%fZ',d.delivered_at,'+' || json_extract(c.definition,'$.rollingDays') || ' days')
  ELSE NULL END
 FROM assignment_deliveries d JOIN assignment_cycles c ON c.id=d.cycle_id
 WHERE d.award_enrollment_id=award_enrollments.id
) WHERE assignment_cycle_id IS NOT NULL;
UPDATE enrollments SET due_date=(SELECT a.due_date FROM award_enrollments a WHERE a.assignment_cycle_id=enrollments.assignment_cycle_id AND a.learner=enrollments.learner)
 WHERE assignment_cycle_id IS NOT NULL AND due_date IS NULL AND EXISTS(SELECT 1 FROM award_enrollments a WHERE a.assignment_cycle_id=enrollments.assignment_cycle_id AND a.learner=enrollments.learner);
INSERT INTO schema_version VALUES(6);
