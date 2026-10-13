CREATE TABLE cmi5_attachments(
 registration_id TEXT NOT NULL REFERENCES cmi5_registrations(id), tenant TEXT NOT NULL,
 sha2 TEXT NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY(registration_id,sha2)
);
CREATE INDEX cmi5_attachment_tenant ON cmi5_attachments(tenant);
CREATE TRIGGER cmi5_attachment_immutable_update BEFORE UPDATE ON cmi5_attachments BEGIN SELECT RAISE(ABORT,'cmi5 attachment is immutable'); END;
CREATE TRIGGER cmi5_attachment_immutable_delete BEFORE DELETE ON cmi5_attachments BEGIN SELECT RAISE(ABORT,'cmi5 attachment is immutable'); END;
INSERT INTO schema_version VALUES(55);
