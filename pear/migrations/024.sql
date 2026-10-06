CREATE TABLE content_authors(
 tenant TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('course','item')),
 content_id TEXT NOT NULL, owner TEXT NOT NULL REFERENCES accounts(id),
 PRIMARY KEY(tenant,kind,content_id)
);
INSERT INTO content_authors SELECT c.tenant,'course',c.id,(SELECT a.id FROM accounts a WHERE a.tenant=c.tenant AND a.role='admin' ORDER BY a.id LIMIT 1) FROM courses c WHERE EXISTS(SELECT 1 FROM accounts a WHERE a.tenant=c.tenant AND a.role='admin');
INSERT INTO content_authors SELECT c.tenant,'item',c.id,(SELECT a.id FROM accounts a WHERE a.tenant=c.tenant AND a.role='admin' ORDER BY a.id LIMIT 1) FROM content_items c WHERE EXISTS(SELECT 1 FROM accounts a WHERE a.tenant=c.tenant AND a.role='admin');
DROP TRIGGER integration_enrollment_created;
CREATE TRIGGER integration_enrollment_created AFTER INSERT ON enrollments WHEN COALESCE((SELECT json_extract(content,'$.access') FROM course_versions WHERE course_id=NEW.course_id AND version=NEW.version),'tenant')='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'enrollment.created',NEW.id,
 json_object('enrollmentId',NEW.id,'learnerId',NEW.learner,'courseId',NEW.course_id,'version',NEW.version,'dueDate',NEW.due_date));
END;
DROP TRIGGER integration_enrollment_completed;
CREATE TRIGGER integration_enrollment_completed AFTER UPDATE OF status ON enrollments
 WHEN NEW.status='completed' AND OLD.status!='completed' AND COALESCE((SELECT json_extract(content,'$.access') FROM course_versions WHERE course_id=NEW.course_id AND version=NEW.version),'tenant')='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'enrollment.completed',NEW.id,
 json_object('enrollmentId',NEW.id,'learnerId',NEW.learner,'courseId',NEW.course_id,'version',NEW.version,'completedAt',NEW.completed_at));
END;
DROP TRIGGER integration_course_created;
CREATE TRIGGER integration_course_created AFTER INSERT ON courses WHEN NEW.state='published' AND COALESCE((SELECT json_extract(content,'$.access') FROM course_versions WHERE course_id=NEW.id AND version=NEW.latest_version),json_extract(NEW.draft,'$.access'),'tenant')='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'content.published',NEW.id,json_object('courseId',NEW.id,'version',NEW.latest_version));
END;
DROP TRIGGER integration_course_published;
CREATE TRIGGER integration_course_published AFTER UPDATE ON courses
 WHEN NEW.state='published' AND (OLD.state!='published' OR OLD.latest_version!=NEW.latest_version) AND COALESCE((SELECT json_extract(content,'$.access') FROM course_versions WHERE course_id=NEW.id AND version=NEW.latest_version),json_extract(NEW.draft,'$.access'),'tenant')='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'content.published',NEW.id,json_object('courseId',NEW.id,'version',NEW.latest_version));
END;
DROP TRIGGER integration_course_retired;
CREATE TRIGGER integration_course_retired AFTER UPDATE OF state ON courses WHEN NEW.state='retired' AND OLD.state!='retired' AND COALESCE((SELECT json_extract(content,'$.access') FROM course_versions WHERE course_id=NEW.id AND version=NEW.latest_version),json_extract(NEW.draft,'$.access'),'tenant')='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'content.retired',NEW.id,json_object('courseId',NEW.id,'version',NEW.latest_version));
END;
DROP TRIGGER integration_item_published;
CREATE TRIGGER integration_item_published AFTER INSERT ON content_items WHEN NEW.state='published' AND COALESCE((SELECT json_extract(content,'$.access') FROM content_item_versions WHERE item_id=NEW.id AND version=NEW.latest_version),json_extract(NEW.draft,'$.access'),'tenant')='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'item.published',NEW.id,json_object('itemId',NEW.id,'version',NEW.latest_version));
END;
DROP TRIGGER integration_item_republished;
CREATE TRIGGER integration_item_republished AFTER UPDATE ON content_items WHEN NEW.state='published' AND (OLD.state!='published' OR OLD.latest_version!=NEW.latest_version) AND COALESCE((SELECT json_extract(content,'$.access') FROM content_item_versions WHERE item_id=NEW.id AND version=NEW.latest_version),json_extract(NEW.draft,'$.access'),'tenant')='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'item.published',NEW.id,json_object('itemId',NEW.id,'version',NEW.latest_version));
END;
DROP TRIGGER integration_item_retired;
CREATE TRIGGER integration_item_retired AFTER UPDATE OF state ON content_items WHEN NEW.state='retired' AND OLD.state!='retired' AND COALESCE((SELECT json_extract(content,'$.access') FROM content_item_versions WHERE item_id=NEW.id AND version=NEW.latest_version),json_extract(NEW.draft,'$.access'),'tenant')='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'item.retired',NEW.id,json_object('itemId',NEW.id,'version',NEW.latest_version));
END;
DROP TRIGGER integration_item_enrolled;
CREATE TRIGGER integration_item_enrolled AFTER INSERT ON item_enrollments WHEN COALESCE((SELECT json_extract(content,'$.access') FROM content_item_versions WHERE item_id=NEW.item_id AND version=NEW.version),'tenant')='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'item.enrolled',NEW.id,json_object('itemEnrollmentId',NEW.id,'learnerId',NEW.learner,'itemId',NEW.item_id,'version',NEW.version));
END;
DROP TRIGGER integration_item_completed;
CREATE TRIGGER integration_item_completed AFTER UPDATE OF completed_at ON item_enrollments WHEN NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL AND COALESCE((SELECT json_extract(content,'$.access') FROM content_item_versions WHERE item_id=NEW.item_id AND version=NEW.version),'tenant')='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'item.completed',NEW.id,json_object('itemEnrollmentId',NEW.id,'learnerId',NEW.learner,'itemId',NEW.item_id,'version',NEW.version,'completedAt',NEW.completed_at));
END;
DROP TRIGGER integration_enrollment_assignment;
CREATE TRIGGER integration_enrollment_assignment AFTER UPDATE OF assignment_state ON enrollments WHEN NEW.assignment_state!=OLD.assignment_state AND COALESCE((SELECT json_extract(content,'$.access') FROM course_versions WHERE course_id=NEW.course_id AND version=NEW.version),'tenant')='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'enrollment.assignment_changed',NEW.id,json_object('enrollmentId',NEW.id,'learnerId',NEW.learner,'cycleId',NEW.assignment_cycle_id,'assignmentState',NEW.assignment_state));
END;
DROP TRIGGER integration_course_unpublished;
CREATE TRIGGER integration_course_unpublished AFTER UPDATE OF state ON courses WHEN OLD.state='published' AND NEW.state='draft' AND COALESCE((SELECT json_extract(content,'$.access') FROM course_versions WHERE course_id=NEW.id AND version=NEW.latest_version),json_extract(NEW.draft,'$.access'),'tenant')='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'content.unpublished',NEW.id,json_object('courseId',NEW.id,'version',NEW.latest_version));
END;
DROP TRIGGER integration_item_unpublished;
CREATE TRIGGER integration_item_unpublished AFTER UPDATE OF state ON content_items WHEN OLD.state='published' AND NEW.state='draft' AND COALESCE((SELECT json_extract(content,'$.access') FROM content_item_versions WHERE item_id=NEW.id AND version=NEW.latest_version),json_extract(NEW.draft,'$.access'),'tenant')='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'item.unpublished',NEW.id,json_object('itemId',NEW.id,'version',NEW.latest_version));
END;
DROP TRIGGER integration_assignment_created;
CREATE TRIGGER integration_assignment_created AFTER INSERT ON assignment_plans WHEN CASE json_extract(NEW.definition,'$.targetKind') WHEN 'course' THEN COALESCE((SELECT json_extract(content,'$.access') FROM course_versions WHERE course_id=json_extract(NEW.definition,'$.targetId') AND version=NEW.target_version),'tenant') WHEN 'award' THEN (SELECT json_extract(content,'$.access') FROM collection_versions WHERE collection_id=json_extract(NEW.definition,'$.targetId') AND version=NEW.target_version) ELSE NULL END='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'assignment.changed',NEW.id,json_object('assignmentPlanId',NEW.id,'version',NEW.version,'state',NEW.state));
END;
DROP TRIGGER integration_assignment_changed;
CREATE TRIGGER integration_assignment_changed AFTER UPDATE ON assignment_plans WHEN (NEW.version!=OLD.version OR NEW.state!=OLD.state) AND CASE json_extract(NEW.definition,'$.targetKind') WHEN 'course' THEN COALESCE((SELECT json_extract(content,'$.access') FROM course_versions WHERE course_id=json_extract(NEW.definition,'$.targetId') AND version=NEW.target_version),'tenant') WHEN 'award' THEN (SELECT json_extract(content,'$.access') FROM collection_versions WHERE collection_id=json_extract(NEW.definition,'$.targetId') AND version=NEW.target_version) ELSE NULL END='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'assignment.changed',NEW.id,json_object('assignmentPlanId',NEW.id,'version',NEW.version,'state',NEW.state));
END;
DROP TRIGGER integration_assignment_notification;
CREATE TRIGGER integration_assignment_notification AFTER INSERT ON learning_notifications WHEN (SELECT CASE target_kind WHEN 'course' THEN COALESCE((SELECT json_extract(content,'$.access') FROM course_versions WHERE course_id=target_id AND version=target_version),'tenant') WHEN 'award' THEN (SELECT json_extract(content,'$.access') FROM collection_versions WHERE collection_id=target_id AND version=target_version) ELSE NULL END='tenant' FROM assignment_cycles WHERE id=NEW.cycle_id) BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'assignment.notification_created',NEW.id,json_object('notificationId',NEW.id,'learnerId',NEW.learner,'cycleId',NEW.cycle_id,'kind',NEW.kind));
END;
INSERT INTO schema_version VALUES(24);
