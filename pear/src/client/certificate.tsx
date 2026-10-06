import {translateUI} from "./i18n.ts";
import React, { useRef } from "react";
import { printView } from "./print.ts";
export function Certificate({
  certificate: c,
  award = false,
}: {
  certificate: any;
  award?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const heading = award
      ? "Award completion certificate"
      : "Completion certificate",
    issued = c.issuedAt ?? c.issued_at;
  const text = `Pear ${award ? "award " : ""}completion certificate\n${c.learnerName}\n${c.title}\nVersion ${c.version}\nIssued ${issued}\n${award ? `Earned ${c.earned} ${c.unit}\n` : ""}ID ${c.id}\nIssuer ${c.issuer}\nNot accredited`;
  return (
    <section ref={ref} className="panel print-certificate" aria-label={heading}>
      <h2>{heading}</h2>
      <p>
        {c.learnerName} completed {c.title}, version {c.version}.
      </p>
      <p>{translateUI("Issued")}{" "}{issued}</p>
      {award && (
        <p>
          {c.earned} {c.unit} earned
        </p>
      )}
      <p>{translateUI("Certificate ID:")}{" "}{c.id}</p>
      <p>{c.issuer}</p>
      <p>{translateUI("Self-authored development content. This certificate is not accredited.")}</p>
      <div className="print-controls">
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
