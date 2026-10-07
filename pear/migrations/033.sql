CREATE TABLE quiz_question_states (
 attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
 question_id TEXT NOT NULL,
 answer_version INTEGER NOT NULL DEFAULT 0 CHECK(answer_version>=0),
 checked_version INTEGER,
 correct INTEGER CHECK(correct IN(0,1)),
 checked_at TEXT,
 PRIMARY KEY(attempt_id,question_id)
);
INSERT INTO schema_version(version) VALUES(33);
