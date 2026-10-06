PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS accounts(
  id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('learner','manager','content_admin','assessor','admin')),
  org_id TEXT NOT NULL,
  manager_id TEXT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY,
  principal TEXT NOT NULL REFERENCES accounts(id),
  csrf TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS content(
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('item','course','playlist','award')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  provider TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  level TEXT NOT NULL DEFAULT 'beginner',
  language TEXT NOT NULL DEFAULT 'vi',
  skills TEXT NOT NULL DEFAULT '[]',
  topics TEXT NOT NULL DEFAULT '[]',
  industry TEXT NOT NULL DEFAULT '',
  accessibility INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','retiring','retired')),
  egress TEXT NOT NULL DEFAULT 'model_ok' CHECK(egress IN ('model_ok','no_model')),
  license TEXT NOT NULL DEFAULT 'synthetic',
  draft TEXT NOT NULL DEFAULT '{}',
  draft_revision INTEGER NOT NULL DEFAULT 0,
  latest_version INTEGER NOT NULL DEFAULT 0,
  replaced_by TEXT,
  created_by TEXT NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS content_versions(
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL REFERENCES content(id),
  org_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  published_at TEXT NOT NULL,
  published_by TEXT NOT NULL,
  UNIQUE(content_id,version)
);
CREATE TABLE IF NOT EXISTS groups(
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'static' CHECK(kind IN ('static','dynamic'))
);
CREATE TABLE IF NOT EXISTS group_members(
  group_id TEXT NOT NULL REFERENCES groups(id),
  user_id TEXT NOT NULL REFERENCES accounts(id),
  PRIMARY KEY(group_id,user_id)
);
CREATE TABLE IF NOT EXISTS enrollments(
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  learner TEXT NOT NULL REFERENCES accounts(id),
  content_id TEXT NOT NULL REFERENCES content(id),
  content_version_id TEXT NOT NULL REFERENCES content_versions(id),
  status TEXT NOT NULL CHECK(status IN ('assigned','enrolled','completed')),
  assignment_id TEXT,
  due_at TEXT,
  created TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(learner,content_id)
);
CREATE TABLE IF NOT EXISTS progress(
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id),
  lesson_id TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY(enrollment_id,lesson_id)
);
CREATE TABLE IF NOT EXISTS attempts(
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id),
  quiz_id TEXT NOT NULL,
  quiz_version_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','graded','pending_assessment')),
  answers TEXT NOT NULL DEFAULT '{}',
  score REAL,
  passed INTEGER,
  attempt_no INTEGER NOT NULL,
  started TEXT NOT NULL,
  submitted TEXT
);
CREATE TABLE IF NOT EXISTS assignments(
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  content_id TEXT NOT NULL REFERENCES content(id),
  created_by TEXT NOT NULL,
  audience TEXT NOT NULL,
  due_kind TEXT NOT NULL CHECK(due_kind IN ('fixed','rolling','none')),
  due_at TEXT,
  rolling_days INTEGER,
  starts_at TEXT,
  recurrence TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed','cancelled')),
  created TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assignment_targets(
  assignment_id TEXT NOT NULL REFERENCES assignments(id),
  user_id TEXT NOT NULL REFERENCES accounts(id),
  PRIMARY KEY(assignment_id,user_id)
);
CREATE TABLE IF NOT EXISTS bookmarks(
  org_id TEXT NOT NULL,
  learner TEXT NOT NULL REFERENCES accounts(id),
  content_id TEXT NOT NULL REFERENCES content(id),
  saved INTEGER NOT NULL DEFAULT 1,
  updated TEXT NOT NULL,
  PRIMARY KEY(learner,content_id)
);
-- ADR 0001: documentId aggregate revision ledger. id form is kind:entityId
-- (workspace:{userId}, enrollment:{id}, course:{id}, org:{orgId}).
CREATE TABLE IF NOT EXISTS aggregates(
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0)
);
CREATE TABLE IF NOT EXISTS idempotency(
  principal TEXT NOT NULL,
  document_id TEXT NOT NULL,
  key TEXT NOT NULL,
  semantic TEXT NOT NULL,
  result TEXT NOT NULL,
  PRIMARY KEY(principal,document_id,key)
);
CREATE TABLE IF NOT EXISTS audit(
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL,
  principal TEXT NOT NULL,
  request_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  before_revision INTEGER,
  after_revision INTEGER,
  result TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO schema_migrations VALUES(1);
