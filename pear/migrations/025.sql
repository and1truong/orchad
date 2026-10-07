ALTER TABLE bookings ADD COLUMN session_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN cancelled_at TEXT;
ALTER TABLE bookings ADD COLUMN cancellation_session_revision INTEGER;
CREATE TABLE event_session_changes(
 session_id TEXT NOT NULL REFERENCES event_sessions(id),revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 100),
 kind TEXT NOT NULL CHECK(kind IN ('cancel','reschedule')),definition TEXT NOT NULL,reason TEXT NOT NULL,
 principal TEXT NOT NULL REFERENCES accounts(id),changed_at TEXT NOT NULL,
 PRIMARY KEY(session_id,revision)
);
CREATE TABLE session_notices(
 id TEXT PRIMARY KEY,tenant TEXT NOT NULL,learner TEXT NOT NULL REFERENCES accounts(id),
 enrollment_id TEXT NOT NULL REFERENCES enrollments(id),session_id TEXT NOT NULL REFERENCES event_sessions(id),
 session_revision INTEGER NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT,
 UNIQUE(enrollment_id,session_id,session_revision)
);
CREATE TRIGGER integration_session_changed AFTER INSERT ON event_session_changes
 WHEN COALESCE((SELECT json_extract(v.content,'$.access') FROM event_sessions s JOIN courses c ON c.id=s.course_id JOIN course_versions v ON v.course_id=c.id AND v.version=(SELECT MAX(version) FROM course_versions WHERE course_id=c.id) WHERE s.id=NEW.session_id),'tenant')='tenant' BEGIN
 INSERT INTO integration_events(tenant,topic,resource_id,data)
 SELECT tenant,'session.changed',NEW.session_id,json_object('courseId',course_id,'lessonId',lesson_id,'sessionId',NEW.session_id,'sessionRevision',NEW.revision,'kind',NEW.kind) FROM event_sessions WHERE id=NEW.session_id;
END;
INSERT INTO schema_version VALUES(25);
