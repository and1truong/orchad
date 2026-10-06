import React, { useEffect, useState } from "react";
export function StandaloneLearning(p: {
  tick: number;
  busy: boolean;
  op: (name: string, args?: Record<string, unknown>) => Promise<any>;
  run: (fn: () => Promise<void>) => Promise<boolean>;
  onRead: (value: any) => void;
}) {
  const [rows, setRows] = useState<any[]>([]),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState<number | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void p
      .op("learning_get_my_items", { offset, limit: 20 })
      .then((r) => {
        if (alive) {
          setRows(r.items);
          setNext(r.nextOffset);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [offset, p.tick]);
  return (
    <section className="panel" aria-label="Standalone learning">
      <h2>Your standalone learning</h2>
      <p>
        Completion records your confirmed reading of this version. It does not
        grant a course score or certificate.
      </p>
      {error && <p role="alert">{error}</p>}
      {!rows.length && <p>No tracked standalone items on this page.</p>}
      {rows.map((row) => (
        <section className="learning-row" key={row.id}>
          <div>
            <h3>{row.title}</h3>
            <p>
              Version {row.version} ·{" "}
              {row.status === "completed" ? "Reading confirmed" : "In progress"}
            </p>
            {row.completedAt && <p>Confirmed {row.completedAt}</p>}
          </div>
          <button
            disabled={p.busy}
            onClick={() =>
              void p.run(async () => {
                const value = await p.op("learning_get_item_enrollment", {
                  itemEnrollmentId: row.id,
                });
                p.onRead({
                  ...value.item,
                  itemEnrollmentId: row.id,
                  status: value.status,
                });
              })
            }
          >
            Open tracked item
          </button>
        </section>
      ))}
      <button
        className="ghost"
        disabled={p.busy || offset === 0}
        onClick={() => setOffset(Math.max(0, offset - 20))}
      >
        Previous tracked items
      </button>
      <button
        className="ghost"
        disabled={p.busy || next === null}
        onClick={() => setOffset(next!)}
      >
        Next tracked items
      </button>
    </section>
  );
}
