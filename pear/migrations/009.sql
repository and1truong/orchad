ALTER TABLE assets ADD COLUMN purpose TEXT NOT NULL DEFAULT 'content';
ALTER TABLE assets ADD COLUMN context_json TEXT NOT NULL DEFAULT '{}';
CREATE TABLE submissions(id TEXT PRIMARY KEY,enrollment_id TEXT NOT NULL REFERENCES enrollments(id),lesson_id TEXT NOT NULL,asset_id TEXT NOT NULL REFERENCES assets(id),number INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'pending',submitted_at TEXT NOT NULL,assessor TEXT REFERENCES accounts(id),points INTEGER,reason TEXT,reviewed_at TEXT,UNIQUE(enrollment_id,lesson_id,number));
CREATE TABLE event_sessions(id TEXT PRIMARY KEY,tenant TEXT NOT NULL,course_id TEXT NOT NULL REFERENCES courses(id),lesson_id TEXT NOT NULL,definition TEXT NOT NULL);
CREATE TABLE bookings(id TEXT PRIMARY KEY,enrollment_id TEXT NOT NULL REFERENCES enrollments(id),lesson_id TEXT NOT NULL,session_id TEXT NOT NULL REFERENCES event_sessions(id),learner TEXT NOT NULL REFERENCES accounts(id),state TEXT NOT NULL,booked_at TEXT NOT NULL,assessor TEXT REFERENCES accounts(id),reason TEXT,reviewed_at TEXT);
CREATE UNIQUE INDEX booking_active_lesson ON bookings(enrollment_id,lesson_id) WHERE state='booked';
CREATE UNIQUE INDEX booking_active_person ON bookings(session_id,learner) WHERE state='booked';
INSERT INTO schema_version VALUES(9);
