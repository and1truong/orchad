CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO schema_version VALUES(1);
CREATE TABLE IF NOT EXISTS accounts(
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('learner','manager','content_admin','admin','assessor')),
 manager_id TEXT REFERENCES accounts(id), active INTEGER NOT NULL DEFAULT 1, auth_version INTEGER NOT NULL DEFAULT 0,
 password_hash TEXT NOT NULL, salt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, principal TEXT NOT NULL REFERENCES accounts(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL, auth_version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY, tenant TEXT NOT NULL, owner TEXT, revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0));
CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY, tenant TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('draft','published','retired')), draft TEXT NOT NULL, latest_version INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS course_versions(course_id TEXT NOT NULL REFERENCES courses(id), version INTEGER NOT NULL, content TEXT NOT NULL, PRIMARY KEY(course_id,version));
CREATE TABLE IF NOT EXISTS enrollments(
 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, learner TEXT NOT NULL REFERENCES accounts(id), course_id TEXT NOT NULL REFERENCES courses(id), version INTEGER NOT NULL,
 assigned_by TEXT REFERENCES accounts(id), due_date TEXT, completed_lessons TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'in_progress', completed_at TEXT,
 UNIQUE(learner,course_id), FOREIGN KEY(course_id,version) REFERENCES course_versions(course_id,version)
);
CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY, enrollment_id TEXT NOT NULL REFERENCES enrollments(id), number INTEGER NOT NULL, answers TEXT NOT NULL DEFAULT '{}', submitted INTEGER NOT NULL DEFAULT 0, score INTEGER, passed INTEGER, UNIQUE(enrollment_id,number));
CREATE TABLE IF NOT EXISTS bookmarks(learner TEXT NOT NULL REFERENCES accounts(id),course_id TEXT NOT NULL REFERENCES courses(id),PRIMARY KEY(learner,course_id));
CREATE TABLE IF NOT EXISTS certificates(id TEXT PRIMARY KEY,enrollment_id TEXT NOT NULL UNIQUE REFERENCES enrollments(id),issued_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS idempotency(principal TEXT NOT NULL,document_id TEXT NOT NULL,key TEXT NOT NULL,payload TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(principal,document_id,key));
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,tenant TEXT NOT NULL,principal TEXT NOT NULL,document_id TEXT NOT NULL,tool TEXT NOT NULL,arguments TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS enrollment_learner ON enrollments(tenant,learner);
