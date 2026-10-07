import type {Principal} from "../shared/model.ts";
import type {ReportService} from "./reports.ts";
import {CertificateFont,textDocumentPDF} from "./certificate-pdf.ts";
import {reject} from "./errors.ts";
export function transcriptPDF(p:Principal,reports:ReportService,snapshotHash:string,font:CertificateFont):Buffer{
 if(!/^[a-f0-9]{64}$/.test(snapshotHash))reject("INVALID_ARGUMENT","Review current transcript before PDF export");
 reports.ownLedger(p); // Recheck current account/auth version before deriving any bytes.
 const page=reports.read(p,"learning_get_transcript",{offset:0,limit:50,snapshotHash}),rows=[...page.items];
 if(page.total>500)reject("INVALID_ARGUMENT","Transcript exceeds server PDF row bounds; use CSV or browser print");
 let next=page.nextOffset;
 while(next!==null){const more=reports.read(p,"learning_get_transcript",{offset:next,limit:50,snapshotHash});rows.push(...more.items);next=more.nextOffset;}
 // Current trusted service principal and one authorized ledger snapshot; no submitted rows or authored markup.
 const fields=["Pear original learning transcript",p.name,"Learner ID "+p.id,"Records "+rows.length,"Ledger snapshot "+snapshotHash,"Original development content. Not accredited.",...rows.flatMap(r=>[
  String(r.title),String(r.kind)+" · "+String(r.contentId)+" · Version "+r.version,
  "Status "+r.status+" · Origin "+r.source,
  "Due "+(r.dueDate??"none")+" · Completed "+(r.completedAt??"none"),
  "Progress "+r.progress+"% · Score "+(r.score??"none")+" · Earned "+(r.earned??"none")+" "+(r.unit??"")+" · Target "+(r.target??"none"),
  "Intended minutes "+(r.estimatedMinutes??"none")+" · Observed seconds "+(r.observedSeconds??"none")
 ])];
 return textDocumentPDF(fields,font,{title:"Pear original learning transcript",maxPages:40});
}
