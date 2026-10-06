ALTER TABLE external_records ADD COLUMN asset_id TEXT REFERENCES assets(id);
INSERT INTO schema_version(version) VALUES(10);
