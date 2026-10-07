import {translateUI} from "./i18n.ts";
import React, { useEffect, useState } from "react";
function FreshReading({row,p}:{row:any;p:{busy:boolean;mutate:(name:string,args:Record<string,unknown>)=>Promise<any>;op:(name:string,args?:Record<string,unknown>)=>Promise<any>;run:(fn:()=>Promise<void>)=>Promise<boolean>;onRead:(value:any)=>void}}){
 const [confirmed,setConfirmed]=useState(false);
 return <form aria-label={translateUI("Fresh standalone reading")} onSubmit={event=>{event.preventDefault();if(!confirmed)return;void p.run(async()=>{const next=await p.mutate("human_retake_completed_item",{itemEnrollmentId:row.id,version:row.version,confirmed:true}),value=await p.op("learning_get_item_enrollment",{itemEnrollmentId:next.itemEnrollmentId});p.onRead({...value.item,itemEnrollmentId:next.itemEnrollmentId,status:value.status});});}}>
 <p>{translateUI("Start a new reading record for this exact version. Prior confirmed reading remains in history; no completion, study time or award proof is copied.")}</p>
 <label><input type="checkbox" disabled={p.busy} checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>{translateUI("I choose to study this same standalone version again in a fresh record.")}</label>
 <button disabled={p.busy||!confirmed}>{translateUI("Start fresh standalone reading")}</button></form>;
}
export function StandaloneLearning(p: {
  tick: number;
  busy: boolean;
  mutate:(name:string,args:Record<string,unknown>)=>Promise<any>;
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
    <section className="panel" aria-label={translateUI("Standalone learning")}>
      <h2>{translateUI("Your standalone learning")}</h2>
      <p>{translateUI("Completion records your confirmed reading of this version. It does not grant a course score or certificate.")}</p>
      {error && <p role="alert">{error}</p>}
      {!rows.length && <p>{translateUI("No tracked standalone items on this page.")}</p>}
      {rows.map((row) => (
        <section className="learning-row" key={row.id}>
          <div>
            <h3>{row.title}</h3>
            <p>{translateUI("Version")}{" "}{row.version} ·{" "}
              {row.status === "completed" ? "Reading confirmed" : "In progress"}
            </p>
            {row.completedAt && <p>{translateUI("Confirmed")}{" "}{row.completedAt}</p>}
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
          >{translateUI("Open tracked item")}</button>
          {row.retakeAvailable&&<FreshReading key={row.id} row={row} p={p}/>}
        </section>
      ))}
      <button
        className="ghost"
        disabled={p.busy || offset === 0}
        onClick={() => setOffset(Math.max(0, offset - 20))}
      >{translateUI("Previous tracked items")}</button>
      <button
        className="ghost"
        disabled={p.busy || next === null}
        onClick={() => setOffset(next!)}
      >{translateUI("Next tracked items")}</button>
    </section>
  );
}
