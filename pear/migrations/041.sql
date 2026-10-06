CREATE TABLE item_enrollments_041(
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, learner TEXT NOT NULL REFERENCES accounts(id),
 item_id TEXT NOT NULL, version INTEGER NOT NULL,
 enrolled_at TEXT NOT NULL, completed_at TEXT, retake_of TEXT REFERENCES item_enrollments_041(id),
 FOREIGN KEY(item_id,version) REFERENCES content_item_versions(item_id,version)
);
INSERT INTO item_enrollments_041(id,tenant,learner,item_id,version,enrolled_at,completed_at)
 SELECT id,tenant,learner,item_id,version,enrolled_at,completed_at FROM item_enrollments ORDER BY rowid;
DROP TABLE item_enrollments;
ALTER TABLE item_enrollments_041 RENAME TO item_enrollments;
CREATE INDEX item_enrollment_scope ON item_enrollments(tenant,learner);
CREATE UNIQUE INDEX item_original_version ON item_enrollments(learner,item_id,version) WHERE retake_of IS NULL;
CREATE UNIQUE INDEX item_retake_source ON item_enrollments(retake_of) WHERE retake_of IS NOT NULL;
INSERT INTO schema_version(version) VALUES(41);
