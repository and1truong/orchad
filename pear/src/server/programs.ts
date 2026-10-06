import {ContentAccess} from "./content-access.ts";
import type { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { validateArgs } from "@orchard/bridge-contract";
import type { Principal } from "../shared/model.ts";
import {
  awardSchema,
  playlistSchema,
  type Award,
  type Playlist,
  type Reference,
} from "../shared/programs.ts";
import { reject, boundedPage } from "./errors.ts";
const json = (value: string) => JSON.parse(value);
const identifier = /^[A-Za-z0-9_-]{1,64}$/;
export class ProgramService {
  constructor(readonly db: DatabaseSync) {}
  private collection(p: Pick<Principal, "tenant">, id: string) {
    const row = this.db
      .prepare("SELECT * FROM collections WHERE id=? AND tenant=?")
      .get(id, p.tenant) as any;
    if (!row) reject("NOT_FOUND", "Collection unavailable");
    return row;
  }
  private version(id: string, version: number): Award | Playlist {
    const row = this.db
      .prepare(
        "SELECT content FROM collection_versions WHERE collection_id=? AND version=?",
      )
      .get(id, version) as any;
    if (!row) reject("NOT_FOUND", "Collection version unavailable");
    return json(row.content);
  }
  private visible(p: Principal, row: any, value: Award | Playlist) {
    return value.access === "tenant" || row.owner === p.id;
  }
  private author(p: Principal, row: any) {
    if (
      !["admin", "content_admin"].includes(p.role) ||
      (p.role !== "admin" &&
        row.owner !== p.id &&
        json(row.draft).access === "author")
    )
      reject("FORBIDDEN", "Collection author scope denied");
  }
  private enrollment(p: Principal, id: string) {
    const row = this.db
      .prepare(
        "SELECT * FROM award_enrollments WHERE id=? AND learner=? AND tenant=?",
      )
      .get(id, p.id, p.tenant) as any;
    if (!row) reject("FORBIDDEN", "Award enrollment access denied");
    return row;
  }
  evidenceScope(p: Principal, id: string, path: string, file = false) {
    const e = this.enrollment(p, id);
    const root = this.version(e.award_id, e.version) as Award;
    if (
      e.assignment_state !== "active" ||
      (file && e.completed_at && !root.ongoing)
    )
      reject("FORBIDDEN", "Open own award required");
    const find = (progress: any): any => {
      for (const r of progress.requirements) {
        if (
          r.criterionPath === path &&
          r.alternatives.some((ref: any) => ref.kind === "external")
        )
          return r;
        for (const ref of r.alternatives)
          if (ref.kind === "award") {
            const value = find(ref);
            if (value) return value;
          }
      }
    };
    const criterion = find(this.evaluation(e));
    if (!criterion)
      reject("INVALID_ARGUMENT", "External criterion outside enrolled award");
    return {
      e,
      policy: criterion.alternatives.find((ref: any) => ref.kind === "external")
        .moderated,
    };
  }
  private assessor(p: Principal, awardId: string) {
    this.collection(p, awardId);
    if (p.role === "admin") return;
    if (
      p.role !== "assessor" ||
      !this.db
        .prepare(
          "SELECT 1 FROM award_assessors WHERE award_id=? AND assessor_id=?",
        )
        .get(awardId, p.id)
    )
      reject("FORBIDDEN", "Award assessor scope denied");
  }
  private recipient(p: Principal, id: string) {
    const r = this.db
      .prepare(
        "SELECT id,tenant,manager_id FROM accounts WHERE id=? AND tenant=? AND active=1",
      )
      .get(id, p.tenant) as any;
    if (
      !r ||
      (p.role !== "admin" && !(p.role === "manager" && r.manager_id === p.id))
    )
      reject("FORBIDDEN", "Award audience outside role scope");
    return r;
  }
  authorize(p: Principal, name: string, a: any) {
    if (
      [
        "learning_get_collection",
        "learning_publish_collection",
        "learning_retire_collection",
        "learning_unpublish_collection",
        "learning_assign_award",
        "learning_enroll_award",
        "learning_set_award_assessor",
        "learning_get_external_records",
      ].includes(name)
    ) {
      const row = this.collection(p, a.collectionId);
      if (
        ["learning_publish_collection", "learning_retire_collection", "learning_unpublish_collection"].includes(
          name,
        )
      )
        this.author(p, row);
      if (["learning_get_collection", "learning_enroll_award"].includes(name)) {
        if (
          row.state !== "published" ||
          !this.visible(p, row, this.version(row.id, row.latest_version))
        )
          reject("NOT_FOUND", "Collection not available for current learner");
      }
      if (name === "learning_get_external_records") this.assessor(p, row.id);
    }
    if (name === "learning_assign_award") this.recipient(p, a.learnerId);
    if (
      name === "human_submit_external_record" &&
      this.enrollment(p, a.awardEnrollmentId).assignment_state !== "active"
    )
      reject("FORBIDDEN", "Award obligation is no longer active");
    if (name === "learning_assess_external_record") {
      const row = this.db
        .prepare(
          "SELECT r.*,e.award_id,e.tenant FROM external_records r JOIN award_enrollments e ON e.id=r.enrollment_id WHERE r.id=? AND e.tenant=?",
        )
        .get(a.recordId, p.tenant) as any;
      if (!row) reject("FORBIDDEN", "External record scope denied");
      this.assessor(p, row.award_id);
    }
    if (["learning_save_playlist", "learning_save_award"].includes(name)) {
      const row = this.db
        .prepare("SELECT * FROM collections WHERE id=?")
        .get(a.collectionId) as any;
      if (row) {
        if (row.tenant !== p.tenant)
          reject("NOT_FOUND", "Collection unavailable");
        this.author(p, row);
      }
    }
  }
  private reference(
    p: Principal,
    ref: Reference,
    rootAccess: string,
    publishing: boolean,
    rootOwner=p.id,
  ): Reference {
    if (!identifier.test(ref.id))
      reject("INVALID_ARGUMENT", "Invalid reference ID");
    if (ref.kind === "external") return { kind: ref.kind, id: ref.id };
    const table =
      ref.kind === "course"
        ? "courses"
        : ref.kind === "item"
          ? "content_items"
          : "collections";
    const row = this.db
      .prepare(`SELECT * FROM ${table} WHERE id=? AND tenant=?`)
      .get(ref.id, p.tenant) as any;
    if (!row || (ref.kind === "award" && row.kind !== "award"))
      reject("NOT_FOUND", "Referenced content unavailable");
    if (publishing && row.state !== "published")
      reject("FORBIDDEN", "Publish only available published references");
    if(ref.kind==="course"||ref.kind==="item"){
      const column=ref.kind==="course"?"course_id":"item_id",versionTable=ref.kind==="course"?"course_versions":"content_item_versions";
      const content=publishing?json((this.db.prepare("SELECT content FROM "+versionTable+" WHERE "+column+"=? AND version=?").get(row.id,ref.version??row.latest_version) as any)?.content??"null"):json(row.draft);
      if(!content)reject("NOT_FOUND","Referenced content version unavailable");
      new ContentAccess(this.db).reference(p,ref.kind,row.id,content,rootAccess,rootOwner,publishing||row.latest_version>0);
    }
    if (ref.kind === "award") {
      const child = publishing
        ? this.version(row.id, ref.version ?? row.latest_version)
        : json(row.draft);
      if (
        !this.visible(p, row, child) ||
        (rootAccess === "tenant" && child.access === "author")
      )
        reject("FORBIDDEN", "Private nested award cannot be redistributed");
    }
    return {
      kind: ref.kind,
      id: ref.id,
      ...(publishing ? { version: ref.version ?? row.latest_version } : {}),
    };
  }
  private validate(
    p: Principal,
    id: string,
    kind: string,
    raw: unknown,
    publishing = false,
  ): Award | Playlist {
    if (
      !identifier.test(id) ||
      !validateArgs(kind === "award" ? awardSchema : playlistSchema, raw) ||
      Buffer.byteLength(JSON.stringify(raw)) > 28 * 1024
    )
      reject("INVALID_ARGUMENT", "Invalid collection structure or size");
    const value = structuredClone(raw) as Award | Playlist;
    let nodes = 0,
      criteria = 0,
      graphBytes = 0,
      progressBytes = 4 * 1024;
    const walk = (
      awardId: string,
      content: Award,
      path: string[],
      depth: number,
      prefix = "",
    ) => {
      if (
        path.includes(awardId) ||
        depth > 4 ||
        ++nodes > 32 ||
        (criteria += content.requirements.length) > 64 ||
        (graphBytes += Buffer.byteLength(JSON.stringify(content))) > 16 * 1024
      )
        reject(
          "INVALID_ARGUMENT",
          "Award graph exceeds cycle/depth/complexity bounds",
        );
      if (
        new Set(content.requirements.map((r) => r.id)).size !==
          content.requirements.length ||
        content.target > content.requirements.reduce((n, r) => n + r.credits, 0)
      )
        reject(
          "INVALID_ARGUMENT",
          "Duplicate criterion IDs or unreachable target",
        );
      for (const r of content.requirements) {
        progressBytes +=
          Buffer.byteLength(prefix + r.id) + 240 + r.alternatives.length * 100;
        if (progressBytes + graphBytes > 40 * 1024)
          reject("INVALID_ARGUMENT", "Award progress exceeds envelope bounds");
        if (
          !identifier.test(r.id) ||
          new Set(r.alternatives.map((a) => a.kind + ":" + a.id)).size !==
            r.alternatives.length
        )
          reject(
            "INVALID_ARGUMENT",
            "Invalid or duplicate criterion alternatives",
          );
        for (const ref of r.alternatives) {
          this.reference(p, ref, content.access, publishing, (this.db.prepare("SELECT owner FROM collections WHERE id=? AND tenant=?").get(awardId,p.tenant) as any)?.owner??p.id);
          if (ref.kind === "award") {
            const child = this.collection(p, ref.id);
            // Draft cycle checks are deliberately conservative, including drafts
            // that have not yet been published. Published graphs remain immutable.
            walk(
              child.id,
              (publishing
                ? this.version(child.id, ref.version ?? child.latest_version)
                : json(child.draft)) as Award,
              [...path, awardId],
              depth + 1,
              `${prefix}${r.id}/${ref.id}@${ref.version ?? child.latest_version}/`,
            );
          }
        }
      }
    };
    if (kind === "award") {
      walk(id, value as Award, [], 1);
      for (const r of (value as Award).requirements)
        r.alternatives = r.alternatives.map((ref) =>
          this.reference(p, ref, value.access, publishing, (this.db.prepare("SELECT owner FROM collections WHERE id=? AND tenant=?").get(id,p.tenant) as any)?.owner??p.id),
        );
    } else {
      const playlist = value as Playlist;
      if (
        new Set(playlist.items.map((ref) => ref.kind + ":" + ref.id)).size !==
        playlist.items.length
      )
        reject("INVALID_ARGUMENT", "Duplicate playlist items");
      playlist.items = playlist.items.map((ref) =>
        this.reference(p, ref, value.access, publishing, (this.db.prepare("SELECT owner FROM collections WHERE id=? AND tenant=?").get(id,p.tenant) as any)?.owner??p.id),
      );
    }
    if (Buffer.byteLength(JSON.stringify(value)) > 28 * 1024)
      reject("INVALID_ARGUMENT", "Published collection exceeds size bounds");
    return value;
  }
  private preview(row: any, value: Award | Playlist) {
    return {
      id: row.id,
      kind: row.kind,
      state: row.state,
      version: row.latest_version,
      title: value.title,
      summary: value.summary,
      access: value.access,
      ...(row.kind === "award"
        ? {
            unit: (value as Award).unit,
            target: (value as Award).target,
            ongoing: (value as Award).ongoing,
          }
        : { itemCount: (value as Playlist).items.length }),
    };
  }
  private referenceMetadata(p: Principal, ref: Reference) {
    if (ref.kind === "external")
      return { ...ref, title: ref.id, state: "external" };
    if (ref.kind === "award") {
      const row = this.collection(p, ref.id),
        value = this.version(ref.id, ref.version!);
      return { ...ref, title: value.title, state: row.state };
    }
    const table = ref.kind === "course" ? "courses" : "content_items",
      versions =
        ref.kind === "course" ? "course_versions" : "content_item_versions",
      field = ref.kind === "course" ? "course_id" : "item_id";
    const row = this.db
      .prepare(`SELECT state FROM ${table} WHERE id=? AND tenant=?`)
      .get(ref.id, p.tenant) as any;
    const version = this.db
      .prepare(`SELECT content FROM ${versions} WHERE ${field}=? AND version=?`)
      .get(ref.id, ref.version!) as any;
    if (!row || !version)
      return { ...ref, state: "unavailable", title: ref.id };
    return { ...ref, state: row.state, title: json(version.content).title };
  }
  private evaluation(enrollment: any, files = false) {
    const root = this.version(enrollment.award_id, enrollment.version) as Award;
    const records = this.db
      .prepare(
        "SELECT id,criterion_path,amount,state,asset_id FROM external_records WHERE enrollment_id=? ORDER BY created_at,id",
      )
      .all(enrollment.id) as any[];
    const cycleStart = enrollment.assignment_cycle_id
      ? (
          this.db
            .prepare("SELECT run_at FROM assignment_cycles WHERE id=?")
            .get(enrollment.assignment_cycle_id) as any
        ).run_at
      : null;
    let count = 0,
      recordBudget = 20;
    const evaluate = (award: Award, prefix: string, depth: number): any => {
      if (depth > 4 || (count += award.requirements.length) > 64)
        reject("INTERNAL", "Stored award graph violates bounds");
      const requirements = award.requirements.map((r) => {
        const criterionPath = prefix + r.id;
        let earned = 0;
        const alternatives = r.alternatives.map((ref) => {
          if (ref.kind === "course") {
            const completed = !!this.db
              .prepare(
                "SELECT 1 FROM enrollments WHERE learner=? AND tenant=? AND course_id=? AND status='completed' AND (? IS NULL OR completed_at>=?)",
              )
              .get(
                enrollment.learner,
                enrollment.tenant,
                ref.id,
                cycleStart,
                cycleStart,
              );
            if (completed) earned = r.credits;
            return { ...ref, completed };
          }
          if (ref.kind === "award") {
            const child = evaluate(
              this.version(ref.id, ref.version!) as Award,
              `${criterionPath}/${ref.id}@${ref.version}/`,
              depth + 1,
            );
            if (child.completed) earned = r.credits;
            return { ...ref, ...child };
          }
          const evidence = records.filter(
            (record) => record.criterion_path === criterionPath,
          );
          const external = Math.min(
            r.credits,
            evidence
              .filter((record) => record.state === "accepted")
              .reduce((sum, record) => sum + record.amount, 0),
          );
          earned = Math.max(earned, external);
          const summaries = evidence.slice(-Math.min(3, recordBudget));
          if (recordBudget === 0) summaries.length = 0;
          recordBudget -= summaries.length;
          return {
            ...ref,
            earned: external,
            records: summaries.map(({ asset_id, ...record }) => ({
              ...record,
              ...(files && asset_id ? { assetId: asset_id } : {}),
              evidenceAttached: !!asset_id,
            })),
            recordCount: evidence.length,
            pendingCount: evidence.filter(
              (record) => record.state === "pending",
            ).length,
            rejectedCount: evidence.filter(
              (record) => record.state === "rejected",
            ).length,
            moderated: award.moderatedExternal,
          };
        });
        return {
          id: r.id,
          title: r.title,
          required: r.required,
          credits: r.credits,
          earned,
          completed: earned >= r.credits,
          criterionPath,
          alternatives,
        };
      });
      const earned = requirements.reduce((sum, r) => sum + r.earned, 0),
        requiredComplete = requirements
          .filter((r) => r.required)
          .every((r) => r.completed);
      return {
        title: award.title,
        unit: award.unit,
        target: award.target,
        ongoing: award.ongoing,
        earned,
        requiredComplete,
        completed: !award.ongoing && requiredComplete && earned >= award.target,
        requirements,
      };
    };
    const evaluated = evaluate(root, "", 1);
    return {
      ...enrollment,
      ...evaluated,
      completed:
        !!enrollment.completed_at ||
        (enrollment.assignment_state === "active" && evaluated.completed),
      title: root.title,
    };
  }
  refreshLearner(tenant: string, learner: string) {
    const rows = this.db
      .prepare(
        "SELECT * FROM award_enrollments WHERE tenant=? AND learner=? AND completed_at IS NULL AND assignment_state='active'",
      )
      .all(tenant, learner) as any[];
    for (const row of rows)
      if (this.evaluation(row).completed)
        this.db
          .prepare(
            "UPDATE award_enrollments SET completed_at=?,certificate_id=? WHERE id=? AND completed_at IS NULL",
          )
          .run(new Date().toISOString(), randomUUID(), row.id);
  }
  private enroll(
    p: Principal,
    collectionId: string,
    learner: string,
    assignedBy: string | null,
  ) {
    const row = this.collection(p, collectionId);
    if (row.kind !== "award")
      reject("INVALID_ARGUMENT", "Playlists cannot be enrolled or assigned");
    const value = this.version(row.id, row.latest_version) as Award;
    if (
      row.state !== "published" ||
      (value.access !== "tenant" && row.owner !== learner)
    )
      reject("FORBIDDEN", "Award unavailable to recipient");
    const existing = this.db
      .prepare(
        "SELECT * FROM award_enrollments WHERE learner=? AND award_id=? AND assignment_cycle_id IS NULL",
      )
      .get(learner, row.id) as any;
    if (existing)
      return {
        awardEnrollmentId: existing.id,
        alreadyEnrolled: true,
        version: existing.version,
      };
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO award_enrollments(id,tenant,learner,award_id,version,assigned_by) VALUES(?,?,?,?,?,?)",
      )
      .run(id, p.tenant, learner, row.id, row.latest_version, assignedBy);
    if (assignedBy)
      this.db
        .prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?")
        .run(`learning:${p.tenant}:${learner}`);
    this.refreshLearner(p.tenant, learner);
    return {
      awardEnrollmentId: id,
      alreadyEnrolled: false,
      version: row.latest_version,
    };
  }
  read(p: Principal, name: string, a: any, source: string): any {
    switch (name) {
      case "learning_search_collections": {
        const rows = (
          this.db
            .prepare(
              "SELECT * FROM collections WHERE tenant=? AND state='published' ORDER BY id",
            )
            .all(p.tenant) as any[]
        )
          .filter(
            (row) =>
              (!a.kind || row.kind === a.kind) &&
              this.visible(p, row, this.version(row.id, row.latest_version)),
          )
          .map((row) =>
            this.preview(row, this.version(row.id, row.latest_version)),
          );
        return boundedPage(rows, a.offset ?? 0, a.limit ?? 20);
      }
      case "learning_get_collection": {
        const row = this.collection(p, a.collectionId),
          content = this.version(row.id, row.latest_version),
          refs =
            row.kind === "playlist"
              ? (content as Playlist).items
              : (content as Award).requirements.flatMap((r) => r.alternatives);
        return {
          ...this.preview(row, content),
          content,
          references: boundedPage(
            refs.map((ref) => this.referenceMetadata(p, ref)),
            a.offset ?? 0,
            a.limit ?? 20,
          ),
        };
      }
      case "learning_get_collection_drafts":
        return boundedPage(
          (
            this.db
              .prepare("SELECT * FROM collections WHERE tenant=? ORDER BY id")
              .all(p.tenant) as any[]
          )
            .filter(
              (row) =>
                p.role === "admin" ||
                row.owner === p.id ||
                json(row.draft).access === "tenant",
            )
            .map(({ draft, ...row }) => ({ ...row, draft: json(draft) })),
          a.offset ?? 0,
          a.limit ?? 20,
        );
      case "learning_get_my_awards":
        return boundedPage(
          (
            this.db
              .prepare(
                "SELECT * FROM award_enrollments WHERE learner=? AND tenant=? ORDER BY id",
              )
              .all(p.id, p.tenant) as any[]
          ).map((row) => this.evaluation(row, source === "human")),
          a.offset ?? 0,
          a.limit ?? 20,
        );
      case "learning_get_external_records":
        return boundedPage(
          (
            this.db
              .prepare(
                "SELECT r.*,e.learner,e.award_id FROM external_records r JOIN award_enrollments e ON e.id=r.enrollment_id WHERE e.award_id=? AND e.tenant=? ORDER BY r.created_at,r.id",
              )
              .all(a.collectionId, p.tenant) as any[]
          ).map(({ evidence, evidence_hash, asset_id, ...row }) =>
            source === "human"
              ? { ...row, evidence, ...(asset_id ? { assetId: asset_id } : {}) }
              : {
                  ...row,
                  evidenceWithheld: true,
                  evidenceAttached: !!asset_id,
                },
          ),
          a.offset ?? 0,
          a.limit ?? 20,
        );
      default:
        reject("UNSUPPORTED", "Unknown learning read");
    }
  }
  write(p: Principal, name: string, a: any): any {
    switch (name) {
      case "learning_save_playlist":
      case "learning_save_award": {
        const kind = name === "learning_save_award" ? "award" : "playlist",
          value = this.validate(p, a.collectionId, kind, a[kind]);
        const old = this.db
          .prepare("SELECT * FROM collections WHERE id=?")
          .get(a.collectionId) as any;
        if (old && old.kind !== kind)
          reject("INVALID_ARGUMENT", "Collection kind cannot change");
        if (old)
          this.db
            .prepare("UPDATE collections SET draft=? WHERE id=?")
            .run(JSON.stringify(value), old.id);
        else
          this.db
            .prepare("INSERT INTO collections VALUES(?,?,?,?,'draft',?,0)")
            .run(a.collectionId, p.tenant, p.id, kind, JSON.stringify(value));
        return { collectionId: a.collectionId, kind, draftSaved: true };
      }
      case "learning_publish_collection": {
        const row = this.collection(p, a.collectionId),
          value = this.validate(p, row.id, row.kind, json(row.draft), true),
          version = row.latest_version + 1;
        this.db
          .prepare("INSERT INTO collection_versions VALUES(?,?,?)")
          .run(row.id, version, JSON.stringify(value));
        this.db
          .prepare(
            "UPDATE collections SET state='published',latest_version=? WHERE id=?",
          )
          .run(version, row.id);
        return { collectionId: row.id, version, state: "published" };
      }
      case "learning_unpublish_collection": {
        const row = this.collection(p, a.collectionId);
        if (row.state !== "published") reject("INVALID_ARGUMENT", "Only published collections can be unpublished");
        this.db.prepare("UPDATE collections SET state='draft' WHERE id=?").run(row.id);
        return {collectionId: row.id, state:"draft", enrolledVersionsPreserved:true};
      }
      case "learning_retire_collection":
        this.db
          .prepare("UPDATE collections SET state='retired' WHERE id=?")
          .run(a.collectionId);
        return {
          collectionId: a.collectionId,
          state: "retired",
          enrolledVersionsPreserved: true,
        };
      case "learning_enroll_award":
        return this.enroll(p, a.collectionId, p.id, null);
      case "learning_assign_award":
        return this.enroll(
          p,
          a.collectionId,
          this.recipient(p, a.learnerId).id,
          p.id,
        );
      case "learning_set_award_assessor": {
        const row = this.collection(p, a.collectionId);
        if (row.kind !== "award")
          reject("INVALID_ARGUMENT", "Assessor scope requires an award");
        const assessor = this.db
          .prepare(
            "SELECT 1 FROM accounts WHERE id=? AND tenant=? AND role='assessor' AND active=1",
          )
          .get(a.assessorId, p.tenant);
        if (!assessor)
          reject("FORBIDDEN", "Active same-tenant assessor required");
        if (a.enabled)
          this.db
            .prepare("INSERT OR IGNORE INTO award_assessors VALUES(?,?)")
            .run(row.id, a.assessorId);
        else
          this.db
            .prepare(
              "DELETE FROM award_assessors WHERE award_id=? AND assessor_id=?",
            )
            .run(row.id, a.assessorId);
        return {
          collectionId: row.id,
          assessorId: a.assessorId,
          enabled: a.enabled,
        };
      }
      case "human_submit_external_record": {
        const { e, policy } = this.evidenceScope(
          p,
          a.awardEnrollmentId,
          a.criterionPath,
          !!a.assetId,
        );
        let asset: any;
        if (a.assetId) {
          asset = this.db
            .prepare(
              "SELECT * FROM assets WHERE id=? AND tenant=? AND owner=? AND purpose='award_evidence'",
            )
            .get(a.assetId, p.tenant, p.id);
          const context = asset && JSON.parse(asset.context_json);
          if (
            !asset ||
            context.awardEnrollmentId !== e.id ||
            context.criterionPath !== a.criterionPath
          )
            reject(
              "FORBIDDEN",
              "Evidence file must belong to this learner and criterion",
            );
        }
        const digest = asset
          ? asset.sha256
          : createHash("sha256").update(a.evidence.trim()).digest("hex");
        if (
          !a.evidence.trim() ||
          this.db
            .prepare(
              "SELECT 1 FROM external_records WHERE enrollment_id=? AND criterion_path=? AND evidence_hash=?",
            )
            .get(e.id, a.criterionPath, digest)
        )
          reject(
            "INVALID_ARGUMENT",
            "Evidence is empty or already recorded for this criterion",
          );
        const id = randomUUID(),
          state = policy ? "pending" : "accepted";
        this.db
          .prepare(
            "INSERT INTO external_records(id,enrollment_id,criterion_path,amount,evidence,evidence_hash,state,created_at,asset_id) VALUES(?,?,?,?,?,?,?,?,?)",
          )
          .run(
            id,
            e.id,
            a.criterionPath,
            a.amount,
            a.evidence.trim(),
            digest,
            state,
            new Date().toISOString(),
            a.assetId ?? null,
          );
        this.refreshLearner(p.tenant, p.id);
        return { recordId: id, state, selfAttested: !policy };
      }
      case "learning_assess_external_record": {
        const r = this.db
          .prepare(
            "SELECT r.*,e.tenant,e.learner FROM external_records r JOIN award_enrollments e ON e.id=r.enrollment_id WHERE r.id=?",
          )
          .get(a.recordId) as any;
        if (r.state !== "pending")
          reject(
            "FORBIDDEN",
            "Moderation decisions are final; reconcile original operation key",
          );
        if (!a.reason.trim())
          reject("INVALID_ARGUMENT", "Moderation reason required");
        const state = a.accepted ? "accepted" : "rejected";
        this.db
          .prepare(
            "UPDATE external_records SET state=?,assessed_by=?,reason=? WHERE id=? AND state='pending'",
          )
          .run(state, p.id, a.reason.trim(), r.id);
        this.refreshLearner(r.tenant, r.learner);
        this.db
          .prepare("UPDATE workspaces SET revision=revision+1 WHERE id=?")
          .run(`learning:${r.tenant}:${r.learner}`);
        return { recordId: r.id, state, awardEnrollmentId: r.enrollment_id };
      }
      default:
        reject("UNSUPPORTED", "Unknown learning write");
    }
  }
  reportSummaries(tenant: string, learnerIds: string[]) {
    const allowed = new Set(learnerIds);
    return (
      this.db
        .prepare(
          "SELECT e.* FROM award_enrollments e JOIN collections c ON c.id=e.award_id AND c.tenant=e.tenant WHERE e.tenant=? ORDER BY e.id",
        )
        .all(tenant) as any[]
    )
      .filter((row) => allowed.has(row.learner))
      .map((row) => {
        const progress = this.evaluation(row);
        return {
          ...row,
          title: progress.title,
          earned: progress.earned,
          target: progress.target,
          unit: progress.unit,
          requiredComplete: progress.requiredComplete,
        };
      });
  }
  certificate(p: Principal, id: string) {
    const row = this.db
      .prepare(
        "SELECT * FROM award_enrollments WHERE certificate_id=? AND learner=? AND tenant=? AND completed_at IS NOT NULL",
      )
      .get(id, p.id, p.tenant) as any;
    if (!row) reject("FORBIDDEN", "Award certificate access denied");
    const progress = this.evaluation(row);
    return {
      id,
      title: progress.title,
      learnerName: p.name,
      version: row.version,
      issuedAt: row.completed_at,
      issuer: "Pear synthetic development portal",
      accredited: false,
      earned: progress.earned,
      unit: progress.unit,
    };
  }
}
