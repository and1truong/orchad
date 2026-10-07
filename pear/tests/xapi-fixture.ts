import {fixture} from "./helpers.ts";
import {IntegrationCredentials} from "../src/server/integration-credentials.ts";
import {SCIMService} from "../src/server/scim.ts";
import {XAPIService} from "../src/server/xapi.ts";
export function xapiFixture(path?:string,origin="http://127.0.0.1:4314"){
 const f=fixture(path),p=f.service.principal("admin"),credentials=new IntegrationCredentials(f.db),scim=new SCIMService(f.db,origin),xapi=new XAPIService(f.db,origin);
 const client=credentials.mutate(p,{action:"issue",name:"Original activity fixture",reason:"Reviewed managed learner activity",scopes:["provisioning.read","provisioning.write","xapi.read","xapi.write"],ttlDays:7,key:crypto.randomUUID(),revision:f.service.context("admin","library:demo").revision}),header="Bearer "+client.token;
 const user=scim.mutate(header,"Users",undefined,"POST",{userName:"original-xapi-"+crypto.randomUUID(),displayName:"Original external learner"},undefined,undefined).body;
 const internal=(f.db.prepare("SELECT user_id FROM scim_users WHERE id=?").get(user.id) as any).user_id,registration=crypto.randomUUID();
 const statement=(extra:any={})=>({id:crypto.randomUUID(),actor:{objectType:"Agent",account:{homePage:origin+"/scim/v2",name:user.id}},verb:{id:"http://adlnet.gov/expapi/verbs/completed"},object:{objectType:"Activity",id:origin+"/content/course/systems-basics?version=1"},context:{registration},timestamp:"2026-10-05T12:00:00.000Z",result:{completion:true,success:true,score:{raw:80,min:0,max:100,scaled:0.8},duration:"PT1M"},...extra});
 return {...f,p,credentials,scim,xapi,client,header,user,internal,registration,statement,origin};
}
