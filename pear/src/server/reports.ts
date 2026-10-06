import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { validateArgs } from "@orchard/bridge-contract";
import type { Principal } from "../shared/model.ts";
import {
  freshReport,
  reportSchema,
  reportColumns,
  type ReportSpec,
} from "../shared/reports.ts";
import { ProgramService } from "./programs.ts";
import { encodeCsv } from "../shared/csv.ts";
import { reject, boundedPage } from "./errors.ts";
export class ReportService {
  readonly programs: ProgramService;
  constructor(readonly db: DatabaseSync) {
    this.programs = new ProgramService(db);
  }
  private audience(p: Principal, own = false) {
    return (
      this.db
        .prepare(
          "SELECT id,name,manager_id FROM accounts WHERE tenant=? ORDER BY id",
        )
        .all(p.tenant) as any[]
    ).filter((u) =>
      own ? u.id === p.id : p.role === "admin" || u.manager_id === p.id,
    );
  }
  private date(value: string | null) {
    if (
      value &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value + "T00:00:00Z")) ||
        new Date(value + "T00:00:00Z").toISOString().slice(0, 10) !== value)
    )
      reject("INVALID_ARGUMENT", "Invalid UTC report date");
  }
  private validate(p: Principal, s: ReportSpec) {
    if (
      !validateArgs(reportSchema, s) ||
      new Set(s.columns).size !== s.columns.length
    )
      reject(
        "INVALID_ARGUMENT",
        "Invalid report specification/duplicate columns",
      );
    this.date(s.completedFrom);
    this.date(s.completedTo);
    if (s.completedFrom && s.completedTo && s.completedFrom > s.completedTo)
      reject("INVALID_ARGUMENT", "Report date range reversed");
    if (s.learnerId && !this.audience(p).some((u) => u.id === s.learnerId))
      reject("FORBIDDEN", "Learner filter outside current audience scope");
    return s;
  }
  private saved(p: Principal, id: string) {
    const row = this.db
      .prepare(
        "SELECT * FROM saved_reports WHERE id=? AND tenant=? AND owner=?",
      )
      .get(id, p.tenant, p.id) as any;
    if (!row) reject("FORBIDDEN", "Saved report owner scope denied");
    return row;
  }
  authorize(p: Principal, name: string, a: any) {
    if (name === "learning_delete_report") this.saved(p, a.reportId);
    if (name === "learning_save_report") {
      const old = this.db
        .prepare("SELECT id FROM saved_reports WHERE id=?")
        .get(a.reportId);
      if (old) this.saved(p, a.reportId);
    }
  }
  private rows(p: Principal, own = false) {
    const audience = this.audience(p, own),
      names = new Map(audience.map((u) => [u.id, u.name])),
      now = Date.now();
    const status = (e: any) =>
      e.completed_at
        ? "completed"
        : e.assignment_state !== "active"
          ? e.assignment_state
          : e.due_date && Date.parse(e.due_date) < now
            ? "overdue"
            : "in_progress";
    const courses = (
      this.db
        .prepare(
          "SELECT e.*,v.content FROM enrollments e JOIN course_versions v ON v.course_id=e.course_id AND v.version=e.version JOIN courses c ON c.id=e.course_id AND c.tenant=e.tenant WHERE e.tenant=? ORDER BY e.id",
        )
        .all(p.tenant) as any[]
    )
      .filter((e) => names.has(e.learner))
      .map((e) => {
        const content = JSON.parse(e.content),
          completed = JSON.parse(e.completed_lessons),
          score =
            (
              this.db
                .prepare(
                  "SELECT score FROM attempts WHERE enrollment_id=? AND submitted=1 ORDER BY number DESC LIMIT 1",
                )
                .get(e.id) as any
            )?.score ?? null;
        return {
          id: e.id,
          learnerId: e.learner,
          learnerName: names.get(e.learner),
          contentId: e.course_id,
          title: content.title,
          kind: "course",
          version: e.version,
          status: status(e),
          source: e.assigned_by ? "assigned" : "self",
          dueDate: e.due_date,
          completedAt: e.completed_at,
          progress: Math.round(
            (completed.length / content.lessons.length) * 100,
          ),
          earned: null,
          target: null,
          unit: null,
          cycleId: e.assignment_cycle_id,
          score,
          requiredComplete: e.status === "completed",
        };
      });
    const awards = this.programs
      .reportSummaries(
        p.tenant,
        audience.map((u) => u.id),
      )
      .map((e: any) => ({
        id: e.id,
        learnerId: e.learner,
        learnerName: names.get(e.learner),
        contentId: e.award_id,
        title: e.title,
        kind: "award",
        version: e.version,
        status: status(e),
        source: e.assigned_by ? "assigned" : "self",
        dueDate: e.due_date,
        completedAt: e.completed_at,
        progress: Math.min(100, Math.floor((e.earned / e.target) * 100)),
        earned: e.earned,
        target: e.target,
        unit: e.unit,
        cycleId: e.assignment_cycle_id,
        score: null,
        requiredComplete: e.requiredComplete,
      }));
    const items = (
      this.db
        .prepare(
          "SELECT e.*,v.content FROM item_enrollments e JOIN content_item_versions v ON v.item_id=e.item_id AND v.version=e.version JOIN content_items i ON i.id=e.item_id AND i.tenant=e.tenant WHERE e.tenant=? ORDER BY e.id",
        )
        .all(p.tenant) as any[]
    )
      .filter((e) => names.has(e.learner))
      .map((e) => ({
        id: e.id,
        learnerId: e.learner,
        learnerName: names.get(e.learner),
        contentId: e.item_id,
        title: JSON.parse(e.content).title,
        kind: "item",
        version: e.version,
        status: e.completed_at ? "completed" : "in_progress",
        source: "self",
        dueDate: null,
        completedAt: e.completed_at,
        progress: e.completed_at ? 100 : 0,
        earned: null,
        target: null,
        unit: null,
        cycleId: null,
        score: null,
        requiredComplete: null,
      }));
    return [...courses, ...awards, ...items].map(row => {
      const measured = row.kind==="award" ? null : this.db.prepare(
        "SELECT elapsed_ms FROM study_totals WHERE tenant=? AND learner=? AND kind=? AND target_id=?"
      ).get(p.tenant,row.learnerId,row.kind,row.id) as any;
      return {...row, estimatedMinutes: row.kind==="course"
        ? JSON.parse((this.db.prepare("SELECT content FROM course_versions WHERE course_id=? AND version=?").get(row.contentId,row.version) as any).content).duration
        : null,
        observedSeconds: row.kind==="award" ? null : Math.floor((measured?.elapsed_ms ?? 0)/1000)};
    });
  }
  pdfRows(p:Principal,a:any){
    const live=this.db.prepare("SELECT tenant,role,active,auth_version FROM accounts WHERE id=?").get(p.id) as any;
    if(!live?.active||live.tenant!==p.tenant||live.role!==p.role||live.auth_version!==p.auth_version)reject("UNAUTHORIZED","Report authority changed");
    if(!["admin","manager"].includes(p.role))reject("FORBIDDEN","Report export role required");
    if(!["filtered","all"].includes(a.rows)||!["visible","all"].includes(a.columns)||!/^[a-f0-9]{64}$/.test(a.snapshotHash??""))reject("INVALID_ARGUMENT","Review exact report export scope before PDF download");
    const spec=this.validate(p,a.spec),scoped=this.rows(p),rows=this.ordered(a.rows==="filtered"?this.filtered(scoped,spec):scoped,spec),columns=a.columns==="visible"?spec.columns:[...reportColumns];
    this.snapshot(p,rows,spec,a.rows+":"+a.columns,a.snapshotHash);
    if(rows.length>500)reject("INVALID_ARGUMENT","Report exceeds server PDF row bounds; use CSV or browser print");
    return {title:spec.title,rows,columns,snapshotHash:a.snapshotHash};
  }
  ownLedger(p:Principal){
    const live=this.db.prepare("SELECT tenant,active,auth_version FROM accounts WHERE id=?").get(p.id) as any;
    if(!live?.active||live.tenant!==p.tenant||live.auth_version!==p.auth_version)reject("UNAUTHORIZED","Own insight authority changed");
    return this.rows(p,true);
  }
  private filtered(rows: any[], s: ReportSpec) {
    const q = s.query.normalize("NFKC").toLowerCase();
    return rows.filter(
      (r) =>
        (s.template !== "completions" || r.status === "completed") &&
        (s.template !== "overdue" || r.status === "overdue") &&
        (s.template !== "awards" || r.kind === "award") &&
        (!q ||
          [r.learnerName, r.title, r.contentId, r.learnerId].some((v) =>
            String(v).normalize("NFKC").toLowerCase().includes(q),
          )) &&
        (s.kind === "all" || r.kind === s.kind) &&
        (s.status === "all" || r.status === s.status) &&
        (s.source === "all" || r.source === s.source) &&
        (!s.learnerId || r.learnerId === s.learnerId) &&
        (!s.contentId || r.contentId === s.contentId) &&
        (!s.completedFrom ||
          (r.completedAt && r.completedAt.slice(0, 10) >= s.completedFrom)) &&
        (!s.completedTo ||
          (r.completedAt && r.completedAt.slice(0, 10) <= s.completedTo)),
    );
  }
  private ordered(rows: any[], s: ReportSpec) {
    return rows.sort((a, b) => {
      const first = a[s.sortBy],
        second = b[s.sortBy],
        compare =
          first == null
            ? second == null
              ? 0
              : -1
            : second == null
              ? 1
              : first < second
                ? -1
                : first > second
                  ? 1
                  : 0;
      return compare
        ? s.descending
          ? -compare
          : compare
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0;
    });
  }
  private snapshot(
    p: Principal,
    rows: any[],
    s: ReportSpec,
    mode: string,
    expected?: string,
  ) {
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          principal: p.id,
          tenant: p.tenant,
          role: p.role,
          rows,
          s,
          mode,
        }),
      )
      .digest("hex");
    if (expected && hash !== expected)
      reject(
        "STALE_CONTEXT",
        "Report data/scope changed; restart the preview/export",
      );
    return hash;
  }
  read(p: Principal, name: string, a: any): any {
    switch (name) {
      case "learning_get_transcript": {
        const spec = freshReport();
        spec.sortBy = "title";
        const rows = this.ordered(this.rows(p, true), spec),
          hash = this.snapshot(p, rows, spec, "own", a.snapshotHash);
        return {
          ...boundedPage(rows, a.offset ?? 0, a.limit ?? 50),
          columns: reportColumns,
          snapshotHash: hash,
        };
      }
      case "learning_report_summary": {
        const spec=this.validate(p,a.spec),rows=this.ordered(this.filtered(this.rows(p),spec),spec),snapshotHash=this.snapshot(p,rows,spec,"filtered:visible",a.snapshotHash);
        const statuses=["in_progress","overdue","completed","withdrawn","cancelled"],counts=new Map<string,number>();
        for(const row of rows)counts.set(row.status,(counts.get(row.status)??0)+1);
        if([...counts.keys()].some(status=>!statuses.includes(status)))reject("INTERNAL","Unsupported report status");
        return {title:spec.title,rowTotal:rows.length,statusCounts:statuses.map(status=>({status,count:counts.get(status)??0})),snapshotHash,scope:"entire_filtered_authorized_audience",unit:"learning_records",includesRecurringCycles:true,definition:"Status counts of filtered own organization/direct-report learning records. Standalone completion is learner-confirmed; these are not unique learners, mastery or benchmark values."};
      }
      case "learning_report_preview": {
        const spec = this.validate(p, a.spec),
          rows = this.ordered(this.filtered(this.rows(p), spec), spec),
          hash = this.snapshot(
            p,
            rows,
            spec,
            "filtered:visible",
            a.snapshotHash,
          );
        return {
          ...boundedPage(
            rows.map((row) =>
              Object.fromEntries(
                ["id", ...spec.columns].map((key) => [key, row[key]]),
              ),
            ),
            a.offset ?? 0,
            a.limit ?? 50,
          ),
          columns: spec.columns,
          title: spec.title,
          snapshotHash: hash,
        };
      }
      case "learning_list_saved_reports":
        return boundedPage(
          (
            this.db
              .prepare(
                "SELECT id,owner,spec,version FROM saved_reports WHERE tenant=? AND owner=? ORDER BY id",
              )
              .all(p.tenant, p.id) as any[]
          ).map(({ spec, ...row }) => ({ ...row, spec: JSON.parse(spec) })),
          a.offset ?? 0,
          a.limit ?? 50,
        );
      case "learning_export_report": {
        const spec = this.validate(p, a.spec),
          scoped = this.rows(p),
          rows = this.ordered(
            a.rows === "filtered" ? this.filtered(scoped, spec) : scoped,
            spec,
          ),
          columns = a.columns === "visible" ? spec.columns : [...reportColumns],
          hash = this.snapshot(
            p,
            rows,
            spec,
            a.rows + ":" + a.columns,
            a.snapshotHash,
          ),
          offset = a.offset ?? 0,
          page = boundedPage(rows, offset, a.limit ?? 50);
        let csv = encodeCsv([
          columns,
          ...page.items.map((row) => columns.map((key) => row[key])),
        ]);
        while (
          page.items.length &&
          Buffer.byteLength(JSON.stringify({ csv })) > 48 * 1024
        ) {
          page.items.pop();
          csv = encodeCsv([
            columns,
            ...page.items.map((row) => columns.map((key) => row[key])),
          ]);
        }
        return {
          csv,
          columns,
          snapshotHash: hash,
          total: rows.length,
          offset,
          nextOffset:
            offset + page.items.length < rows.length
              ? offset + page.items.length
              : null,
        };
      }
      default:
        reject("UNSUPPORTED", "Unknown report read");
    }
  }
  write(p: Principal, name: string, a: any): any {
    switch (name) {
      case "learning_save_report":
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(a.reportId))
          reject("INVALID_ARGUMENT", "Invalid saved report ID");
        this.validate(p, a.spec);
        this.db
          .prepare(
            "INSERT INTO saved_reports VALUES(?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET spec=excluded.spec,version=saved_reports.version+1",
          )
          .run(a.reportId, p.tenant, p.id, JSON.stringify(a.spec));
        return {
          reportId: a.reportId,
          version: this.saved(p, a.reportId).version,
          owner: p.id,
        };
      case "learning_delete_report":
        this.db
          .prepare(
            "DELETE FROM saved_reports WHERE id=? AND tenant=? AND owner=?",
          )
          .run(a.reportId, p.tenant, p.id);
        return {
          reportId: a.reportId,
          deleted: true,
          learningRecordsPreserved: true,
        };
      default:
        reject("UNSUPPORTED", "Unknown report write");
    }
  }
}
