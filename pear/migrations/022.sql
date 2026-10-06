CREATE TRIGGER integration_item_published AFTER INSERT ON content_items WHEN NEW.state='published' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'item.published',NEW.id,json_object('itemId',NEW.id,'version',NEW.latest_version));
END;
CREATE TRIGGER integration_item_republished AFTER UPDATE ON content_items WHEN NEW.state='published' AND (OLD.state!='published' OR OLD.latest_version!=NEW.latest_version) BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'item.published',NEW.id,json_object('itemId',NEW.id,'version',NEW.latest_version));
END;
CREATE TRIGGER integration_item_retired AFTER UPDATE OF state ON content_items WHEN NEW.state='retired' AND OLD.state!='retired' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'item.retired',NEW.id,json_object('itemId',NEW.id,'version',NEW.latest_version));
END;
CREATE TRIGGER integration_collection_published AFTER UPDATE ON collections WHEN NEW.state='published' AND (OLD.state!='published' OR OLD.latest_version!=NEW.latest_version) AND (SELECT json_extract(content,'$.access') FROM collection_versions WHERE collection_id=NEW.id AND version=NEW.latest_version)='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'collection.published',NEW.id,json_object('collectionId',NEW.id,'kind',NEW.kind,'version',NEW.latest_version));
END;
CREATE TRIGGER integration_collection_retired AFTER UPDATE OF state ON collections WHEN NEW.state='retired' AND OLD.state!='retired' AND (SELECT json_extract(content,'$.access') FROM collection_versions WHERE collection_id=NEW.id AND version=NEW.latest_version)='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'collection.retired',NEW.id,json_object('collectionId',NEW.id,'kind',NEW.kind,'version',NEW.latest_version));
END;
CREATE TRIGGER integration_item_enrolled AFTER INSERT ON item_enrollments BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'item.enrolled',NEW.id,json_object('itemEnrollmentId',NEW.id,'learnerId',NEW.learner,'itemId',NEW.item_id,'version',NEW.version));
END;
CREATE TRIGGER integration_item_completed AFTER UPDATE OF completed_at ON item_enrollments WHEN NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'item.completed',NEW.id,json_object('itemEnrollmentId',NEW.id,'learnerId',NEW.learner,'itemId',NEW.item_id,'version',NEW.version,'completedAt',NEW.completed_at));
END;
CREATE TRIGGER integration_award_enrolled AFTER INSERT ON award_enrollments WHEN (SELECT json_extract(content,'$.access') FROM collection_versions WHERE collection_id=NEW.award_id AND version=NEW.version)='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'award.enrolled',NEW.id,json_object('awardEnrollmentId',NEW.id,'learnerId',NEW.learner,'awardId',NEW.award_id,'version',NEW.version));
END;
CREATE TRIGGER integration_award_completed AFTER UPDATE OF completed_at ON award_enrollments WHEN NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL AND (SELECT json_extract(content,'$.access') FROM collection_versions WHERE collection_id=NEW.award_id AND version=NEW.version)='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'award.completed',NEW.id,json_object('awardEnrollmentId',NEW.id,'learnerId',NEW.learner,'awardId',NEW.award_id,'version',NEW.version,'completedAt',NEW.completed_at));
END;
CREATE TRIGGER integration_assignment_created AFTER INSERT ON assignment_plans BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'assignment.changed',NEW.id,json_object('assignmentPlanId',NEW.id,'version',NEW.version,'state',NEW.state));
END;
CREATE TRIGGER integration_assignment_changed AFTER UPDATE ON assignment_plans WHEN NEW.version!=OLD.version OR NEW.state!=OLD.state BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'assignment.changed',NEW.id,json_object('assignmentPlanId',NEW.id,'version',NEW.version,'state',NEW.state));
END;
CREATE TRIGGER integration_assignment_notification AFTER INSERT ON learning_notifications BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'assignment.notification_created',NEW.id,json_object('notificationId',NEW.id,'learnerId',NEW.learner,'cycleId',NEW.cycle_id,'kind',NEW.kind));
END;
CREATE TRIGGER integration_enrollment_assignment AFTER UPDATE OF assignment_state ON enrollments WHEN NEW.assignment_state!=OLD.assignment_state BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'enrollment.assignment_changed',NEW.id,json_object('enrollmentId',NEW.id,'learnerId',NEW.learner,'cycleId',NEW.assignment_cycle_id,'assignmentState',NEW.assignment_state));
END;
CREATE TRIGGER integration_award_assignment AFTER UPDATE OF assignment_state ON award_enrollments WHEN NEW.assignment_state!=OLD.assignment_state AND (SELECT json_extract(content,'$.access') FROM collection_versions WHERE collection_id=NEW.award_id AND version=NEW.version)='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'award.assignment_changed',NEW.id,json_object('awardEnrollmentId',NEW.id,'learnerId',NEW.learner,'cycleId',NEW.assignment_cycle_id,'assignmentState',NEW.assignment_state));
END;
INSERT INTO schema_version VALUES(22);
