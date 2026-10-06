CREATE TABLE translation_identities(
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('course','item')),original_id TEXT NOT NULL,
 created_at TEXT NOT NULL,UNIQUE(tenant,kind,original_id)
);
CREATE TABLE translation_variants(
 id TEXT PRIMARY KEY,identity_id TEXT NOT NULL REFERENCES translation_identities(id),tenant TEXT NOT NULL,kind TEXT NOT NULL,
 source_id TEXT NOT NULL,source_version INTEGER NOT NULL,original_version INTEGER NOT NULL,language TEXT NOT NULL CHECK(language IN('en','vi')),
 provenance TEXT NOT NULL CHECK(provenance IN('human_authored','ai_assisted_reviewed')),quality_review TEXT NOT NULL,reviewer TEXT NOT NULL REFERENCES accounts(id),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX active_translation_source ON translation_variants(tenant,kind,source_id) WHERE active=1;
CREATE UNIQUE INDEX active_translation_language ON translation_variants(identity_id,language) WHERE active=1;
INSERT INTO schema_version VALUES(19);
