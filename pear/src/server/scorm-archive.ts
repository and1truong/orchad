import {inflateRawSync} from "node:zlib";
import {createHash} from "node:crypto";
import {reject} from "./errors.ts";
const decoder=new TextDecoder("utf-8",{fatal:true}),signature=(bytes:Buffer,offset:number,value:number)=>offset>=0&&offset+4<=bytes.length&&bytes.readUInt32LE(offset)===value;
export function crc32(bytes:Buffer){let crc=0xffffffff;for(const value of bytes){crc^=value;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function fail(message:string):never{return reject("INVALID_ARGUMENT","Unsupported/invalid SCORM package: "+message);}
export function readSCORMZip(bytes:Buffer){
 if(bytes.length<22||bytes.length>8*1024*1024)fail("ZIP must be 22 bytes–8 MiB");
 const end=bytes.length-22;
 if(!signature(bytes,end,0x06054b50)||bytes.readUInt16LE(end+20)!==0||bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0)fail("single-disk ZIP without comment required");
 const count=bytes.readUInt16LE(end+10),directorySize=bytes.readUInt32LE(end+12),directory=bytes.readUInt32LE(end+16);
 if(count!==2||bytes.readUInt16LE(end+8)!==count||directory+directorySize!==end)fail("exactly imsmanifest.xml and one inline index.html SCO required; ZIP64/multi-file unsupported");
 const files=new Map<string,Buffer>(),ranges:{start:number;end:number}[]=[];let cursor=directory,total=0;
 for(let i=0;i<count;i++){
  if(!signature(bytes,cursor,0x02014b50)||cursor+46>end)fail("central directory truncated");
  const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),checksum=bytes.readUInt32LE(cursor+16),compressed=bytes.readUInt32LE(cursor+20),expanded=bytes.readUInt32LE(cursor+24),nameLength=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),disk=bytes.readUInt16LE(cursor+34),external=bytes.readUInt32LE(cursor+38),offset=bytes.readUInt32LE(cursor+42);
  const next=cursor+46+nameLength+extra+comment;
  if(next>end||![0,0x800].includes(flags)||![0,8].includes(method)||extra||comment||disk||((external>>>16)&0xf000)!==0&&((external>>>16)&0xf000)!==0x8000||(external&0x10))fail("encrypted/descriptors/extras/symlinks/directories unsupported");
  let name:string;try{name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nameLength));}catch{fail("UTF-8 filename required");}
  if(!["imsmanifest.xml","index.html"].includes(name!)||files.has(name!))fail("only exact safe flat filenames accepted; traversal/duplicate/URL paths forbidden");
  const max=name==="imsmanifest.xml"?16*1024:1024*1024;
  if(expanded===0||expanded>max||compressed===0||expanded>compressed*100||offset+30>directory||!signature(bytes,offset,0x04034b50))fail("expanded-size/ratio/header bound");
  const localName=bytes.readUInt16LE(offset+26),localExtra=bytes.readUInt16LE(offset+28),start=offset+30+localName+localExtra,finish=start+compressed;
  if(finish>directory||localExtra||bytes.readUInt16LE(offset+6)!==flags||bytes.readUInt16LE(offset+8)!==method||bytes.readUInt32LE(offset+14)!==checksum||bytes.readUInt32LE(offset+18)!==compressed||bytes.readUInt32LE(offset+22)!==expanded||!bytes.subarray(offset+30,offset+30+localName).equals(bytes.subarray(cursor+46,cursor+46+nameLength)))fail("local/central header mismatch");
  let data:Buffer;try{data=method===0?Buffer.from(bytes.subarray(start,finish)):inflateRawSync(bytes.subarray(start,finish),{maxOutputLength:expanded+1});}catch{fail("invalid or oversized deflate stream");}
  if(data!.length!==expanded||crc32(data!)!==checksum)fail("length/CRC mismatch");
  total+=expanded;if(total>1048576+16384)fail("expanded archive quota");files.set(name!,data!);ranges.push({start:offset,end:finish});cursor=next;
 }
 ranges.sort((a,b)=>a.start-b.start);if(cursor!==end||ranges[0]!.start!==0||ranges[0]!.end!==ranges[1]!.start||ranges[1]!.end!==directory)fail("overlapping/prefixed/hidden archive bytes");
 return files;
}
export interface ManifestNode{name:string;attrs:Record<string,string>;children:ManifestNode[];text:string;}
export function parseManifest(bytes:Buffer){
 let xml:string;try{xml=decoder.decode(bytes);}catch{fail("manifest must be UTF-8");}
 xml=xml!.replace(/^\uFEFF/,"");
 if(xml.length>16384||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(xml)||/<!|&|<\?(?!xml )/i.test(xml))fail("DTD/entities/comments/CDATA/processing instructions unsupported");
 xml=xml.replace(/^<\?xml version="1\.0"(?: encoding="UTF-8")?\?>\s*/,"");
 const stack:ManifestNode[]=[],roots:ManifestNode[]=[];let index=0,nodes=0;
 while(index<xml.length){
  if(xml[index]!=="<"){const next=xml.indexOf("<",index),end=next<0?xml.length:next,value=xml.slice(index,end);if(stack.length)stack.at(-1)!.text+=value;else if(value.trim())fail("text outside manifest");index=end;continue;}
  const close=xml.indexOf(">",index);if(close<0)fail("unclosed XML tag");
  const raw=xml.slice(index+1,close);index=close+1;
  if(raw.startsWith("/")){const name=raw.slice(1);if(!/^[A-Za-z][\w:.-]*$/.test(name)||stack.pop()?.name!==name)fail("mismatched closing tag");continue;}
  const match=/^([A-Za-z][\w:.-]*)([\s\S]*?)(\/?)$/.exec(raw);if(!match)fail("invalid XML element");const attrs:Record<string,string>={},tail=match![2]!;let position=0;
  while(position<tail.length){if(/^\s*$/.test(tail.slice(position)))break;const attr=/^\s+([A-Za-z][\w:.-]*)="([^"<>]*)"/.exec(tail.slice(position));if(!attr||Object.hasOwn(attrs,attr[1]!))fail("attribute syntax/duplicates");attrs[attr![1]!]=attr![2]!;position+=attr![0].length;}
  const node:ManifestNode={name:match![1]!,attrs,children:[],text:""};
  if(++nodes>32||stack.length>=8)fail("manifest node/depth bound");
  if(stack.length)stack.at(-1)!.children.push(node);else roots.push(node);
  if(!match![3])stack.push(node);
 }
 if(stack.length||roots.length!==1||roots[0]!.name!=="manifest")fail("one well-formed manifest required");
 return roots[0]!;
}
function attrs(node:ManifestNode,allowed:string[]){if(Object.keys(node.attrs).some(k=>!allowed.includes(k)))fail("unsupported "+node.name+" attribute");}
function children(node:ManifestNode,names:string[]){if(node.children.length&&node.text.trim())fail("unexpected mixed manifest text");if(node.children.map(n=>n.name).sort().join(",")!==[...names].sort().join(","))fail("unsupported "+node.name+" structure");}
function child(node:ManifestNode,name:string){return node.children.find(n=>n.name===name)!;}
function identifier(value:string|undefined){if(typeof value!=="string"||!/^[A-Za-z0-9_-]{1,64}$/.test(value))fail("bounded manifest identifier required");return value!;}
export function inspectSCORM(bytes:Buffer){
 const files=readSCORMZip(bytes),manifest=parseManifest(files.get("imsmanifest.xml")!);attrs(manifest,["identifier","version","xmlns","xmlns:adlcp"]);
 identifier(manifest.attrs.identifier);
 if(manifest.attrs.xmlns!=="http://www.imsproject.org/xsd/imscp_rootv1p1p2"||manifest.attrs["xmlns:adlcp"]!=="http://www.adlnet.org/xsd/adlcp_rootv1p2"||manifest.attrs.version!==undefined&&manifest.attrs.version!=="1.2")fail("only frozen SCORM 1.2 namespace/version profile");
 children(manifest,["metadata","organizations","resources"]);
 const metadata=child(manifest,"metadata");attrs(metadata,[]);children(metadata,["schema","schemaversion"]);
 for(const n of metadata.children){attrs(n,[]);children(n,[]);}
 if(child(metadata,"schema").text.trim()!=="ADL SCORM"||child(metadata,"schemaversion").text.trim()!=="1.2")fail("only ADL SCORM 1.2 supported");
 const organizations=child(manifest,"organizations");attrs(organizations,["default"]);children(organizations,["organization"]);
 const organization=child(organizations,"organization");attrs(organization,["identifier","structure"]);identifier(organization.attrs.identifier);
 if(organizations.attrs.default!==organization.attrs.identifier||organization.attrs.structure!==undefined&&organization.attrs.structure!=="hierarchical")fail("one default organization required");
 children(organization,["title","item"]);const titleNode=child(organization,"title");attrs(titleNode,[]);children(titleNode,[]);
 const title=titleNode.text.trim();if(!title||title.length>160)fail("bounded title required");
 const item=child(organization,"item");attrs(item,["identifier","identifierref"]);identifier(item.attrs.identifier);children(item,["title"]);attrs(child(item,"title"),[]);children(child(item,"title"),[]);
 const resources=child(manifest,"resources");attrs(resources,[]);children(resources,["resource"]);
 const resource=child(resources,"resource");attrs(resource,["identifier","type","adlcp:scormtype","href"]);identifier(resource.attrs.identifier);children(resource,["file"]);
 if(item.attrs.identifierref!==resource.attrs.identifier||resource.attrs.type!=="webcontent"||resource.attrs["adlcp:scormtype"]!=="sco"||resource.attrs.href!=="index.html")fail("one inline index.html SCO resource required");
 const file=child(resource,"file");attrs(file,["href"]);children(file,[]);if(file.attrs.href!=="index.html")fail("only inline SCO file declared");
 let html:string;try{html=decoder.decode(files.get("index.html")!);}catch{fail("SCO must be UTF-8");}
 if(!/<html[\s>]/i.test(html!)||!/<body[\s>]/i.test(html!)||!/<\/body>/i.test(html!)||/[\u0000]/.test(html!))fail("complete UTF-8 inline HTML SCO required");
 return {profile:"pear-scorm12-inline/1",title,entry:"index.html",html:html!,sha256:createHash("sha256").update(bytes).digest("hex"),expandedBytes:[...files.values()].reduce((n,b)=>n+b.length,0)};
}
