import {createHash} from 'node:crypto';
import {fixture} from './helpers.ts';
import {zip} from './scorm-fixture.ts';
import {createApp} from '../src/server/app.ts';
import {cmi5Namespace} from '../src/server/cmi5-package.ts';
import {cmi5Category,cmi5Extension,cmi5MoveCategory} from '../src/server/cmi5.ts';

const label=(name:string)=>`<title><langstring lang="en">${name}</langstring></title><description><langstring lang="en">Original test content</langstring></description>`;
export function cmi5XML(method='AnyWindow') {
  return `<courseStructure xmlns="${cmi5Namespace}"><course id="https://content.example.test/course">${label('Original cmi5 course')}</course>
    <objectives><objective id="https://content.example.test/objective">${label('Objective')}</objective></objectives>
    <block id="https://content.example.test/block">${label('Original cmi5 block')}
      <au id="https://content.example.test/au/intro" moveOn="CompletedAndPassed" masteryScore="0.75" launchMethod="${method}">${label('Introduction')}
        <objectives><objective idref="https://content.example.test/objective"/></objectives><url>lessons/intro.html?theme=blue#start</url><launchParameters> lesson=1 </launchParameters></au>
      <au id="https://content.example.test/au/practice" moveOn="Completed">${label('Practice')}<url>lessons/practice.html</url></au>
    </block></courseStructure>`;
}
// Self-authored AU speaks the actual launch/xAPI protocol; no Pear runtime shim.
export const cmi5Script=`const q=new URLSearchParams(location.search),actor=JSON.parse(q.get('actor')),registration=q.get('registration'),activityId=q.get('activityId');
const endpoint=q.get('endpoint');let headers,launchData,ready;const pending=new Map();
const scope=new URLSearchParams({activityId,agent:JSON.stringify(actor),registration});
async function send(verb,result){const context=structuredClone(launchData.contextTemplate);context.registration=registration;context.contextActivities.category=[{id:'${cmi5Category}'}];
if(['completed','passed','failed'].includes(verb))context.contextActivities.category.push({id:'${cmi5MoveCategory}'});
if(['passed','failed'].includes(verb)&&launchData.masteryScore!==undefined)context.extensions['${cmi5Extension}masteryscore']=launchData.masteryScore;
const statement=pending.get(verb)||{id:crypto.randomUUID(),actor,verb:{id:'http://adlnet.gov/expapi/verbs/'+verb},object:{objectType:'Activity',id:activityId},context,timestamp:new Date().toISOString(),...(result?{result}:{})};pending.set(verb,statement);
const r=await fetch(endpoint+'statements',{method:'POST',headers,body:JSON.stringify(statement)});if(!r.ok)throw Error('Statement rejected: '+r.status);pending.delete(verb);return r.json();}
async function start(){const token=await (await fetch(q.get('fetch'),{method:'POST'})).json();if(!token['auth-token'])throw Error('Token unavailable');
headers={'Authorization':'Basic '+token['auth-token'],'X-Experience-API-Version':'1.0.3','Content-Type':'application/json'};
launchData=await (await fetch(endpoint+'activities/state?'+scope+'&stateId=LMS.LaunchData',{headers})).json();
const prefs=await fetch(endpoint+'agents/profile?'+new URLSearchParams({agent:JSON.stringify(actor),profileId:'cmi5LearnerPreferences'}),{headers});if(!prefs.ok)throw Error('Preferences unavailable');
await send('initialized');document.getElementById('status').textContent='Ready';}
ready=start().catch(e=>{document.getElementById('status').textContent=e.message;throw e;});
document.getElementById('complete').onclick=async()=>{try{await ready;await send('completed',{completion:true,duration:'PT1M'});if(launchData.masteryScore!==undefined)await send('passed',{success:true,duration:'PT1M',score:{scaled:0.9,raw:90,min:0,max:100}});await send('terminated',{duration:'PT1M'});document.getElementById('status').textContent='Saved and terminated';}catch(e){document.getElementById('status').textContent=e.message;}};
document.getElementById('save').onclick=async()=>{try{await ready;const r=await fetch(endpoint+'activities/state?'+scope+'&stateId=bookmark',{method:'PUT',headers:{...headers,'If-None-Match':'*'},body:JSON.stringify({page:2})});if(!r.ok)throw Error('Save rejected');document.getElementById('status').textContent='Bookmark saved';}catch(e){document.getElementById('status').textContent=e.message;}};
document.getElementById('restore').onclick=async()=>{try{await ready;const r=await fetch(endpoint+'activities/state?'+scope+'&stateId=bookmark',{headers});if(!r.ok)throw Error('No bookmark');document.getElementById('status').textContent='Restored page '+(await r.json()).page;}catch(e){document.getElementById('status').textContent=e.message;}};`;
export function cmi5ZIP(xml=cmi5XML()) {
  const html=(name:string)=>Buffer.from(`<!doctype html><html><head><meta charset="utf-8"></head><body><h1>${name}</h1><p id="status" role="status">Loading</p><button id="complete">Complete activity</button><button id="save">Save bookmark</button><button id="restore">Restore bookmark</button><script src="../au.js"></script></body></html>`);
  return zip([{name:'cmi5.xml',data:Buffer.from(xml),method:8},{name:'lessons/intro.html',data:html('Introduction'),method:8},{name:'lessons/practice.html',data:html('Practice'),method:8},{name:'au.js',data:Buffer.from(cmi5Script),method:8}]);
}
export async function cmi5Fixture(path?:string) {
  const f=fixture(path),origin='http://127.0.0.1:4390',contentOrigin='http://localhost:4391';
  const {app,cmi5,cmi5ContentApp}=await createApp({db:f.db,origin,developmentAuth:true,cmi5ContentOrigin:contentOrigin});
  async function login(user:string) {
    const response=await app.inject({method:'POST',url:'/api/login',headers:{host:'127.0.0.1:4390',origin},payload:{username:user,password:user+'-dev'}});
    const cookie=String(response.headers['set-cookie']).split(';')[0]!;
    const session=await app.inject({url:'/api/session',headers:{host:'127.0.0.1:4390',cookie}}),data=session.json();
    const headers={host:'127.0.0.1:4390',origin,cookie,'x-csrf-token':data.csrf,'x-pear-epoch':data.sessionEpoch};
    return {headers,browser:createHash('sha256').update(cookie.slice(cookie.indexOf('=')+1)).digest('hex')};
  }
  const admin=f.service.principal('admin'),learner=f.service.principal('learner-a'),adminLogin=await login('admin'),learnerLogin=await login('learner-a');
  const args=(p=admin,author=true)=>({confirmed:true,key:crypto.randomUUID(),revision:f.service.context(p.id,author?'library:'+p.tenant:`learning:${p.tenant}:${p.id}`).revision});
  async function publish(xml=cmi5XML()) {
    const bytes=cmi5ZIP(xml),pkg=await cmi5.import(admin,{...args(),filename:'original-cmi5.zip',provenance:'Self-authored test content'},bytes);
    cmi5.review(admin,{...args(),packageId:pkg.packageId,sha256:pkg.sha256,action:'publish',reason:'Reviewed every source file and rights'});return {...pkg,bytes};
  }
  function launch(packageId:string,auId='https://content.example.test/au/intro',registrationId?:string,mode='Normal') {
    return cmi5.launch(learner,learnerLogin.browser,{...args(learner,false),packageId,auId,mode,...(registrationId?{registrationId}:{})});
  }
  function runtime(launch:any) {
    const url=new URL(launch.url),token=url.searchParams.get('fetch')!.split('/').at(-1)!,auth=cmi5.fetch(token)['auth-token']!,header='Basic '+auth;
    const query={activityId:url.searchParams.get('activityId')!,agent:url.searchParams.get('actor')!,registration:launch.registrationId},data=cmi5.state(header,{...query,stateId:'LMS.LaunchData'},'GET',undefined).body;
    function statement(verb:string,result?:object,extra:any={}) {
      const context=structuredClone(data.contextTemplate) as any;context.registration=launch.registrationId;context.contextActivities.category=[{id:cmi5Category}];
      if(['completed','passed','failed'].includes(verb))context.contextActivities.category.push({id:cmi5MoveCategory});
      if(['passed','failed'].includes(verb)&&data.masteryScore!==undefined)context.extensions[cmi5Extension+'masteryscore']=data.masteryScore;
      return {id:crypto.randomUUID(),actor:JSON.parse(query.agent),verb:{id:'http://adlnet.gov/expapi/verbs/'+verb},object:{objectType:'Activity',id:query.activityId},context,timestamp:new Date().toISOString(),...(result?{result}:{}),...extra};
    }
    return {header,token,query,data,statement};
  }
  return {...f,app,cmi5,content:cmi5ContentApp!,origin,contentOrigin,admin,learner,adminLogin,learnerLogin,login,args,publish,launch,runtime,close:async()=>{await app.close();f.db.close();}};
}
