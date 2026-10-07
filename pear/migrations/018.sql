CREATE TABLE integration_events(
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE DEFAULT(lower(hex(randomblob(16)))),
 tenant TEXT NOT NULL,topic TEXT NOT NULL,resource_id TEXT NOT NULL,data TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX integration_events_tenant ON integration_events(tenant,sequence);
CREATE TABLE webhook_subscriptions(
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,owner TEXT NOT NULL REFERENCES accounts(id),auth_version INTEGER NOT NULL,
 endpoint_id TEXT NOT NULL,config_hash TEXT NOT NULL,topics TEXT NOT NULL,start_sequence INTEGER NOT NULL,cursor INTEGER NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),created_at TEXT NOT NULL
);
CREATE TABLE webhook_deliveries(
 subscription_id TEXT NOT NULL REFERENCES webhook_subscriptions(id),event_sequence INTEGER NOT NULL REFERENCES integration_events(sequence),
 state TEXT NOT NULL CHECK(state IN('pending','sending','delivered','failed')),attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt INTEGER NOT NULL DEFAULT 0,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0,last_status INTEGER,
 PRIMARY KEY(subscription_id,event_sequence)
);
CREATE TRIGGER integration_enrollment_created AFTER INSERT ON enrollments BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'enrollment.created',NEW.id,
 json_object('enrollmentId',NEW.id,'learnerId',NEW.learner,'courseId',NEW.course_id,'version',NEW.version,'dueDate',NEW.due_date));
END;
CREATE TRIGGER integration_enrollment_completed AFTER UPDATE OF status ON enrollments
 WHEN NEW.status='completed' AND OLD.status!='completed' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'enrollment.completed',NEW.id,
 json_object('enrollmentId',NEW.id,'learnerId',NEW.learner,'courseId',NEW.course_id,'version',NEW.version,'completedAt',NEW.completed_at));
END;
CREATE TRIGGER integration_course_created AFTER INSERT ON courses WHEN NEW.state='published' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'content.published',NEW.id,json_object('courseId',NEW.id,'version',NEW.latest_version));
END;
CREATE TRIGGER integration_course_published AFTER UPDATE ON courses
 WHEN NEW.state='published' AND (OLD.state!='published' OR OLD.latest_version!=NEW.latest_version) BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'content.published',NEW.id,json_object('courseId',NEW.id,'version',NEW.latest_version));
END;
CREATE TRIGGER integration_course_retired AFTER UPDATE OF state ON courses WHEN NEW.state='retired' AND OLD.state!='retired' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data) VALUES(NEW.tenant,'content.retired',NEW.id,json_object('courseId',NEW.id,'version',NEW.latest_version));
END;
INSERT INTO schema_version VALUES(18);
