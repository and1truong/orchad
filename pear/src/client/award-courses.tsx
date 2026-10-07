import React,{useState} from 'react';
import {translateUI as t} from './i18n.ts';
type Actions={busy:boolean;op:(name:string,args?:Record<string,unknown>)=>Promise<any>;mutate:(name:string,args:Record<string,unknown>)=>Promise<any>;run:(fn:()=>Promise<void>)=>Promise<boolean>};
function Review({value,actions,coordinator,onCreated}:{value:any;actions:Actions;coordinator:boolean;onCreated?:()=>void}){
 const [version,setVersion]=useState(''),[confirmed,setConfirmed]=useState(false),[done,setDone]=useState(false);
 const accepting=!coordinator&&value.assigned;
 const target=accepting?value.offer?.targetVersion:Number(version);
 const available=value.available&&!value.pendingOfficialWork&&(accepting?!!value.offer:!!version)&&!done;
 return <section aria-label={t('Award course binding review')}>
  <p>{value.criterionPath} · {value.courseId} · {t('Original pinned version')}: {value.originalVersion} · {t('Current bound version')}: {value.currentVersion}</p>
  <p>{t('Fresh learning copies no completion, answers, time or attendance. Original and future cycle pins stay unchanged.')}</p>
  <p>{t('Resolve pending assessment and cancel bookings before changing award learning.')}</p>
  {value.sourceEnrollmentId&&<p>{t('Prior learning record')}: {value.sourceEnrollmentId} · {t('Version')} {value.sourceVersion}</p>}
  {!accepting&&<label>{t('Reviewed award course version')}<select aria-label={t('Reviewed award course version')} disabled={actions.busy||done} value={version} onChange={e=>{setVersion(e.target.value);setConfirmed(false);}}><option value="">{t('Choose a version explicitly')}</option>{value.versions.map((v:any)=><option key={v.version} value={v.version} disabled={!v.available}>{v.version} · {v.title}</option>)}</select></label>}
  {accepting&&<p>{value.offer?`${t('Coordinator offered version')}: ${value.offer.targetVersion}`:t('Await a separate coordinator offer')}</p>}
  <form onSubmit={e=>{e.preventDefault();if(!available||!confirmed)return;void actions.run(async()=>{
   const tool=coordinator?'human_offer_award_course_change':accepting?'human_accept_award_course_change':'human_requalify_award_course';
   await actions.mutate(tool,accepting?{reviewId:value.offer.id,targetVersion:target,expectedBindingRevision:value.offer.expectedBindingRevision,confirmed:true}:{awardEnrollmentId:value.awardEnrollmentId,criterionPath:value.criterionPath,courseId:value.courseId,sourceEnrollmentId:value.sourceEnrollmentId,targetVersion:target,expectedBindingRevision:value.expectedBindingRevision,confirmed:true});setDone(true);if(!coordinator)onCreated?.();
  });}}>
   <label><input type="checkbox" disabled={!available||actions.busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t(coordinator?'I authorize this exact award course offer.':'I reviewed this exact award course version and accept fresh learning.')}</label>
   <button disabled={!available||!confirmed||actions.busy}>{t(coordinator?'Offer award course change':accepting?'Accept award course change':'Start reviewed award course learning')}</button>
  </form>
  {coordinator&&value.offer&&!done&&<button disabled={actions.busy} onClick={()=>void actions.run(async()=>{await actions.mutate('human_cancel_award_course_change',{reviewId:value.offer.id,confirmed:true});setDone(true);})}>{t('Cancel award course offer')}</button>}
  {done&&<p role="status">{t('Award course review recorded')}</p>}
 </section>;
}
export function AwardCourseLearner({address,actions,onCreated}:{address:{awardEnrollmentId:string;criterionPath:string;courseId:string};actions:Actions;onCreated?:()=>void}){
 const [value,setValue]=useState<any>(null);
 return <div><button disabled={actions.busy} onClick={()=>void actions.run(async()=>setValue(await actions.op('human_get_award_course_review',address)))}>{t('Review award course learning')}</button>{value&&<Review key={JSON.stringify(value)} value={value} actions={actions} coordinator={false} onCreated={onCreated}/>}</div>;
}
export function AwardCourseCoordinator({actions}:{actions:Actions}){
 const [value,setValue]=useState<any>(null);
 return <section className="panel" aria-label={t('Coordinate award course learning')}><h3>{t('Coordinate award course learning')}</h3>
  <form onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget),address={awardEnrollmentId:String(d.get('award')),criterionPath:String(d.get('path')),courseId:String(d.get('course'))};setValue(null);void actions.run(async()=>setValue(await actions.op('human_get_award_course_review',address)));}}>
   <label>{t('Award enrollment ID')}<input name="award" required maxLength={64}/></label><label>{t('Criterion path')}<input name="path" required maxLength={768}/></label><label>{t('Award course ID')}<input name="course" required maxLength={64}/></label><button disabled={actions.busy}>{t('Review exact award course')}</button>
  </form>{value&&<Review key={JSON.stringify(value)} value={value} actions={actions} coordinator/>}
 </section>;
}
