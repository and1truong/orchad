import type { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import type { Principal, Course, ContentItem } from "../shared/model.ts";
import { requiredLessonIds } from "../shared/progression.ts";
import { reject } from "./errors.ts";
export const uploadLimit = 8 * 1024 * 1024;
export type MediaContext = {
  submissionId?: string;
  itemId?: string;
  version?: number;
  enrollmentId?: string;
  lessonId?: string;
};
export class MediaService {
  constructor(readonly db: DatabaseSync) {}
  private live(p: Principal) {
    const a = this.db
      .prepare("SELECT * FROM accounts WHERE id=? AND tenant=? AND active=1")
      .get(p.id, p.tenant) as any;
    if (!a || a.auth_version !== p.auth_version)
      reject("UNAUTHORIZED", "Active account required");
    return a;
  }
  metadata(row: any) {
    return {
      id: row.id,
      filename: row.filename,
      mime: row.mime,
      sha256: row.sha256,
      size: row.bytes.length,
    };
  }
  upload(p: Principal, input: any, bytes: Buffer) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const a = this.live(p);
      const purpose = input?.purpose ?? "content";
      let context: Record<string, string> = {};
      if (purpose === "content" && !["admin", "content_admin"].includes(a.role))
        reject("FORBIDDEN", "Content author required");
      if (
        !input ||
        Object.keys(input).sort().join(",") !==
          (purpose === "content"
            ? "confirmed,filename,key,mime,revision"
            : "confirmed,enrollmentId,filename,key,lessonId,mime,purpose,revision") ||
        input.confirmed !== "true" ||
        typeof input.filename !== "string" ||
        !/^[\p{L}\p{N} _.-]{1,120}$/u.test(input.filename) ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(input.key) ||
        !/^\d{1,10}$/.test(input.revision)
      )
        reject(
          "INVALID_ARGUMENT",
          "Invalid upload metadata; confirm self-authored content",
        );
      if (purpose !== "content") {
        if (
          purpose !== "submission" ||
          typeof input.enrollmentId !== "string" ||
          input.enrollmentId.length > 128 ||
          typeof input.lessonId !== "string" ||
          input.lessonId.length > 64 ||
          input.mime !== "application/pdf"
        )
          reject("INVALID_ARGUMENT", "Assignment upload requires a scoped PDF");
        const e = this.db
          .prepare(
            "SELECT e.*,v.content FROM enrollments e JOIN course_versions v ON v.course_id=e.course_id AND v.version=e.version WHERE e.id=? AND e.tenant=? AND e.learner=?",
          )
          .get(input.enrollmentId, p.tenant, p.id) as any;
        if (!e || e.assignment_state !== "active" || e.status === "completed")
          reject("FORBIDDEN", "Open own assignment required");
        const course = JSON.parse(e.content) as Course,
          l = course.lessons.find((l) => l.id === input.lessonId);
        if (
          !l ||
          l.kind !== "submission" ||
          requiredLessonIds(course, l).some(
            (id) => !JSON.parse(e.completed_lessons).includes(id),
          )
        )
          reject("FORBIDDEN", "Submission lesson must be unlocked");
        context = { enrollmentId: e.id, lessonId: l.id };
      }
      if (!bytes.length || bytes.length > uploadLimit)
        reject("INVALID_ARGUMENT", "File must contain 1 byte to 8 MiB");
      const mime = input.mime,
        prefix = bytes.subarray(0, 12);
      const valid =
        mime === "application/pdf"
          ? bytes.subarray(0, 5).toString() === "%PDF-"
          : mime === "audio/wav"
            ? prefix.subarray(0, 4).toString() === "RIFF" &&
              prefix.subarray(8, 12).toString() === "WAVE"
            : mime === "audio/mpeg"
              ? bytes.subarray(0, 3).toString() === "ID3" ||
                (bytes[0] === 255 && (bytes[1]! & 224) === 224)
              : mime === "video/mp4"
                ? prefix.subarray(4, 8).toString() === "ftyp"
                : mime === "text/html"
                  ? bytes.length <= 64 * 1024 &&
                    !bytes.includes(0) &&
                    Buffer.from(bytes.toString("utf8")).equals(bytes)
                  : false;
      if (!valid)
        reject(
          "INVALID_ARGUMENT",
          "Unsupported file or format signature mismatch",
        );
      const sha256 = createHash("sha256").update(bytes).digest("hex"),
        payloadHash = createHash("sha256")
          .update(
            JSON.stringify(
              purpose === "content"
                ? [input.filename, mime, sha256]
                : [input.filename, mime, sha256, purpose, context],
            ),
          )
          .digest("hex");
      const old = this.db
        .prepare("SELECT * FROM assets WHERE owner=? AND operation_key=?")
        .get(p.id, input.key) as any;
      if (old) {
        if (old.payload_hash !== payloadHash)
          reject("IDEMPOTENCY_CONFLICT", "Upload operation changed");
        this.db.exec("COMMIT");
        return this.metadata(old);
      }
      const doc =
          purpose === "content"
            ? `library:${p.tenant}`
            : `learning:${p.tenant}:${p.id}`,
        w = this.db
          .prepare("SELECT revision FROM workspaces WHERE id=?")
          .get(doc) as any;
      if (w.revision !== Number(input.revision))
        reject("STALE_CONTEXT", "Library changed; refresh before uploading");
      const used = this.db
        .prepare(
          "SELECT COALESCE(SUM(length(bytes)),0) AS total,COUNT(*) AS count FROM assets WHERE tenant=?",
        )
        .get(p.tenant) as any;
      if (used.total + bytes.length > 128 * 1024 * 1024 || used.count >= 512)
        reject("INVALID_ARGUMENT", "Tenant upload quota reached");
      const id = randomUUID(),
        now = new Date().toISOString();
      this.db
        .prepare(
          "INSERT INTO assets(id,tenant,owner,filename,mime,sha256,bytes,created_at,operation_key,payload_hash,purpose,context_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          p.tenant,
          p.id,
          input.filename,
          mime,
          sha256,
          bytes,
          now,
          input.key,
          payloadHash,
          purpose,
          JSON.stringify(context),
        );
      this.db
        .prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?")
        .run(doc);
      this.db
        .prepare(
          "INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(
          p.tenant,
          p.id,
          doc,
          purpose === "content"
            ? "human_upload_content"
            : "human_upload_submission",
          JSON.stringify({
            assetId: id,
            filename: input.filename,
            mime,
            sha256,
            size: bytes.length,
          }),
          now,
        );
      this.db.exec("COMMIT");
      return { id, filename: input.filename, mime, sha256, size: bytes.length };
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  validate(p: Principal, id: string, kind: string) {
    const row = this.db
      .prepare("SELECT * FROM assets WHERE id=? AND tenant=?")
      .get(id, p.tenant) as any;
    if (!row || row.purpose !== "content")
      reject("FORBIDDEN", "Asset unavailable in this tenant");
    const allowed: Record<string, string[]> = {
      audio: ["audio/wav", "audio/mpeg"],
      video: ["video/mp4"],
      document: ["application/pdf"],
      interactive: ["text/html"],
    };
    if (!allowed[kind]?.includes(row.mime))
      reject("INVALID_ARGUMENT", "Asset format does not match content kind");
    return row;
  }
  read(p: Principal, id: string, c: MediaContext) {
    const a = this.live(p),
      row = this.db
        .prepare("SELECT * FROM assets WHERE id=? AND tenant=?")
        .get(id, p.tenant) as any;
    if (!row) reject("FORBIDDEN", "Asset access denied");
    if (
      row.owner === p.id ||
      (row.purpose === "content" && ["admin", "content_admin"].includes(a.role))
    )
      return row;
    if (row.purpose === "submission") {
      const e = this.db
        .prepare(
          "SELECT e.* FROM submissions s JOIN enrollments e ON e.id=s.enrollment_id WHERE s.id=? AND s.asset_id=? AND e.tenant=?",
        )
        .get(c.submissionId ?? "", id, p.tenant) as any;
      if (
        e &&
        (a.role === "admin" ||
          (a.role === "assessor" &&
            this.db
              .prepare(
                "SELECT 1 FROM course_assessors WHERE course_id=? AND assessor_id=?",
              )
              .get(e.course_id, p.id)))
      )
        return row;
      reject("FORBIDDEN", "Submission file review scope denied");
    }
    let content: { assetId?: string } | undefined;
    if (c.itemId && !c.enrollmentId && Number.isInteger(c.version)) {
      const item = this.db
        .prepare(
          "SELECT v.content FROM content_item_versions v JOIN content_items i ON i.id=v.item_id WHERE i.id=? AND i.tenant=? AND i.state='published' AND v.version=?",
        )
        .get(c.itemId, p.tenant, c.version!) as any;
      if (item) content = JSON.parse(item.content);
    } else if (c.enrollmentId && c.lessonId && !c.itemId) {
      const e = this.db
        .prepare(
          "SELECT e.*,v.content FROM enrollments e JOIN course_versions v ON v.course_id=e.course_id AND v.version=e.version WHERE e.id=? AND e.tenant=? AND e.learner=?",
        )
        .get(c.enrollmentId, p.tenant, p.id) as any;
      if (e && (e.assignment_state === "active" || e.status === "completed")) {
        const course = JSON.parse(e.content) as Course,
          lesson = course.lessons.find((l) => l.id === c.lessonId),
          done = JSON.parse(e.completed_lessons);
        if (
          lesson &&
          requiredLessonIds(course, lesson).every((x) => done.includes(x))
        )
          content = lesson;
      }
    }
    if (content?.assetId !== id)
      reject(
        "FORBIDDEN",
        "Read an authorized published item or unlocked lesson",
      );
    return row;
  }
}
