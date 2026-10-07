// CI-only loopback identity provider. Never imported by normal app entry points.
import {createServer} from "node:http";
import {createHash,generateKeyPairSync,randomUUID,sign} from "node:crypto";
const keyPairs=[0,1].map(()=>generateKeyPairSync("rsa",{modulusLength:2048}));
export async function startIdentityFixture(redirectUri:string){
 const controls:any={subject:"subject-a",claims:{},header:{},key:0,corrupt:false,denyToken:false,oversize:false,tokenRequests:0,jwksRequests:0,lastTokenBody:null};
 const codes=new Map<string,{nonce:string;challenge:string;expires:number}>();
 let issuer="";
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url??"/",issuer);
   if(url.pathname==="/authorize"){
    const q=url.searchParams;
    if(q.get("redirect_uri")!==redirectUri||q.get("client_id")!=="pear-fixture"||q.get("response_type")!=="code"||
      q.get("scope")!=="openid"||q.get("code_challenge_method")!=="S256"||!q.get("nonce")||!q.get("state"))throw Error("Unsupported fixture request");
    const code=randomUUID();codes.set(code,{nonce:q.get("nonce")!,challenge:q.get("code_challenge")!,expires:Date.now()+300000});
    const target=new URL(redirectUri);target.searchParams.set("code",code);target.searchParams.set("state",q.get("state")!);target.searchParams.set("iss",issuer);
    res.writeHead(302,{location:target.toString()});res.end();return;
   }
   if(url.pathname==="/jwks"){
    controls.jwksRequests++;res.setHeader("content-type","application/json");
    const key=keyPairs[controls.key]!.publicKey.export({format:"jwk"});res.end(JSON.stringify({keys:[{...key,kid:"key-"+controls.key,use:"sig",alg:"RS256"}]}));return;
   }
   if(url.pathname==="/token"&&req.method==="POST"){
    controls.tokenRequests++;let text="";for await(const bytes of req){text+=bytes.toString();if(text.length>16384)throw Error("Fixture request too large");}
    const body=new URLSearchParams(text);controls.lastTokenBody=Object.fromEntries(body);
    const code=body.get("code")!,record=codes.get(code);codes.delete(code);
    if(controls.denyToken||!record||record.expires<Date.now()||body.get("client_id")!=="pear-fixture"||body.get("grant_type")!=="authorization_code"||
      body.get("redirect_uri")!==redirectUri||createHash("sha256").update(body.get("code_verifier")??"").digest("base64url")!==record.challenge)throw Error("Fixture grant denied");
    const now=Math.floor(Date.now()/1000),header={alg:"RS256",kid:"key-"+controls.key,...controls.header},
      claims={iss:issuer,aud:"pear-fixture",sub:controls.subject,nonce:record.nonce,iat:now,exp:now+300,roles:["admin"],...controls.claims};
    const h=Buffer.from(JSON.stringify(header)).toString("base64url"),p=Buffer.from(JSON.stringify(claims)).toString("base64url");
    const signature=sign("RSA-SHA256",Buffer.from(h+"."+p),keyPairs[controls.key]!.privateKey).toString("base64url");
    res.setHeader("content-type","application/json");res.end(JSON.stringify({id_token:controls.oversize?"x".repeat(70000):h+"."+p+"."+(controls.corrupt?"invalid":signature),access_token:"unused-fixture-token",token_type:"Bearer"}));return;
   }
   res.writeHead(404);res.end();
  }catch{res.writeHead(400);res.end("Fixture request rejected");}
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const address=server.address() as {port:number};issuer="http://localhost:"+address.port;
 return {controls,config:{issuer,authorizationEndpoint:issuer+"/authorize",tokenEndpoint:issuer+"/token",jwksUri:issuer+"/jwks",clientId:"pear-fixture"},
  async authorize(url:string){const result=await fetch(url,{redirect:"manual"});if(result.status!==302)throw Error("Fixture authorization failed");return new URL(result.headers.get("location")!);},
  async close(){await new Promise<void>((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeAllConnections();});}};
}
