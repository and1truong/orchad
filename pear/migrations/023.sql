CREATE TRIGGER integration_course_unpublished AFTER UPDATE OF state ON courses WHEN OLD.state='published' AND NEW.state='draft' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'content.unpublished',NEW.id,json_object('courseId',NEW.id,'version',NEW.latest_version));
END;
CREATE TRIGGER integration_item_unpublished AFTER UPDATE OF state ON content_items WHEN OLD.state='published' AND NEW.state='draft' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'item.unpublished',NEW.id,json_object('itemId',NEW.id,'version',NEW.latest_version));
END;
CREATE TRIGGER integration_collection_unpublished AFTER UPDATE OF state ON collections WHEN OLD.state='published' AND NEW.state='draft' AND (SELECT json_extract(content,'$.access') FROM collection_versions WHERE collection_id=NEW.id AND version=NEW.latest_version)='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'collection.unpublished',NEW.id,json_object('collectionId',NEW.id,'kind',NEW.kind,'version',NEW.latest_version));
END;
INSERT INTO schema_version VALUES(23);
