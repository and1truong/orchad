import { printView } from "./print.ts";
import React, { useEffect, useRef, useState } from "react";
import {
  freshReport,
  reportColumns,
  type ReportSpec,
  type ReportColumn,
} from "../shared/reports.ts";
import { encodeCsv, parseCsv } from "../shared/csv.ts";
type Props = {
  administrative: boolean;
  tick: number;
  busy: boolean;
  op: (name: string, args?: Record<string, unknown>) => Promise<any>;
  mutate: (name: string, args: Record<string, unknown>) => Promise<any>;
  run: (fn: () => Promise<void>) => Promise<boolean>;
  isCurrent: () => boolean;
};
const labels: Record<ReportColumn, string> = {
  learnerId: "Learner ID",
  learnerName: "Learner",
  contentId: "Content ID",
  title: "Content",
  kind: "Type",
  version: "Version",
  status: "Status",
  source: "Origin",
  dueDate: "Deadline (UTC)",
  completedAt: "Completed (UTC)",
  progress: "Progress (%)",
  earned: "Earned",
  target: "Target",
  unit: "Units",
  cycleId: "Cycle ID",
  score: "Quiz score (%)",
  requiredComplete: "Required satisfied",
  estimatedMinutes: "Intended duration (minutes)",
  observedSeconds: "Study timer (seconds)",
};
const download = (csv: string, name: string) => {
  const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const display = (v: any) =>
  v === null || v === undefined
    ? "—"
    : typeof v === "boolean"
      ? v
        ? "Yes"
        : "No"
      : String(v);
function Table({ rows, columns }: { rows: any[]; columns: ReportColumn[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {labels[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((c) => (
                <td key={c}>{display(row[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Reports(p: Props) {
  const [spec, setSpec] = useState<ReportSpec>(freshReport),
    [rows, setRows] = useState<any[]>([]),
    [columns, setColumns] = useState<ReportColumn[]>(freshReport().columns),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState<number | null>(null),
    [total, setTotal] = useState(0),
    [saved, setSaved] = useState<any[]>([]),
    [savedOffset, setSavedOffset] = useState(0),
    [savedNext, setSavedNext] = useState<number | null>(null),
    [reportId, setReportId] = useState(""),
    [rowMode, setRowMode] = useState<"filtered" | "all">("filtered"),
    [columnMode, setColumnMode] = useState<"visible" | "all">("visible"),
    [refresh, setRefresh] = useState(0),
    [loadError, setLoadError] = useState(""),
    [notice, setNotice] = useState(""),
    [printModel, setPrintModel] = useState<{
      title: string;
      rows: any[];
      columns: ReportColumn[];
      snapshot: string;
    } | null>(null);
  const printRef = useRef<HTMLElement>(null);
  const alive = useRef(true),
    generation = useRef(0),
    snapshot = useRef<string | undefined>(undefined);
  useEffect(() => {
    return () => {
      alive.current = false;
    };
  }, []);
  const current = () => {
    if (!alive.current || !p.isCurrent())
      throw Error("Workspace changed; restart export");
  };
  useEffect(() => {
    let live = true;
    const n = ++generation.current;
    void (async () => {
      const response = await p.op(
        p.administrative
          ? "learning_report_preview"
          : "learning_get_transcript",
        {
          ...(p.administrative ? { spec } : {}),
          offset,
          limit: 20,
          ...(offset && snapshot.current
            ? { snapshotHash: snapshot.current }
            : {}),
        },
      );
      const savedPage = p.administrative
        ? await p.op("learning_list_saved_reports", {
            offset: savedOffset,
            limit: 20,
          })
        : null;
      if (!live || n !== generation.current) return;
      snapshot.current = response.snapshotHash;
      setRows(response.items);
      setColumns(p.administrative ? response.columns : spec.columns);
      setNext(response.nextOffset);
      setTotal(response.total);
      setLoadError("");
      if (savedPage) {
        setSaved(savedPage.items);
        setSavedNext(savedPage.nextOffset);
      }
    })().catch((e) => {
      if (live) {
        setLoadError(e.message);
        setRows([]);
      }
    });
    return () => {
      live = false;
    };
  }, [p.administrative, p.tick, offset, savedOffset, spec, refresh]);
  const change = (next: ReportSpec) => {
    setSpec(next);
    setOffset(0);
    snapshot.current = undefined;
    setPrintModel(null);
  };
  const collect = async () => {
    current();
    let offset = 0,
      hash: string | undefined = undefined;
    const full: any[] = [];
    let columns: ReportColumn[] =
      columnMode === "visible" ? spec.columns : [...reportColumns];
    do {
      const result = await p.op(
        p.administrative ? "learning_export_report" : "learning_get_transcript",
        {
          ...(p.administrative
            ? { spec, rows: rowMode, columns: columnMode }
            : {}),
          offset,
          limit: 50,
          ...(hash ? { snapshotHash: hash } : {}),
        },
      );
      current();
      hash = result.snapshotHash;
      if (p.administrative) {
        columns = result.columns;
        const parsed = parseCsv(result.csv);
        full.push(
          ...parsed.slice(1).map((values, i) => ({
            id: `export-${offset + i}`,
            ...Object.fromEntries(columns.map((c, n) => [c, values[n]])),
          })),
        );
      } else full.push(...result.items);
      if (result.nextOffset === null) break;
      if (result.nextOffset <= offset) throw Error("Export did not advance");
      offset = result.nextOffset;
    } while (true);
    current();
    return { rows: full, columns, snapshot: hash! };
  };
  useEffect(() => {
    if (printModel) {
      requestAnimationFrame(() => {
        if (alive.current && p.isCurrent() && printRef.current)
          printView(printRef.current);
      });
    }
  }, [printModel]);
  return (
    <section
      className="reports"
      aria-label={p.administrative ? "Report builder" : "Learning transcript"}
    >
      <h2>{p.administrative ? "Learning reports" : "Your transcript"}</h2>
      <p>
        Course progress measures acknowledged lessons; the quiz score is
        separate. Award progress measures its credit target; required learning
        still applies. Estimated course duration is not elapsed learning time.
      </p>
      {loadError && <p role="alert">{loadError}</p>}
      <button
        className="ghost"
        disabled={p.busy}
        onClick={() => {
          snapshot.current = undefined;
          setOffset(0);
          setRefresh((n) => n + 1);
          setPrintModel(null);
        }}
      >
        Refresh report
      </button>
      {notice && <p role="status">{notice}</p>}
      {p.administrative && (
        <>
          <h3>Saved reports</h3>
          {saved.map((r) => (
            <section className="learning-row" key={r.id}>
              <div>
                <h4>{r.spec.title}</h4>
                <p>
                  ID {r.id} · Owner {r.owner} · Version {r.version}
                </p>
              </div>
              <button
                className="ghost"
                onClick={() => {
                  setReportId(r.id);
                  change(r.spec);
                }}
              >
                Open saved report
              </button>
              <button
                className="ghost"
                disabled={p.busy}
                onClick={() =>
                  void p.run(async () => {
                    await p.mutate("learning_delete_report", {
                      reportId: r.id,
                    });
                    setNotice(
                      "Report definition deleted; learning records preserved.",
                    );
                  })
                }
              >
                Delete saved report
              </button>
            </section>
          ))}
          <button
            className="ghost"
            disabled={savedOffset === 0 || p.busy}
            onClick={() => setSavedOffset(Math.max(0, savedOffset - 20))}
          >
            Previous saved reports
          </button>
          <button
            className="ghost"
            disabled={savedNext === null || p.busy}
            onClick={() => setSavedOffset(savedNext!)}
          >
            Next saved reports
          </button>
          <form
            className="panel"
            aria-label="Report specification"
            onSubmit={(e) => {
              e.preventDefault();
              void p.run(async () => {
                await p.mutate("learning_save_report", { reportId, spec });
                setNotice(
                  "Own report saved. Data stays within your current audience scope.",
                );
              });
            }}
          >
            <fieldset disabled={p.busy}>
              <label>
                Report ID
                <input
                  value={reportId}
                  required
                  maxLength={64}
                  pattern="[A-Za-z0-9_-]+"
                  onChange={(e) => setReportId(e.target.value)}
                />
              </label>
              <label>
                Report title
                <input
                  value={spec.title}
                  required
                  maxLength={160}
                  onChange={(e) => change({ ...spec, title: e.target.value })}
                />
              </label>
              <label>
                Report template
                <select
                  aria-label="Report template"
                  value={spec.template}
                  onChange={(e) =>
                    change({ ...spec, template: e.target.value as any })
                  }
                >
                  {["progress", "completions", "overdue", "awards"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Report keywords
                <input
                  value={spec.query}
                  maxLength={200}
                  onChange={(e) => change({ ...spec, query: e.target.value })}
                />
              </label>
              <label>
                Report type
                <select
                  aria-label="Report type"
                  value={spec.kind}
                  onChange={(e) =>
                    change({ ...spec, kind: e.target.value as any })
                  }
                >
                  {["all", "course", "award", "item"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Report status
                <select
                  aria-label="Report status"
                  value={spec.status}
                  onChange={(e) =>
                    change({ ...spec, status: e.target.value as any })
                  }
                >
                  {[
                    "all",
                    "in_progress",
                    "completed",
                    "overdue",
                    "withdrawn",
                    "cancelled",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Report origin
                <select
                  aria-label="Report origin"
                  value={spec.source}
                  onChange={(e) =>
                    change({ ...spec, source: e.target.value as any })
                  }
                >
                  {["all", "assigned", "self"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Filter learner ID · optional
                <input
                  value={spec.learnerId}
                  maxLength={64}
                  onChange={(e) =>
                    change({ ...spec, learnerId: e.target.value })
                  }
                />
              </label>
              <label>
                Filter content ID · optional
                <input
                  value={spec.contentId}
                  maxLength={64}
                  onChange={(e) =>
                    change({ ...spec, contentId: e.target.value })
                  }
                />
              </label>
              <label>
                Completed from · UTC date
                <input
                  type="date"
                  value={spec.completedFrom ?? ""}
                  onChange={(e) =>
                    change({ ...spec, completedFrom: e.target.value || null })
                  }
                />
              </label>
              <label>
                Completed through · UTC date
                <input
                  type="date"
                  value={spec.completedTo ?? ""}
                  onChange={(e) =>
                    change({ ...spec, completedTo: e.target.value || null })
                  }
                />
              </label>
              <label>
                Sort column
                <select
                  aria-label="Sort column"
                  value={spec.sortBy}
                  onChange={(e) =>
                    change({ ...spec, sortBy: e.target.value as ReportColumn })
                  }
                >
                  {reportColumns.map((c) => (
                    <option value={c} key={c}>
                      {labels[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={spec.descending}
                  onChange={(e) =>
                    change({ ...spec, descending: e.target.checked })
                  }
                />
                Descending order
              </label>
              <button>Save own report</button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setReportId("");
                  change(freshReport());
                }}
              >
                New report
              </button>
            </fieldset>
          </form>
        </>
      )}
      <fieldset disabled={p.busy}>
        <legend>Visible report columns</legend>
        {reportColumns.map((c) => (
          <label className="choice" key={c}>
            <input
              type="checkbox"
              aria-label={"Show column " + labels[c]}
              checked={spec.columns.includes(c)}
              disabled={spec.columns.length === 1 && spec.columns.includes(c)}
              onChange={(e) =>
                change({
                  ...spec,
                  columns: e.target.checked
                    ? [...spec.columns, c]
                    : spec.columns.filter((old) => old !== c),
                })
              }
            />
            {labels[c]}
          </label>
        ))}
      </fieldset>
      <h3>{p.administrative ? spec.title : "Learning transcript"}</h3>
      <p>
        {total} authorized records · Rows {rows.length ? offset + 1 : 0}–
        {offset + rows.length}
      </p>
      <Table rows={rows} columns={columns} />
      <div className="actions">
        <button
          className="ghost"
          disabled={p.busy || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          Previous report rows
        </button>
        <button
          className="ghost"
          disabled={p.busy || next === null}
          onClick={() => setOffset(next!)}
        >
          Next report rows
        </button>
      </div>
      <section className="panel">
        <h3>Export</h3>
        {p.administrative && (
          <label>
            Export rows
            <select
              aria-label="Export rows"
              value={rowMode}
              onChange={(e) => setRowMode(e.target.value as any)}
            >
              <option value="filtered">Filtered rows</option>
              <option value="all">All rows within current access</option>
            </select>
          </label>
        )}
        <label>
          Export columns
          <select
            aria-label="Export columns"
            value={columnMode}
            onChange={(e) => setColumnMode(e.target.value as any)}
          >
            <option value="visible">Visible columns</option>
            <option value="all">All report columns</option>
          </select>
        </label>
        <button
          disabled={p.busy}
          onClick={() =>
            void p.run(async () => {
              const result = await collect();
              download(
                encodeCsv([
                  result.columns,
                  ...result.rows.map((row) =>
                    result.columns.map((c) => row[c]),
                  ),
                ]),
                p.administrative ? "pear-report.csv" : "pear-transcript.csv",
              );
              setNotice("CSV exported from one authorized ledger snapshot.");
            })
          }
        >
          Download {p.administrative ? "report" : "transcript"} CSV
        </button>
        <button
          className="ghost"
          disabled={p.busy}
          onClick={() =>
            void p.run(async () => {
              const result = await collect();
              setPrintModel({
                title: p.administrative ? spec.title : "Learning transcript",
                ...result,
              });
            })
          }
        >
          Print / save {p.administrative ? "report" : "transcript"} PDF
        </button>
        <p>
          The print view contains the selected rows and columns. Choose Save as
          PDF in your browser's print dialog.
        </p>
      </section>
      {printModel && (
        <section
          ref={printRef}
          className="print-report"
          aria-label="Export print view"
        >
          <h2>{printModel.title}</h2>
          <p>
            Authorized ledger snapshot · {new Date().toISOString()} ·{" "}
            {printModel.rows.length} records
          </p>
          <Table rows={printModel.rows} columns={printModel.columns} />
          <p>
            Self-authored synthetic development learning. No accreditation
            claim.
          </p>
          <button className="ghost" onClick={() => setPrintModel(null)}>
            Close print view
          </button>
        </section>
      )}
    </section>
  );
}
