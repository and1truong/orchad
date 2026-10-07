CREATE TABLE IF NOT EXISTS study_totals (
  tenant TEXT NOT NULL, learner TEXT NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL CHECK(kind IN ('course','item')), target_id TEXT NOT NULL,
  enrollment_id TEXT REFERENCES enrollments(id), item_enrollment_id TEXT REFERENCES item_enrollments(id),
  elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_ms>=0),
  PRIMARY KEY(kind,target_id),
  CHECK((kind='course' AND enrollment_id=target_id AND item_enrollment_id IS NULL) OR
        (kind='item' AND item_enrollment_id=target_id AND enrollment_id IS NULL))
);
CREATE TABLE IF NOT EXISTS study_sessions (
  learner TEXT PRIMARY KEY REFERENCES accounts(id), tenant TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('course','item')), target_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE, binding TEXT NOT NULL, last_at INTEGER NOT NULL,
  FOREIGN KEY(kind,target_id) REFERENCES study_totals(kind,target_id)
);
INSERT OR IGNORE INTO schema_version VALUES(13);
