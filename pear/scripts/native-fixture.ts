// CI-only synthetic fixture. Never mounted by Pear's dev/start entry point.
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createApp} from "../src/server/app.ts";
import {openDatabase} from "../src/server/database.ts";
const nonce=process.env.PEAR_NATIVE_NONCE;
if(!nonce||!/^[-a-zA-Z0-9]{20,64}$/.test(nonce))throw Error("Explicit native fixture nonce required");
const dir=mkdtempSync(join(tmpdir(),"pear-native-")),db=openDatabase(join(dir,"native.sqlite"),true);
const origin="http://127.0.0.1:4310";
const {app}=await createApp({db,origin,developmentAuth:true,staticRoot:resolve("dist")});
app.get("/native-fixture/:nonce/bootstrap/:user",async(req,reply)=>{
 const p=req.params as {nonce:string;user:string};
 if(p.nonce!==nonce||!["learner-a","learner-b"].includes(p.user))return reply.code(404).send();
 const result=await app.inject({method:"POST",url:"/api/login",headers:{host:"127.0.0.1:4310",origin},payload:{username:p.user,password:p.user+"-dev"}});
 if(result.statusCode!==200)throw Error("Synthetic native fixture login failed");
 return reply.header("Set-Cookie",result.headers["set-cookie"]!).redirect("/");
});
app.get("/native-fixture/:nonce/state",async(req,reply)=>{
 if((req.params as {nonce:string}).nonce!==nonce)return reply.code(404).send();
 return {enrollments:db.prepare("SELECT id,learner,course_id,status,completed_lessons,version FROM enrollments ORDER BY id").all(),
  attempts:(db.prepare("SELECT COUNT(*) AS n FROM attempts").get() as any).n,
  certificates:(db.prepare("SELECT COUNT(*) AS n FROM certificates").get() as any).n};
});
await app.listen({host:"127.0.0.1",port:4310});
console.log("PEAR_NATIVE_FIXTURE_READY");
let closing=false;
async function close(){if(closing)return;closing=true;app.server.closeAllConnections();await app.close();db.close();rmSync(dir,{recursive:true,force:true});process.exit(0);}
process.on("SIGTERM",()=>void close());process.on("SIGINT",()=>void close());

// Node IPC gives Windows the same graceful fixture cleanup as Unix signals.
process.on("message", message => {if ((message as any)?.kind === "close") void close();});
