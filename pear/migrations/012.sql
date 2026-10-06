CREATE TABLE item_enrollments(
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, learner TEXT NOT NULL REFERENCES accounts(id),
 item_id TEXT NOT NULL, version INTEGER NOT NULL,
 enrolled_at TEXT NOT NULL, completed_at TEXT,
 UNIQUE(learner,item_id,version),
 FOREIGN KEY(item_id,version) REFERENCES content_item_versions(item_id,version)
);
CREATE INDEX item_enrollment_scope ON item_enrollments(tenant,learner);
INSERT INTO schema_version VALUES(12);
