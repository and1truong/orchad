CREATE TABLE question_banks(
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,owner TEXT NOT NULL REFERENCES accounts(id),
 state TEXT NOT NULL CHECK(state IN('published','retired')),latest_version INTEGER NOT NULL
);
CREATE TABLE question_bank_versions(
 bank_id TEXT NOT NULL REFERENCES question_banks(id),version INTEGER NOT NULL CHECK(version BETWEEN 1 AND 100),
 content TEXT NOT NULL,PRIMARY KEY(bank_id,version)
);
INSERT INTO schema_version VALUES(26);
