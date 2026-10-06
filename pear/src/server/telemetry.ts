import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { Principal } from "../shared/model.ts";
import { reject } from "./errors.ts";
export class TelemetryService {
  constructor(readonly db: DatabaseSync, private clock: () => number = Date.now) {}
  private target(p: Principal, kind: string, id: string) {
    if (!["course","item"].includes(kind) || typeof id !== "string" || id.length > 64)
      reject("INVALID_ARGUMENT","Invalid study timer target");
    const live=this.db.prepare("SELECT * FROM accounts WHERE id=? AND tenant=?").get(p.id,p.tenant) as any;
    if (!live?.active || live.auth_version !== p.auth_version)
      reject("UNAUTHORIZED","Study timer account authority changed");
    const table=kind==="course"?"enrollments":"item_enrollments";
    const row=this.db.prepare(`SELECT * FROM ${table} WHERE id=? AND tenant=? AND learner=?`).get(id,p.tenant,p.id) as any;
    if (!row || (kind==="course" && row.assignment_state !== "active"))
      reject("FORBIDDEN","Own active learning record required");
  }
  get(p: Principal, kind: string, id: string) {
    this.target(p,kind,id);
    const r=this.db.prepare("SELECT elapsed_ms FROM study_totals WHERE kind=? AND target_id=? AND learner=? AND tenant=?").get(kind,id,p.id,p.tenant) as any;
    return {totalSeconds: Math.floor((r?.elapsed_ms ?? 0)/1000), measurement:"Opt-in server-observed timer intervals; not verified attention or completion"};
  }
  act(p: Principal, binding: string, a: {action:string;kind:string;targetId:string;token?:string|null}) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.target(p,a.kind,a.targetId);
      if (!["start","pulse","stop"].includes(a.action)) reject("INVALID_ARGUMENT","Invalid timer action");
      const now=this.clock();
      let session=this.db.prepare("SELECT * FROM study_sessions WHERE learner=?").get(p.id) as any;
      if (a.action==="start") {
        this.db.prepare("INSERT OR IGNORE INTO study_totals VALUES(?,?,?,?,?,?,0)")
          .run(p.tenant,p.id,a.kind,a.targetId,a.kind==="course"?a.targetId:null,a.kind==="item"?a.targetId:null);
        const token=randomUUID();
        this.db.prepare("INSERT INTO study_sessions VALUES(?,?,?,?,?,?,?) ON CONFLICT(learner) DO UPDATE SET tenant=excluded.tenant,kind=excluded.kind,target_id=excluded.target_id,token=excluded.token,binding=excluded.binding,last_at=excluded.last_at")
          .run(p.id,p.tenant,a.kind,a.targetId,token,binding,now);
        session={token};
      } else {
        if (!session || session.token!==a.token || session.binding!==binding ||
            session.tenant!==p.tenant || session.kind!==a.kind || session.target_id!==a.targetId)
          reject("FORBIDDEN","Study timer lease changed; explicitly start again");
        const delta=now-session.last_at;
        // Gaps and backward clock corrections are never credited. No client duration is accepted.
        if (delta>=0 && delta<=30000)
          this.db.prepare("UPDATE study_totals SET elapsed_ms=elapsed_ms+? WHERE kind=? AND target_id=? AND learner=? AND tenant=?")
            .run(delta,a.kind,a.targetId,p.id,p.tenant);
        if (a.action==="stop") this.db.prepare("DELETE FROM study_sessions WHERE learner=? AND token=?").run(p.id,a.token!);
        else this.db.prepare("UPDATE study_sessions SET last_at=? WHERE learner=? AND token=?").run(now,p.id,a.token!);
      }
      if (a.action!=="pulse")
        this.db.prepare("INSERT INTO audit(tenant,principal,document_id,tool,arguments,created_at) VALUES(?,?,?,?,?,?)")
          .run(p.tenant,p.id,`learning:${p.tenant}:${p.id}`,"human_study_timer_"+a.action,
            JSON.stringify({kind:a.kind,targetId:a.targetId}),new Date(now).toISOString());
      const result={...this.get(p,a.kind,a.targetId),token:a.action==="stop"?null:session.token,active:a.action!=="stop"};
      this.db.exec("COMMIT"); return result;
    } catch(e) {this.db.exec("ROLLBACK");throw e;}
  }
}
