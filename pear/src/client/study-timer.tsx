import {translateUI} from "./i18n.ts";
import React, {useEffect,useRef,useState} from "react";
import {request,type Session} from "./api.ts";
type Result={totalSeconds:number;token?:string|null;active?:boolean};
export function StudyTimer({session,kind,targetId,busy=false}:{
  session:Session;kind:"course"|"item";targetId:string;busy?:boolean;
}) {
  const [seconds,setSeconds]=useState(0),[active,setActive]=useState(false),
    [pending,setPending]=useState(false),[error,setError]=useState("");
  const token=useRef<string|null>(null),live=useRef(false);
  const path="/api/study-timer";
  useEffect(()=>{
    live.current=true;
    void request<Result>(path+"?kind="+kind+"&targetId="+encodeURIComponent(targetId),session)
      .then(r=>{if(live.current)setSeconds(r.totalSeconds);})
      .catch(e=>{if(live.current)setError(e.message);});
    const stop=()=>{
      const value=token.current;token.current=null;
      if(live.current)setActive(false);
      if(value) void request<Result>(path,session,{action:"stop",kind,targetId,token:value})
        .then(r=>{if(live.current)setSeconds(r.totalSeconds);})
        .catch(e=>{if(live.current)setError(e.message);});
    };
    const visible=()=>{if(document.visibilityState!=="visible")stop();};
    document.addEventListener("visibilitychange",visible);
    const interval=setInterval(()=>{
      const value=token.current;
      if(!value || document.visibilityState!=="visible")return;
      void request<Result>(path,session,{action:"pulse",kind,targetId,token:value})
        .then(r=>{if(live.current&&token.current===value)setSeconds(r.totalSeconds);})
        .catch(e=>{if(live.current&&token.current===value){token.current=null;setActive(false);setError(e.message);}});
    },15000);
    return ()=>{live.current=false;clearInterval(interval);document.removeEventListener("visibilitychange",visible);stop();};
  },[session.sessionEpoch,kind,targetId]);
  const toggle=async()=>{
    setPending(true);setError("");
    const previous=token.current,action=previous?"stop":"start";
    try {
      const r=await request<Result>(path,session,{action,kind,targetId,...(previous?{token:previous}:{})});
      if(!live.current){
        if(r.token)void request(path,session,{action:"stop",kind,targetId,token:r.token}).catch(()=>{});
        return;
      }
      if(r.token && document.visibilityState!=="visible"){
        token.current=null;setActive(false);
        const stopped=await request<Result>(path,session,{action:"stop",kind,targetId,token:r.token});
        if(live.current)setSeconds(stopped.totalSeconds);
      } else {token.current=r.token??null;setActive(!!r.token);setSeconds(r.totalSeconds);}
    }catch(e){if(live.current){token.current=null;setActive(false);setError((e as Error).message);}}
    finally{if(live.current)setPending(false);}
  };
  return <section aria-label={translateUI("Optional study timer")} className="panel">
    <p>{translateUI("Study timer:")}{" "}{seconds} seconds · {active?"Running":"Paused"}</p>
    <p>{translateUI("Opt in to record connected timer intervals. Hidden tabs and gaps over 30 seconds are excluded. This does not verify attention or change completion, quiz scores or certificates.")}</p>
    <button type="button" disabled={pending||busy} onClick={()=>void toggle()}>
      {active?"Pause study timer":"Start study timer"}
    </button>
    {error&&<p role="status">{error}</p>}
  </section>;
}
