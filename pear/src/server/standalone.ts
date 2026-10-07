import {ContentAccess} from "./content-access.ts";
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
    new ContentAccess(this.db).enrolled(p,"item",e.item_id,e.version);
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
    const selected=this.db.prepare("SELECT content FROM content_item_versions WHERE item_id=? AND version=?").get(item.id,version) as any;
    const current=this.db.prepare("SELECT content FROM content_item_versions WHERE item_id=? AND version=?").get(item.id,item.latest_version) as any;
    new ContentAccess(this.db).requireVisible(p,"item",item.id,JSON.parse(selected.content));
    new ContentAccess(this.db).requireVisible(p,"item",item.id,JSON.parse(current.content));
    return { item, version };
  }
  private retake(p:Principal,a:any){
    const e=this.enrollment(p,a.itemEnrollmentId);
    if(!e.completed_at)reject("FORBIDDEN","Completed own standalone reading required");
    if(a.version!==e.version)reject("STALE_CONTEXT","Standalone retake version changed; review again");
    this.published(p,{itemId:e.item_id,version:e.version});return e;
  }
  authorize(p: Principal, name: string, a: any) {
    if(name==="human_retake_completed_item")this.retake(p,a);
    if (name === "learning_enroll_item") this.published(p, a, false);
    if (["learning_get_item_enrollment", "human_complete_item"].includes(name))
      this.enrollment(p, a.itemEnrollmentId);
  }
  private summary(e: any,p:Principal) {
    const item = JSON.parse(e.content) as ContentItem,successor=this.db.prepare("SELECT id FROM item_enrollments WHERE retake_of=? AND learner=? AND tenant=?").get(e.id,p.id,p.tenant) as any;
    let retakeAvailable=false;if(e.completed_at&&!successor){try{this.published(p,{itemId:e.item_id,version:e.version});retakeAvailable=true;}catch{}}
    return {retakeOf:e.retake_of??null,successorId:successor?.id??null,retakeAvailable,
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
        ).map((e) => this.summary(e,p)),
        a.offset ?? 0,
        a.limit ?? 20,
      );
    const e = this.enrollment(p, a.itemEnrollmentId),
      item = JSON.parse(e.content) as ContentItem;
    const { text, url, transcript, assetId, captions, ...metadata } = item;
    if(source==="bridge"&&!item.aiProcessingAllowed&&metadata.discovery)metadata.discovery={...metadata.discovery,outcomes:[]};
    return {
      ...this.summary(e,p),
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
              ...(source === "human" && captions ? { captions } : {}),
            }),
      },
    };
  }
  write(p: Principal, name: string, a: any) {
    if(name==="human_retake_completed_item"){
      const e=this.retake(p,a);if(this.db.prepare("SELECT 1 FROM item_enrollments WHERE retake_of=?").get(e.id))reject("INVALID_ARGUMENT","A standalone successor already exists; continue that record");
      const id=randomUUID();this.db.prepare("INSERT INTO item_enrollments(id,tenant,learner,item_id,version,enrolled_at,retake_of) VALUES(?,?,?,?,?,?,?)").run(id,p.tenant,p.id,e.item_id,e.version,new Date().toISOString(),e.id);
      return {itemEnrollmentId:id,version:e.version,retakeOf:e.id,status:"in_progress",priorReadingPreserved:true};
    }
    if (name === "learning_enroll_item") {
      const { item, version } = this.published(p, a);
      const existing=this.db.prepare("SELECT id,version,completed_at FROM item_enrollments WHERE learner=? AND tenant=? AND item_id=? AND version=? ORDER BY rowid DESC LIMIT 1").get(p.id,p.tenant,item.id,version) as any;
      if(existing)return {itemEnrollmentId:existing.id,version:existing.version,status:existing.completed_at?"completed":"in_progress"};
      const id=randomUUID();
      this.db
        .prepare(
          "INSERT INTO item_enrollments(id,tenant,learner,item_id,version,enrolled_at) VALUES(?,?,?,?,?,?)",
        )
        .run(id, p.tenant, p.id, item.id, version, new Date().toISOString());
      const e = this.db
        .prepare(
          "SELECT * FROM item_enrollments WHERE learner=? AND item_id=? AND version=? ORDER BY rowid DESC LIMIT 1",
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
      ...this.summary(this.enrollment(p, e.id),p),
      itemEnrollmentId: e.id,
    };
  }
}
