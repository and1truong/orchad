CREATE TABLE quiz_attempt_previous (
 attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
 source_attempt_id TEXT NOT NULL REFERENCES attempts(id)
);
CREATE TABLE quiz_retry_carries (
 attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
 question_id TEXT NOT NULL,
 source_attempt_id TEXT NOT NULL REFERENCES attempts(id),
 PRIMARY KEY(attempt_id,question_id)
);
INSERT INTO schema_version(version) VALUES(34);
