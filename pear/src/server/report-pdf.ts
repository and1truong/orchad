import type {Principal} from "../shared/model.ts";
import type {ReportService} from "./reports.ts";
import {CertificateFont,textDocumentPDF} from "./certificate-pdf.ts";
export function reportPDF(p:Principal,reports:ReportService,args:any,font:CertificateFont):Buffer{
 const report=reports.pdfRows(p,args);
 const fields=["Pear original authorized learning report",report.title,"Requester "+p.id,"Records "+report.rows.length,"Rows "+args.rows+" · Columns "+args.columns,"Ledger snapshot "+report.snapshotHash,"Original development learning. Not accredited.",...report.rows.flatMap((row:any)=>report.columns.map((column:string)=>column+": "+String(row[column]??"none")))];
 return textDocumentPDF(fields,font,{title:report.title,maxPages:40,largeField:1});
}
