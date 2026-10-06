import {diagnosticText} from "./diagnostics.ts";
import {translateUI} from "./i18n.ts";
import React, { useRef,useEffect,useState } from "react";
import type {Session} from "./api.ts";
import { printView } from "./print.ts";
export function Certificate({
  certificate: c,
  award = false,
  session,
}: {
  certificate: any;
  award?: boolean;
  session?:Session;
}) {
  const ref = useRef<HTMLElement>(null),alive=useRef(true);
  const [saving,setSaving]=useState(false),[downloadError,setDownloadError]=useState("");
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const downloadPDF=async()=>{if(!session||saving)return;setSaving(true);setDownloadError("");try{const response=await fetch((award?"/api/award-certificates/":"/api/certificates/")+encodeURIComponent(c.id)+"/pdf",{credentials:"same-origin",headers:{"x-pear-epoch":session.sessionEpoch}});if(!alive.current)return;if(!response.ok){const failure=await response.json();throw Error(diagnosticText(failure.error?.message??"Certificate PDF unavailable"));}const blob=await response.blob();if(!alive.current)return;const url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download=`pear-${award?"award":"certificate"}-${c.id}.pdf`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){if(alive.current)setDownloadError(error instanceof Error?error.message:"Certificate PDF unavailable");}finally{if(alive.current)setSaving(false);}};
  const heading = award
      ? "Award completion certificate"
      : "Completion certificate",
    issued = c.issuedAt ?? c.issued_at;
  const text = `Pear ${award ? "award " : ""}completion certificate\n${c.learnerName}\n${c.title}\nVersion ${c.version}\nIssued ${issued}\n${award ? `Earned ${c.earned} ${c.unitLabel??c.unit}\n` : ""}ID ${c.id}\nIssuer ${c.issuer}\nNot accredited`;
  return (
    <section ref={ref} className="panel print-certificate" aria-label={heading}>
      <h2>{heading}</h2>
      <p>
        {c.learnerName} completed {c.title}, version {c.version}.
      </p>
      <p>{translateUI("Issued")}{" "}{issued}</p>
      {award && (
        <p>
          {c.earned} {c.unitLabel??c.unit} earned
        </p>
      )}
      <p>{translateUI("Certificate ID:")}{" "}{c.id}</p>
      <p>{c.issuer}</p>
      <p>{translateUI("Self-authored development content. This certificate is not accredited.")}</p>
      <div className="print-controls">
        {c.pdfAvailable&&session&&<button type="button" disabled={saving} onClick={()=>void downloadPDF()}>{translateUI(award?"Download award PDF":"Download certificate PDF")}</button>}
        {downloadError&&<p role="alert">{downloadError}</p>}
        <a
          download={`pear-${award ? "award" : "certificate"}-${c.id}.txt`}
          href={"data:text/plain;charset=utf-8," + encodeURIComponent(text)}
        >
          {award ? "Download award certificate" : "Download certificate"}
        </a>
        <button
          className="ghost"
          onClick={() => {
            if (ref.current) printView(ref.current);
          }}
        >{translateUI("Print / save certificate PDF")}</button>
        <p>{translateUI("Choose Save as PDF in your browser's print dialog.")}</p>
      </div>
    </section>
  );
}
