CREATE TABLE integration_clients(
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,owner TEXT NOT NULL REFERENCES accounts(id),auth_version INTEGER NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,name TEXT NOT NULL,scopes TEXT NOT NULL,created_at TEXT NOT NULL,expires INTEGER NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1))
);
CREATE TABLE integration_requests(
 client_id TEXT NOT NULL REFERENCES integration_clients(id),operation_key TEXT NOT NULL,payload_hash TEXT NOT NULL,
 response TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(client_id,operation_key)
);
CREATE TABLE scim_users(
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,client_id TEXT NOT NULL REFERENCES integration_clients(id),user_id TEXT NOT NULL UNIQUE REFERENCES accounts(id),
 user_name TEXT NOT NULL,user_name_key TEXT NOT NULL,external_id TEXT,created_at TEXT NOT NULL,modified_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,
 deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN(0,1)),UNIQUE(tenant,user_name_key)
);
CREATE TABLE scim_groups(
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,client_id TEXT NOT NULL REFERENCES integration_clients(id),group_id TEXT NOT NULL UNIQUE REFERENCES learning_groups(id),
 external_id TEXT,created_at TEXT NOT NULL,modified_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,
 deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN(0,1))
);
INSERT INTO schema_version VALUES(17);
