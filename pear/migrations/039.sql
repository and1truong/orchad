ALTER TABLE assigned_quiz_reviews ADD COLUMN restart_mode TEXT NOT NULL DEFAULT 'objective_only' CHECK(restart_mode IN('objective_only','fresh_course'));
INSERT INTO schema_version(version) VALUES(39);
