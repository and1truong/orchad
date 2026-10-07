-- Preserve exact executable pins across direct SQL deletion/replacement/insertion.
CREATE TRIGGER scorm_engine_resource_no_delete BEFORE DELETE ON scorm_engine_resources
BEGIN SELECT RAISE(ABORT,'SCORM package resource is immutable'); END;
CREATE TRIGGER scorm_engine_resource_finalized_insert BEFORE INSERT ON scorm_engine_resources
WHEN EXISTS(SELECT 1 FROM scorm_engine_versions v WHERE v.package_id=NEW.package_id AND v.version=NEW.version AND v.tenant=NEW.tenant AND (v.state!='quarantined' OR v.reviewer IS NOT NULL))
 OR EXISTS(SELECT 1 FROM scorm_registrations r WHERE r.package_id=NEW.package_id AND r.version=NEW.version AND r.tenant=NEW.tenant)
BEGIN SELECT RAISE(ABORT,'SCORM package resource is immutable'); END;
INSERT INTO schema_version VALUES(48);
