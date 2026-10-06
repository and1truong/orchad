import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { Principal, ContentItem } from "../shared/model.ts";
import { reject, boundedPage } from "./errors.ts";
export class StandaloneService {
  constructor(readonly db: DatabaseSync) {}
  private enrollment(p: Principal, id: string) {
    const e = this.db
      .prepare(
        "SELECT e.*,v.content FROM item_enrollments e JOIN content_item_versions v ON v.item_id=e.item_id AND v.version=e.version JOIN content_items i ON i.id=e.item_id AND i.tenant=e.tenant WHERE e.id=? AND e.tenant=? AND e.learner=?",
      )
      .get(id, p.tenant, p.id) as any;
    if (!e) reject("FORBIDDEN", "Own standalone enrollment required");
    return e;
  }
  private published(p: Principal, a: any, live = true) {
    const item = this.db
      .prepare("SELECT * FROM content_items WHERE id=? AND tenant=?")
      .get(a.itemId, p.tenant) as any;
    if (!item || (live && item.state !== "published"))
      reject("FORBIDDEN", "Published standalone item required");
    const version = a.version ?? item.latest_version;
    if (
      !this.db
        .prepare(
          "SELECT 1 FROM content_item_versions WHERE item_id=? AND version=?",
        )
        .get(item.id, version)
    )
      reject("FORBIDDEN", "Standalone version unavailable");
    return { item, version };
  }
  authorize(p: Principal, name: string, a: any) {
    if (name === "learning_enroll_item") this.published(p, a, false);
    if (["learning_get_item_enrollment", "human_complete_item"].includes(name))
      this.enrollment(p, a.itemEnrollmentId);
  }
  private summary(e: any) {
    const item = JSON.parse(e.content) as ContentItem;
    return {
      id: e.id,
      itemId: e.item_id,
      version: e.version,
      title: item.title,
      summary: item.summary,
      language: item.language,
      provider: item.provider,
      kind: item.kind,
      status: e.completed_at ? "completed" : "in_progress",
      enrolledAt: e.enrolled_at,
      completedAt: e.completed_at,
      completionPolicy: "learner_confirmed_reading",
      certificateAvailable: false,
    };
  }
  read(p: Principal, name: string, a: any, source: string) {
    if (name === "learning_get_my_items")
      return boundedPage(
        (
          this.db
            .prepare(
              "SELECT e.*,v.content FROM item_enrollments e JOIN content_item_versions v ON v.item_id=e.item_id AND v.version=e.version JOIN content_items i ON i.id=e.item_id AND i.tenant=e.tenant WHERE e.tenant=? AND e.learner=? ORDER BY e.enrolled_at,e.id",
            )
            .all(p.tenant, p.id) as any[]
        ).map((e) => this.summary(e)),
        a.offset ?? 0,
        a.limit ?? 20,
      );
    const e = this.enrollment(p, a.itemEnrollmentId),
      item = JSON.parse(e.content) as ContentItem;
    const { text, url, transcript, assetId, ...metadata } = item;
    return {
      ...this.summary(e),
      item: {
        id: e.item_id,
        version: e.version,
        ...metadata,
        ...(source === "bridge" && !item.aiProcessingAllowed
          ? { contentWithheld: true }
          : {
              text,
              ...(url ? { url } : {}),
              ...(transcript ? { transcript } : {}),
              ...(source === "human" && assetId ? { assetId } : {}),
            }),
      },
    };
  }
  write(p: Principal, name: string, a: any) {
    if (name === "learning_enroll_item") {
      const { item, version } = this.published(p, a),
        id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO item_enrollments VALUES(?,?,?,?,?,?,NULL) ON CONFLICT(learner,item_id,version) DO NOTHING",
        )
        .run(id, p.tenant, p.id, item.id, version, new Date().toISOString());
      const e = this.db
        .prepare(
          "SELECT * FROM item_enrollments WHERE learner=? AND item_id=? AND version=?",
        )
        .get(p.id, item.id, version) as any;
      return {
        itemEnrollmentId: e.id,
        version: e.version,
        status: e.completed_at ? "completed" : "in_progress",
      };
    }
    const e = this.enrollment(p, a.itemEnrollmentId);
    if (!e.completed_at)
      this.db
        .prepare(
          "UPDATE item_enrollments SET completed_at=? WHERE id=? AND completed_at IS NULL",
        )
        .run(new Date().toISOString(), e.id);
    return {
      ...this.summary(this.enrollment(p, e.id)),
      itemEnrollmentId: e.id,
    };
  }
}
