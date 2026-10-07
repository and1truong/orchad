ALTER TABLE scorm_engine_launches ADD COLUMN sco_attempt_number INTEGER NOT NULL DEFAULT 1 CHECK(sco_attempt_number>0);
INSERT INTO schema_version VALUES(47);
