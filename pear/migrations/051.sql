CREATE TABLE user_invitations(
 id TEXT PRIMARY KEY,
 tenant TEXT NOT NULL,
 issuer TEXT NOT NULL,
 client_id TEXT NOT NULL,
 subject TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES accounts(id),
 user_auth_version INTEGER NOT NULL,
 owner TEXT NOT NULL REFERENCES accounts(id),
 owner_auth_version INTEGER NOT NULL,
 recipient TEXT NOT NULL,
 created_at TEXT NOT NULL,
 expires INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','accepted','revoked','expired')),
 delivery TEXT NOT NULL DEFAULT 'unsent' CHECK(delivery IN('unsent','sending','accepted','failed')),
 delivery_until INTEGER NOT NULL DEFAULT 0,
 accepted_at TEXT
);
CREATE UNIQUE INDEX invitation_subject ON user_invitations(issuer,subject) WHERE state='pending';
CREATE UNIQUE INDEX invitation_user ON user_invitations(issuer,user_id) WHERE state='pending';
ALTER TABLE identity_transactions ADD COLUMN invitation_id TEXT REFERENCES user_invitations(id);
INSERT INTO schema_version VALUES(51);
