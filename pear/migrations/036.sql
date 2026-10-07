CREATE TABLE original_collection_offers(
 id TEXT PRIMARY KEY, source_tenant TEXT NOT NULL, source_admin TEXT NOT NULL REFERENCES accounts(id),
 source_collection TEXT NOT NULL REFERENCES collections(id), source_version INTEGER NOT NULL,
 destination_tenant TEXT NOT NULL, destination_admin TEXT NOT NULL REFERENCES accounts(id), destination_collection TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('award','playlist')), snapshot TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','cancelled')),
 version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0 AND version<=1), created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 accepted_collection TEXT REFERENCES collections(id), cancelled_reason TEXT
);
CREATE INDEX collection_offer_receiver ON original_collection_offers(destination_tenant,destination_admin,created_at);
CREATE INDEX collection_offer_source ON original_collection_offers(source_tenant,source_admin,created_at);
INSERT INTO schema_version VALUES(36);
