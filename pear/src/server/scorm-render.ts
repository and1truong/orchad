import {emptySCORMState,scormTime,validSCORMState} from "../shared/scorm-state.ts";
export function renderSCORM(launch:any,parentOrigin:string){
 const bootstrap=JSON.stringify({...launch,html:undefined,parentOrigin}).replaceAll("<","\\u003c");
 const script=`const config=${bootstrap};const emptySCORMState=${emptySCORMState.toString()};const scormTime=${scormTime.toString()};const validSCORMState=${validSCORMState.toString()};
 (()=>{
  let initialized=false,finished=false,error="0",state={...config.state},revision=config.recordRevision,pending=null,lastSaved=JSON.stringify(state);
  const bad=(code="101")=>{error=code;return "false";},ok=()=>{error="0";return "true";};
  const active=()=>initialized&&!finished;
  function commit(){
   if(!active())return bad("301");if(pending)return bad();if(!validSCORMState(state))return bad("405");
   const serialized=JSON.stringify(state);if(serialized===lastSaved&&revision>0)return ok();
   const key="scorm_"+Array.from(crypto.getRandomValues(new Uint8Array(16))).map(v=>v.toString(16).padStart(2,"0")).join("");pending={key,serialized};
   parent.postMessage({kind:"pear-scorm12-commit",launchId:config.launchId,nonce:config.nonce,recordId:config.recordId,recordRevision:revision,state:JSON.parse(serialized),key},"*");
   error="0";return "true"; // accepted into the bounded parent queue; UI distinguishes durable acknowledgment
  }
  addEventListener("message",event=>{
   const data=event.data;if(event.source!==parent||event.origin!==config.parentOrigin||!data||data.kind!=="pear-scorm12-ack"||data.launchId!==config.launchId||data.nonce!==config.nonce||data.key!==pending?.key)return;
   if(data.ok&&Number.isSafeInteger(data.recordRevision)){revision=data.recordRevision;lastSaved=pending.serialized;error="0";}else error="101";
   pending=null;
  });
  Object.defineProperty(window,"API",{value:Object.freeze({
   LMSInitialize(argument){if(argument!==""||initialized||finished)return bad("201");initialized=true;return ok();},
   LMSGetValue(key){if(!active()){bad("301");return "";}if(typeof key!=="string"){bad("201");return "";}if(Object.hasOwn(state,key)){error="0";return state[key];}if(Object.hasOwn(config.readOnly,key)){error="0";return config.readOnly[key];}bad("401");return "";},
   LMSSetValue(key,value){if(!active())return bad("301");if(typeof key!=="string"||typeof value!=="string")return bad("201");if(Object.hasOwn(config.readOnly,key))return bad("403");if(!Object.hasOwn(state,key))return bad("401");const next={...state,[key]:value};if(!validSCORMState(next))return bad("405");state=next;return ok();},
   LMSCommit(argument){if(argument!=="")return bad("201");return commit();},
   LMSFinish(argument){if(argument!=="")return bad("201");if(!active())return bad("301");if(pending)return bad();if(JSON.stringify(state)!==lastSaved||revision===0){commit();return bad();}finished=true;return ok();},
   LMSGetLastError(){return error;},LMSGetErrorString(code){return code==="0"?"No error":code==="301"?"Not initialized":code==="401"?"Unsupported element":code==="403"?"Read only":code==="405"?"Invalid value":"Pending or failed persistence";},
   LMSGetDiagnostic(){return pending?"Commit awaiting server acknowledgment":"Restricted Pear SCORM 1.2 inline profile";}
  }),writable:false,configurable:false});
 })();`;
 return "<script>"+script+"</script>"+launch.html;
}
