CREATE TABLE xapi_statements(
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,tenant TEXT NOT NULL,
 client_id TEXT NOT NULL REFERENCES integration_clients(id),user_id TEXT NOT NULL REFERENCES accounts(id),
 course_id TEXT NOT NULL,version INTEGER NOT NULL,registration TEXT NOT NULL,timestamp TEXT NOT NULL,
 stored TEXT NOT NULL,payload_hash TEXT NOT NULL,statement TEXT NOT NULL,
 FOREIGN KEY(course_id,version) REFERENCES course_versions(course_id,version)
);
CREATE INDEX xapi_actor ON xapi_statements(tenant,user_id,timestamp,id);
CREATE INDEX xapi_client ON xapi_statements(client_id,sequence);
INSERT INTO schema_version VALUES(20);
