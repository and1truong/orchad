import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import {createApp} from "../src/server/app.ts";
test("actual human/bridge HTTP and raw-file routes enforce author audience with no write effects",async()=>{
 const f=fixture(),origin="http://127.0.0.1:4314";
 f.db.prepare("INSERT INTO accounts(id,tenant,name,role,password_hash,salt) SELECT 'editor-peer',tenant,'Peer',role,password_hash,salt FROM accounts WHERE id='editor'").run();f.db.prepare("INSERT INTO workspaces(id,tenant,owner) VALUES('learning:demo:editor-peer','demo','editor-peer')").run();
 const p=f.service.principal("editor"),file=f.service.media.upload(p,{filename:"private.pdf",mime:"application/pdf",confirmed:"true",key:"private-http-file",revision:String(f.service.context("editor","library:demo").revision)},Buffer.from("%PDF-1.4\nOriginal private bytes\n%%EOF"));
 data(f.call("editor","learning_create_course",{courseId:"http-private",course:{...structuredClone(courses["systems-basics"]),access:"author"}}));data(f.call("editor","learning_publish_course",{courseId:"http-private"}));
 data(f.call("editor","learning_create_content_item",{itemId:"http-private-item",item:{title:"Original private PDF",summary:"Original fixture",language:"en",provider:"Pear Originals",license:"self-authored",aiProcessingAllowed:true,kind:"document",assetId:file.id,text:"Original private document",access:"author"}}));data(f.call("editor","learning_publish_content_item",{itemId:"http-private-item"}));
 const {app}=await createApp({db:f.db,origin,developmentAuth:true});
 try{
  for(const user of ["learner-a","editor-peer","editor"]){
   const login=await app.inject({method:"POST",url:"/api/login",headers:{host:"127.0.0.1:4314",origin},payload:{username:user,password:user==="editor-peer"?"editor-dev":user+"-dev"}});assert.equal(login.statusCode,200);
   const session=login.json(),headers={host:"127.0.0.1:4314",origin,cookie:String(login.headers["set-cookie"]).split(";")[0],"x-csrf-token":session.csrf,"x-pear-epoch":session.sessionEpoch};
   const before=f.db.prepare("SELECT COUNT(*) AS n FROM audit").get()!.n;
   for(const source of ["human","bridge"]){
    const r=await app.inject({method:"POST",url:"/api/"+source+"/invoke",headers,payload:{requestId:crypto.randomUUID(),documentId:"learning:demo:"+user,toolName:"learning_get_item",arguments:{courseId:"http-private"},expectedRevision:null,idempotencyKey:null}});
    assert.equal(r.statusCode,user==="editor"?200:404,user+" "+source);assert.equal(r.json().ok,user==="editor");
   }
   const bytes=await app.inject({url:"/api/assets/"+file.id+"?itemId=http-private-item&version=1",headers});assert.equal(bytes.statusCode,user==="editor"?200:404,user+" raw file");
   if(user!=="editor")assert.equal(bytes.body.includes("Original private bytes"),false);
   assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM audit").get()!.n,before);
  }
 }finally{await app.close();f.db.close();}
});
