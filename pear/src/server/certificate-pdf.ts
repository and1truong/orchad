import {reject} from "./errors.ts";
// Trusted server font bytes only. Original Latin/Vietnamese certificate profile,
// Unicode cmap 4/12 and complete TrueType embedding; no user font or PDF input.
export class CertificateFont{
 readonly bytes:Buffer;readonly units:number;readonly glyphs:number;readonly metrics:number;readonly hmtx:Buffer;readonly head:Buffer;readonly hhea:Buffer;readonly cmap:Buffer;
 constructor(raw:Buffer){
  this.bytes=Buffer.from(raw);
  if(raw.length<64||raw.length>2*1024*1024||raw.readUInt32BE(0)!==0x00010000)throw Error("Certificate font requires bounded TrueType outlines");
  const n=raw.readUInt16BE(4),tables=new Map<string,Buffer>();if(n<1||n>128||12+n*16>raw.length)throw Error("Invalid certificate font tables");
  for(let i=0;i<n;i++){const at=12+i*16,name=raw.toString("ascii",at,at+4),offset=raw.readUInt32BE(at+8),size=raw.readUInt32BE(at+12);if(offset+size>raw.length||tables.has(name))throw Error("Invalid certificate font table bounds");tables.set(name,this.bytes.subarray(offset,offset+size));}
  const table=(name:string,min:number)=>{const b=tables.get(name);if(!b||b.length<min)throw Error("Required certificate font table missing");return b;};
  this.head=table("head",54);this.hhea=table("hhea",36);this.units=this.head.readUInt16BE(18);this.glyphs=table("maxp",6).readUInt16BE(4);this.metrics=this.hhea.readUInt16BE(34);this.hmtx=table("hmtx",4);table("glyf",1);table("loca",2);
  const permission=table("OS/2",10).readUInt16BE(8);if(permission&0x202)throw Error("Certificate font forbids outline embedding");
  if(this.units<16||this.units>16384||!this.glyphs||!this.metrics||this.metrics>this.glyphs||this.hmtx.length<4*this.metrics+2*(this.glyphs-this.metrics))throw Error("Invalid certificate font metrics");
  const map=table("cmap",4),count=map.readUInt16BE(2);if(count>64||4+8*count>map.length)throw Error("Invalid certificate font cmap");
  const choices:Buffer[]=[];for(let i=0;i<count;i++){const at=4+i*8,platform=map.readUInt16BE(at),encoding=map.readUInt16BE(at+2),offset=map.readUInt32BE(at+4);if(!(platform===0||platform===3&&[1,10].includes(encoding))||offset+16>map.length)continue;const format=map.readUInt16BE(offset);if(![4,12].includes(format))continue;const length=format===4?map.readUInt16BE(offset+2):map.readUInt32BE(offset+4);if(length<16||offset+length>map.length)throw Error("Invalid font Unicode cmap length");const sub=map.subarray(offset,offset+length);if(format===12){const groups=sub.readUInt32BE(12);if(groups>8192||16+12*groups>sub.length)throw Error("Invalid font cmap groups");}else {const segments=sub.readUInt16BE(6)/2;if(!Number.isInteger(segments)||segments<1||segments>4096||16+8*segments>sub.length)throw Error("Invalid font cmap segments");}choices.push(sub);}
  this.cmap=choices.find(b=>b.readUInt16BE(0)===12)??choices[0]!;if(!this.cmap)throw Error("Font Unicode cmap 4 or 12 required");
 }
 glyph(cp:number){
  const b=this.cmap;let gid=0;
  if(b.readUInt16BE(0)===12){let lo=0,hi=b.readUInt32BE(12)-1;while(lo<=hi){const mid=(lo+hi)>>>1,at=16+mid*12,start=b.readUInt32BE(at),end=b.readUInt32BE(at+4);if(cp<start)hi=mid-1;else if(cp>end)lo=mid+1;else {gid=b.readUInt32BE(at+8)+cp-start;break;}}}
  else if(cp<=0xffff){const n=b.readUInt16BE(6)/2;for(let i=0;i<n;i++){const end=b.readUInt16BE(14+2*i);if(cp>end)continue;const start=b.readUInt16BE(16+2*n+2*i);if(cp<start)break;const delta=b.readInt16BE(16+4*n+2*i),word=16+6*n+2*i,range=b.readUInt16BE(word);if(!range)gid=(cp+delta)&0xffff;else {const at=word+range+2*(cp-start);if(at+2>b.length)throw Error("Font cmap glyph outside bounds");gid=b.readUInt16BE(at);if(gid)gid=(gid+delta)&0xffff;}break;}}
  if(!gid||gid>=this.glyphs)reject("INVALID_ARGUMENT","Certificate font lacks a required character; use the original text or browser print export");return gid;
 }
 width(gid:number){return Math.round(this.hmtx.readUInt16BE(4*Math.min(gid,this.metrics-1))*1000/this.units);}
 metric(value:number){return Math.round(value*1000/this.units);}
}
const utf16=(text:string)=>{const b=Buffer.from(text,"utf16le");b.swap16();return b.toString("hex");};
function certificateFields(c:any,award:boolean){
 const fields=[award?"Pear award completion certificate":"Pear completion certificate",String(c.learnerName),String(c.title),"Version "+c.version,"Issued "+(c.issuedAt??c.issued_at),...(award?["Earned "+c.earned+" "+(c.unitLabel??c.unit)]:[]),"Certificate ID "+c.id,String(c.issuer),"Self-authored development content. Not accredited."];
 if(fields.some(s=>s.length>512)||fields.join("").length>4096)reject("INVALID_ARGUMENT","Certificate exceeds PDF text bounds");
 return fields;
}
export function certificatePDFSupported(c:any,award:boolean,font:CertificateFont|undefined){if(!font)return false;try{for(const field of certificateFields(c,award))for(const ch of field.replace(/[\r\n\t]/g," ")){const cp=ch.codePointAt(0)!;if(!((cp>=32&&cp<=0x24f)||(cp>=0x300&&cp<=0x36f)||(cp>=0x1e00&&cp<=0x1eff)||(cp>=0x2000&&cp<=0x206f)))return false;font.glyph(cp);}return true;}catch{return false;}}
export function certificatePDF(c:any,award:boolean,font:CertificateFont):Buffer{
 const fields=certificateFields(c,award);
 const characters=new Map<string,{cid:number;gid:number;width:number}>();
 const text=(s:string)=>s.replace(/[\r\n\t]/g," ");
 for(const line of fields)for(const ch of text(line)){
  const cp=ch.codePointAt(0)!;if(!((cp>=32&&cp<=0x24f)||(cp>=0x300&&cp<=0x36f)||(cp>=0x1e00&&cp<=0x1eff)||(cp>=0x2000&&cp<=0x206f)))reject("INVALID_ARGUMENT","Server certificate supports original Latin/Vietnamese text; use text or browser print for other scripts");
  if(!characters.has(ch)){const gid=font.glyph(cp);characters.set(ch,{cid:characters.size+1,gid,width:font.width(gid)});}
 }
 const lines:{value:string;size:number}[]=[];
 fields.forEach((field,index)=>{const size=index===0?20:index===2?18:12;let value="",width=0;for(const ch of text(field)){const w=characters.get(ch)!.width*size/1000;if(value&&width+w>480){lines.push({value,size});value="";width=0;}value+=ch;width+=w;}lines.push({value,size});});
 if(lines.length>28)reject("INVALID_ARGUMENT","Certificate exceeds single-page layout bounds");
 const entries=[...characters.entries()],cidmap=Buffer.alloc((entries.length+1)*2);
 for(const [,v]of entries)cidmap.writeUInt16BE(v.gid,v.cid*2);
 let cmap="/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /PearCertificateUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <ffff>\nendcodespacerange\n";
 for(let i=0;i<entries.length;i+=100){const batch=entries.slice(i,i+100);cmap+=batch.length+" beginbfchar\n"+batch.map(([ch,v])=>"<"+v.cid.toString(16).padStart(4,"0")+"> <"+utf16(ch)+">").join("\n")+"\nendbfchar\n";}cmap+="endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n";
 let y=770;const stream=lines.map(line=>{const code=[...line.value].map(ch=>characters.get(ch)!.cid.toString(16).padStart(4,"0")).join(""),out="BT /F1 "+line.size+" Tf 1 0 0 1 54 "+y+" Tm <"+code+"> Tj ET";y-=line.size+12;return out;}).join("\n");
 const bbox=[36,38,40,42].map(at=>font.metric(font.head.readInt16BE(at))).join(" "),asc=font.metric(font.hhea.readInt16BE(4)),desc=font.metric(font.hhea.readInt16BE(6));
 const objects:Buffer[]=[];
 const add=(value:string|Buffer)=>objects.push(typeof value==="string"?Buffer.from(value,"ascii"):value);
 const data=(bytes:Buffer,extra="")=>Buffer.concat([Buffer.from("<< /Length "+bytes.length+" "+extra+" >>\nstream\n"),bytes,Buffer.from("\nendstream")]);
 add("<< /Type /Catalog /Pages 2 0 R >>");add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>");add(data(Buffer.from(stream,"ascii")));
 add("<< /Type /Font /Subtype /Type0 /BaseFont /PearCertificateFont /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 9 0 R >>");
 add("<< /Type /Font /Subtype /CIDFontType2 /BaseFont /PearCertificateFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 7 0 R /CIDToGIDMap 10 0 R /DW 1000 /W ["+entries.map(([,v])=>v.cid+" ["+v.width+"]").join(" ")+"] >>");
 add("<< /Type /FontDescriptor /FontName /PearCertificateFont /Flags 32 /FontBBox ["+bbox+"] /ItalicAngle 0 /Ascent "+asc+" /Descent "+desc+" /CapHeight "+asc+" /StemV 80 /FontFile2 8 0 R >>");add(data(font.bytes,"/Length1 "+font.bytes.length));add(data(Buffer.from(cmap,"ascii")));add(data(cidmap));add("<< /Title <feff"+utf16(fields[0]!) +"> /Producer (Pear original certificate renderer) >>");
 const chunks=[Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n","latin1")],offsets=[0];let length=chunks[0]!.length;
 objects.forEach((object,index)=>{offsets.push(length);const chunk=Buffer.concat([Buffer.from((index+1)+" 0 obj\n"),object,Buffer.from("\nendobj\n")]);chunks.push(chunk);length+=chunk.length;});
 const xref=length;chunks.push(Buffer.from("xref\n0 "+(objects.length+1)+"\n0000000000 65535 f \n"+offsets.slice(1).map(offset=>offset.toString().padStart(10,"0")+" 00000 n \n").join("")+"trailer\n<< /Size "+(objects.length+1)+" /Root 1 0 R /Info 11 0 R >>\nstartxref\n"+xref+"\n%%EOF\n"));
 const output=Buffer.concat(chunks);if(output.length>4*1024*1024)reject("INVALID_ARGUMENT","Certificate PDF exceeds export bounds");return output;
}
