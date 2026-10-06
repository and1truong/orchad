import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { appId, failure, success } from "../shared/contract.ts";
import type { Invoke, Result } from "../shared/contract.ts";
import { catalog } from "../shared/catalog.ts";
import { forceStaleStep, scenarios, type Scenario } from "./fake-mango.ts";
import "../client/style.css";

type Session = { principal: string; role: string; orgId: string; csrf: string; sessionEpoch: string };

type LogEntry = {
  at: string;
  note: string;
  call: Invoke | null;
  result: Result;
  decision: "approved" | "denied" | "cancelled" | "manual";
};

let csrf = "";
const api = async (path: string, body?: unknown) => {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: body
      ? { "Content-Type": "application/json", "X-CSRF-Token": csrf }
        : {},
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
  });
  return res.json();
};

// Host-driver: mimics lime's dispatch — reads need null revision+key, writes
// need both. Approve → bridge invoke; deny → APPROVAL_DENIED without calling;
// cancel → abort the rest of the scenario.
class HostDriver {
  revisions = new Map<string, number>();
  principal = "";
  orgId = "";
  lastEnrollmentId = "";
  constructor(private log: (e: LogEntry) => void) {}
  doc(raw: string) {
    return raw
      .replace("{self}", this.principal)
      .replace("{lastEnrollmentId}", this.lastEnrollmentId);
  }
  args(raw: Record<string, unknown>) {
    return JSON.parse(
      JSON.stringify(raw).replaceAll(
        "{lastEnrollmentId}",
        this.lastEnrollmentId,
      ),
    ) as Record<string, unknown>;
  }
  async runStep(
    scenarioId: string,
    index: number,
    step: { note: string; toolName: string; arguments: Record<string, unknown>; write: boolean; documentId: string },
    decision: "approved" | "denied" | "cancelled" | "manual",
  ) {
    const documentId = this.doc(step.documentId);
    if (decision === "denied") {
      const result = failure(
        "APPROVAL_DENIED",
        "Host từ chối call trước khi tới app (consent/approval).",
        false,
        null,
      );
      this.log({ at: new Date().toISOString(), note: step.note, call: null, result, decision });
      return result;
    }
    if (decision === "cancelled") {
      const result = failure("CANCELLED", "Người dùng hủy chuỗi agent.", false, null);
      this.log({ at: new Date().toISOString(), note: step.note, call: null, result, decision });
      return result;
    }
    const expected = this.revisions.get(documentId) ?? 0;
    const call: Invoke = {
      requestId: crypto.randomUUID(),
      documentId,
      toolName: step.toolName,
      arguments: this.args(step.arguments),
      expectedRevision: step.write
        ? forceStaleStep(scenarioId, index)
          ? expected - 1
          : expected
        : null,
      idempotencyKey: step.write ? crypto.randomUUID() : null,
    };
    const result = (await api("/api/invoke", call)) as Result;
    if (result.revision !== null && result.revision !== undefined)
      this.revisions.set(documentId, result.revision);
    if (result.ok && step.toolName === "learning_enroll")
      this.lastEnrollmentId = String(
        (result.data as { enrollmentId?: string }).enrollmentId ?? "",
      );
    this.log({ at: new Date().toISOString(), note: step.note, call, result, decision });
    return result;
  }
}

function Harness() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState("learner1");
  const [pass, setPass] = useState("learner-dev");
  const [scenario, setScenario] = useState<Scenario>(scenarios[0]);
  const [stepIdx, setStepIdx] = useState(-1);
  const [driver] = useState(() => new HostDriver((e) => setLog((l) => [...l, e])));
  const [log, setLog] = useState<LogEntry[]>([]);
  const [context, setContext] = useState<unknown>(null);
  const [manualTool, setManualTool] = useState(catalog[0].name);
  const [manualArgs, setManualArgs] = useState("{}");
  const [manualDoc, setManualDoc] = useState("");
  const login = async () => {
    const r = await api("/api/login", { username: user, password: pass });
    if (!r.ok) return;
    const s = await api("/api/session");
    csrf = s.data.csrf;
    setSession(s.data);
    driver.principal = s.data.principal;
    driver.orgId = s.data.orgId;
  };
  useEffect(() => {
    void (async () => {
      try {
        const s = await api("/api/session");
        if (s?.data?.principal) {
          csrf = s.data.csrf;
          setSession(s.data);
          driver.principal = s.data.principal;
          driver.orgId = s.data.orgId;
        }
      } catch {
        /* not logged in */
      }
    })();
  }, []);
  if (!session)
    return (
      <div className="login">
        <div className="brand">Pear · Harness</div>
        <h1>Host + fake Mango</h1>
        <label>
          Tài khoản
          <input value={user} onChange={(e) => setUser(e.target.value)} />
        </label>
        <label>
          Mật khẩu
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
        </label>
        <div style={{ marginTop: 16 }}>
          <button className="primary" onClick={login}>
            Đăng nhập
          </button>
        </div>
        <div className="hint">
          Trang này mô phỏng host (Lime) + gateway (Mango): describe →
          getContext → approve/deny/cancel từng call → invoke qua
          /api/invoke. Không có model thật — fake Mango phát ra chuỗi call
          deterministic.
        </div>
      </div>
    );
  const step = stepIdx >= 0 ? scenario.steps[stepIdx] : null;
  const decide = async (d: "approved" | "denied" | "cancelled") => {
    if (!step) return;
    await driver.runStep(scenario.id, stepIdx, step, d);
    if (d === "cancelled" || stepIdx === scenario.steps.length - 1) {
      setStepIdx(-1);
    } else setStepIdx(stepIdx + 1);
  };
  const freshContext = async () => {
    const s = await api("/api/session");
    setContext({
      appId,
      documentId: `workspace:${session.principal}`,
      revision: driver.revisions.get(`workspace:${session.principal}`) ?? 0,
      selectionIds: [],
      summary: `Harness: ${session.principal} (${session.role})`,
      sessionEpoch: s.data.sessionEpoch,
    });
  };
  const runManual = async () => {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(manualArgs || "{}");
    } catch {
      return;
    }
    const tool = catalog.find((t) => t.name === manualTool)!;
    const write = [
      "learning_enroll",
      "learning_set_bookmark",
      "learning_start_attempt",
      "learning_save_answer",
      "learning_submit_attempt",
      "learning_save_course",
      "learning_publish_course",
      "learning_create_assignment",
    ].includes(tool.name);
    const step = {
      note: `manual ${tool.name}`,
      toolName: tool.name,
      arguments: args,
      write,
      documentId: manualDoc || `workspace:${session.principal}`,
    };
    await driver.runStep("manual", -1, step, "manual");
  };
  return (
    <div className="page" style={{ maxWidth: 1180 }}>
      <div className="row">
        <h2 style={{ marginBottom: 0 }}>Pear harness</h2>
        <span className="chip">{session.principal}</span>
        <span className="chip">{session.role}</span>
        <button className="right" onClick={freshContext}>
          getContext
        </button>
      </div>
      {context != null && (
        <pre className="card mono" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(context, null, 2)}
        </pre>
      )}
      <div className="section-title">Fake Mango — kịch bản deterministic</div>
      <div className="row" style={{ marginBottom: 12 }}>
        <select
          style={{ flex: 1 }}
          value={scenario.id}
          onChange={(e) =>
            setScenario(scenarios.find((s) => s.id === e.target.value)!)
          }
          disabled={stepIdx >= 0}
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <button
          className="primary"
          disabled={stepIdx >= 0}
          onClick={() => {
            setLog([]);
            setStepIdx(0);
          }}
        >
          Chạy
        </button>
      </div>
      {step && (
        <div className="card" style={{ borderColor: "#c9a227" }}>
          <small>
            Bước {stepIdx + 1}/{scenario.steps.length} — {step.note}
          </small>
          <pre className="mono" style={{ margin: "10px 0" }}>
            {step.toolName} {JSON.stringify(step.arguments)} →{" "}
            {driver.doc(step.documentId)}
          </pre>
          <div className="row">
            <button className="primary" onClick={() => void decide("approved")}>
              Approve
            </button>
            <button onClick={() => void decide("denied")}>Deny</button>
            <button onClick={() => void decide("cancelled")}>Cancel</button>
            <small>host quyết định trước khi call tới app</small>
          </div>
        </div>
      )}
      <div className="section-title">Console invoke thủ công</div>
      <div className="card">
        <div className="row">
          <select
            style={{ flex: 1 }}
            value={manualTool}
            onChange={(e) => setManualTool(e.target.value)}
          >
            {catalog.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            style={{ flex: 1 }}
            placeholder="documentId (mặc định workspace)"
            value={manualDoc}
            onChange={(e) => setManualDoc(e.target.value)}
          />
        </div>
        <label>
          arguments (JSON)
          <textarea
            rows={3}
            className="mono"
            value={manualArgs}
            onChange={(e) => setManualArgs(e.target.value)}
          />
        </label>
        <button onClick={() => void runManual()} style={{ marginTop: 10 }}>
          Invoke
        </button>
      </div>
      <div className="section-title">Call log ({log.length})</div>
      {log.map((e, i) => (
        <div className="card" key={i} style={{ marginBottom: 8 }}>
          <small>
            {e.decision.toUpperCase()} · {e.note}
          </small>
          {e.call && (
            <pre className="mono" style={{ margin: "6px 0", whiteSpace: "pre-wrap" }}>
              → {JSON.stringify(e.call)}
            </pre>
          )}
          <pre
            className="mono"
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              color: e.result.ok ? "#1c7a5a" : "#a23030",
            }}
          >
            ← {JSON.stringify(e.result)}
          </pre>
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
