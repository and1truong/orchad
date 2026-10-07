CREATE TABLE IF NOT EXISTS content_publications(
 tenant TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('course','item')),
 content_id TEXT NOT NULL,version INTEGER NOT NULL,
 course_id TEXT,item_id TEXT,published_at TEXT,
 PRIMARY KEY(kind,content_id,version),
 FOREIGN KEY(course_id,version) REFERENCES course_versions(course_id,version),
 FOREIGN KEY(item_id,version) REFERENCES content_item_versions(item_id,version),
 CHECK((kind='course' AND course_id IS NOT NULL AND course_id=content_id AND item_id IS NULL) OR
       (kind='item' AND item_id IS NOT NULL AND item_id=content_id AND course_id IS NULL))
);
INSERT OR IGNORE INTO content_publications SELECT c.tenant,'course',v.course_id,v.version,v.course_id,NULL,NULL
 FROM course_versions v JOIN courses c ON c.id=v.course_id;
INSERT OR IGNORE INTO content_publications SELECT c.tenant,'item',v.item_id,v.version,NULL,v.item_id,NULL
 FROM content_item_versions v JOIN content_items c ON c.id=v.item_id;
INSERT OR IGNORE INTO schema_version VALUES(15);
