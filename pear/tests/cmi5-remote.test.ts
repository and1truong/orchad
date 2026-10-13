import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CMI5Service} from '../src/server/cmi5.ts';
import {createApp} from '../src/server/app.ts';
import {cmi5Fixture} from './cmi5-fixture.ts';
import {standaloneCMI5} from './cmi5-packaging-fixture.ts';

async function remotePackage(s:Awaited<ReturnType<typeof cmi5Fixture>>,origin='https://content.example.test') {
  const pkg=await s.cmi5.import(s.admin,{...s.args(),filename:'remote.xml',provenance:'Reviewed original remote AU'},Buffer.from(standaloneCMI5(origin)));
  s.cmi5.review(s.admin,{...s.args(),packageId:pkg.packageId,sha256:pkg.sha256,action:'publish',reason:'Reviewed source and configured remote origin'});return pkg;
}
test('remote AU origins require exact server configuration separate from Pear cookies, and launch never fetches the remote server',async()=>{
  const s=await cmi5Fixture(undefined,['https://content.example.test']);try {
    for(const origins of [['https://content.example.test/path'],['https://user:pass@content.example.test'],['http://public.test'],[s.origin],[s.contentOrigin],['*']])assert.throws(()=>new CMI5Service(s.db,s.origin,s.contentOrigin,origins));
    await assert.rejects(()=>createApp({db:s.db,origin:s.origin,developmentAuth:true,cmi5RemoteOrigins:['https://content.example.test']}),/listener/);
    const pkg=await remotePackage(s),launch=s.launch(pkg.packageId),url=new URL(launch.url),r=s.runtime(launch);
    assert.equal(url.origin,'https://content.example.test');assert.equal(url.pathname,'/lessons/intro.html');assert.equal(url.hash,'#start');assert.equal(url.searchParams.get('theme'),'blue');assert.equal(launch.launchMethod,'OwnWindow');assert.equal(url.searchParams.get('endpoint'),s.contentOrigin+'/cmi5/xapi/');
    assert.equal(s.cmi5.list(s.learner).items[0].aus[0].playbackSupported,true);assert.throws(()=>s.cmi5.resource(launch.sessionId,'cmi5.xml'),/Remote AUs/);
    const removed=new CMI5Service(s.db,s.origin,s.contentOrigin);assert.throws(()=>removed.authenticate(r.header),/configuration was revoked/);assert.equal(removed.evidence(s.learner,launch.registrationId,{}).statements.length,1);
    s.cmi5.write(r.header,r.statement('initialized'));s.cmi5.write(r.header,r.statement('completed',{completion:true,duration:'PT1S'}));assert.equal(s.cmi5.report(s.learner,launch.registrationId).aus[0].completed,true);
  }finally{await s.close();}
});
test('remote browser preflight and runtime CORS bind fetch/authentication to this session, not every reviewed origin',async()=>{
  const origin='https://content.example.test',other='https://other.example.test',s=await cmi5Fixture(undefined,[origin,other]);try {
    const pkg=await remotePackage(s),launch=s.launch(pkg.packageId),fetchPath=new URL(new URL(launch.url).searchParams.get('fetch')!).pathname;
    const base={host:'localhost:4391',origin},preflight={'access-control-request-method':'POST','access-control-request-headers':'content-type'};
    const pre=await s.content.inject({method:'OPTIONS',url:fetchPath,headers:{...base,...preflight}});assert.equal(pre.statusCode,204);assert.equal(pre.headers['access-control-allow-origin'],origin);assert.equal(pre.headers['access-control-allow-credentials'],undefined);
    assert.equal((await s.content.inject({method:'OPTIONS',url:fetchPath,headers:{...base,...preflight,origin:other}})).statusCode,403);
    assert.equal((await s.content.inject({method:'POST',url:fetchPath,headers:{...base,origin:other}})).statusCode,403);
    const fetched=await s.content.inject({method:'POST',url:fetchPath,headers:base});assert.equal(fetched.statusCode,200);assert.equal(fetched.headers['access-control-allow-origin'],origin);const header='Basic '+fetched.json()['auth-token'];
    assert.equal((await s.content.inject({method:'POST',url:fetchPath,headers:base})).json()['error-code'],'1');
    const api={...base,authorization:header,'x-experience-api-version':'1.0.3'};
    const about=await s.content.inject({url:'/cmi5/xapi/about',headers:api});assert.equal(about.statusCode,200);assert.equal(about.headers['access-control-allow-origin'],origin);assert.equal(about.headers.vary,'Origin');
    for(const bad of [other,'https://evil.test',s.contentOrigin,'null'])assert.equal((await s.content.inject({url:'/cmi5/xapi/about',headers:{...api,origin:bad}})).statusCode,403);
    assert.equal((await s.content.inject({url:'/cmi5/xapi/about',headers:{...api,cookie:'pear-session=forged'}})).statusCode,403);
    const xapiPre=await s.content.inject({method:'OPTIONS',url:'/cmi5/xapi/statements',headers:{...base,'access-control-request-method':'POST','access-control-request-headers':'authorization,content-type,x-experience-api-version'}});assert.equal(xapiPre.statusCode,204);
    assert.equal((await s.content.inject({method:'OPTIONS',url:'/cmi5/xapi/statements',headers:{...base,'access-control-request-method':'POST','access-control-request-headers':'cookie'}})).statusCode,403);
    await s.app.inject({method:'POST',url:'/api/logout',headers:s.learnerLogin.headers,payload:{}});assert.equal((await s.content.inject({url:'/cmi5/xapi/about',headers:api})).statusCode,401);
  }finally{await s.close();}
});
