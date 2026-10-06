export const emptySCORMState=()=>({"cmi.core.lesson_status":"not attempted","cmi.core.lesson_location":"","cmi.suspend_data":"","cmi.core.score.raw":"","cmi.core.score.min":"0","cmi.core.score.max":"100","cmi.core.exit":"","cmi.core.session_time":"0000:00:00.00"});
export function scormTime(value:string){
 const match=/^(\d{2,4}):([0-5]\d):([0-5]\d)(?:\.(\d{1,2}))?$/.exec(value);if(!match)return null;
 const seconds=Number(match[1])*3600+Number(match[2])*60+Number(match[3])+Number("0."+(match[4]??"0"));return seconds<=604800?seconds:null;
}
export function formatSCORMTime(seconds:number){const cents=Math.round(seconds*100),hours=Math.floor(cents/360000),minutes=Math.floor(cents/6000)%60,remainder=Math.floor(cents/100)%60;return String(hours).padStart(4,"0")+":"+String(minutes).padStart(2,"0")+":"+String(remainder).padStart(2,"0")+"."+String(cents%100).padStart(2,"0");}
export function validSCORMState(input:any){
 if(!input||typeof input!=="object"||Array.isArray(input))return false;const keys=Object.keys(emptySCORMState());
 if(Object.keys(input).sort().join(",")!==keys.sort().join(",")||keys.some(k=>typeof input[k]!=="string"))return false;
 if(!["passed","completed","failed","incomplete","browsed","not attempted"].includes(input["cmi.core.lesson_status"])||!["","time-out","suspend","logout"].includes(input["cmi.core.exit"])||input["cmi.core.lesson_location"].length>255||input["cmi.suspend_data"].length>4096||scormTime(input["cmi.core.session_time"])===null)return false;
 for(const k of ["raw","min","max"]){const value=input["cmi.core.score."+k];if(value!==""&&(!/^-?(?:\d{1,3})(?:\.\d{1,4})?$/.test(value)||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>100))return false;}
 const raw=input["cmi.core.score.raw"],min=input["cmi.core.score.min"],max=input["cmi.core.score.max"];
 return !(min!==""&&max!==""&&Number(min)>=Number(max)||raw!==""&&(min!==""&&Number(raw)<Number(min)||max!==""&&Number(raw)>Number(max)));
}
