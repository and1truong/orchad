ALTER TABLE cmi5_state ADD COLUMN bytes BLOB;
ALTER TABLE cmi5_state ADD COLUMN content_type TEXT NOT NULL DEFAULT 'application/json';
CREATE TABLE cmi5_documents(
 tenant TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN('agent','activity','global-state')),
 subject TEXT NOT NULL, profile_id TEXT NOT NULL,
 bytes BLOB NOT NULL, content_type TEXT NOT NULL, etag TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(tenant,kind,subject,profile_id)
);
INSERT INTO schema_version VALUES(53);
