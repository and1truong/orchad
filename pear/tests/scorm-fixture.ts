import {deflateRawSync} from "node:zlib";
import {crc32} from "../src/server/scorm-archive.ts";
import {fixture} from "./helpers.ts";
import {SCORMService} from "../src/server/scorm.ts";
export const manifest=`<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="original-inline" version="1.2" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
 <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
 <organizations default="org"><organization identifier="org" structure="hierarchical"><title>Original inline SCORM fixture</title><item identifier="sco-item" identifierref="sco"><title>Original SCO</title></item></organization></organizations>
 <resources><resource identifier="sco" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/></resource></resources>
</manifest>`;
export const sco=`<!doctype html><html><head><title>Original inline SCO</title></head><body>
<h1>Original inline package</h1><p id="entry"></p><p id="resume"></p><p id="isolation"></p>
<button id="save">Save package progress</button><button id="finish">Finish package</button><p id="result"></p>
<script>
 const initialized=API.LMSInitialize("");
 document.getElementById("entry").textContent="Entry: "+API.LMSGetValue("cmi.core.entry");
 document.getElementById("resume").textContent="Resume location: "+API.LMSGetValue("cmi.core.lesson_location")+"; data: "+API.LMSGetValue("cmi.suspend_data");
 let protectedParent=false;try{void parent.document.cookie;}catch{protectedParent=true;}
 document.getElementById("isolation").textContent=protectedParent?"Parent cookies and bridge are isolated":"Parent was exposed";
 document.getElementById("save").onclick=()=>{
  API.LMSSetValue("cmi.core.lesson_location","step-2");API.LMSSetValue("cmi.suspend_data","original-resume");
  API.LMSSetValue("cmi.core.lesson_status","completed");API.LMSSetValue("cmi.core.score.raw","90");
  API.LMSSetValue("cmi.core.session_time","0000:01:00.00");API.LMSSetValue("cmi.core.exit","suspend");
  document.getElementById("result").textContent="Commit queued: "+API.LMSCommit("");
 };
 document.getElementById("finish").onclick=()=>{document.getElementById("result").textContent="Finish: "+API.LMSFinish("");};
</script></body></html>`;
export function zip(entries:{name:string;data:Buffer;method?:number;flags?:number;external?:number}[]=[{name:"imsmanifest.xml",data:Buffer.from(manifest)},{name:"index.html",data:Buffer.from(sco)}]){
 const locals:Buffer[]=[],centrals:Buffer[]=[];let offset=0;
 for(const entry of entries){
  const name=Buffer.from(entry.name),method=entry.method??0,flags=entry.flags??0x800,compressed=method===8?deflateRawSync(entry.data):entry.data,checksum=crc32(entry.data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(flags,6);local.writeUInt16LE(method,8);local.writeUInt32LE(checksum,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(entry.data.length,22);local.writeUInt16LE(name.length,26);
  locals.push(local,name,compressed);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE((3<<8)|20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(flags,8);central.writeUInt16LE(method,10);central.writeUInt32LE(checksum,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(entry.data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(entry.external??((0o100644<<16)>>>0),38);central.writeUInt32LE(offset,42);
  centrals.push(central,name);offset+=local.length+name.length+compressed.length;
 }
 const directory=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,directory,end]);
}
export function scormFixture(path?:string){
 const f=fixture(path),scorm=new SCORMService(f.db),admin=f.service.principal("admin"),learner=f.service.principal("learner-a"),bytes=zip();
 const imported=scorm.import(admin,{filename:"original-inline.zip",language:"en",confirmed:true,key:crypto.randomUUID(),revision:f.service.context("admin","library:demo").revision},bytes);
 const publish=(extra:any={})=>scorm.review(admin,{action:"publish",packageId:imported.id,sha256:imported.sha256,confirmed:true,reason:"Human-reviewed original inline package code",key:crypto.randomUUID(),revision:f.service.context("admin","library:demo").revision,...extra});
 const start=(user="learner-a",session="fixture-session",extra:any={})=>scorm.start(f.service.principal(user),session,{packageId:imported.id,confirmed:true,key:crypto.randomUUID(),revision:f.service.context(user,"learning:demo:"+user).revision,...extra});
 return {...f,scorm,admin,learner,bytes,imported,publish,start};
}
