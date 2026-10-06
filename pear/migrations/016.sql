CREATE TABLE identity_links(
 tenant TEXT NOT NULL,issuer TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES accounts(id),created_at TEXT NOT NULL,
 PRIMARY KEY(issuer,subject),UNIQUE(issuer,user_id)
);
CREATE TABLE identity_transactions(
 state_hash TEXT PRIMARY KEY,binding_hash TEXT NOT NULL,nonce TEXT NOT NULL,verifier TEXT NOT NULL,
 expires INTEGER NOT NULL,previous_token_hash TEXT,provider_hash TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0 CHECK(used IN(0,1))
);
INSERT INTO schema_version VALUES(16);
