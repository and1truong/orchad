import type {scormLearningFixture} from './scorm-learning-fixture.ts';
export const lmsCommentState = () => Object.fromEntries(Array.from({length:100},(_,i)=>[i,{comment:'🙂'.repeat(4000),location:'page'+i,timestamp:'2020-02-29T12:00:00.00Z'}]));
// Fixture-only trusted launch seed, scoped to the actual newly created SCO row.
export function seedLMSComments(f: Pick<Awaited<ReturnType<typeof scormLearningFixture>>, 'player'|'db'>, token: string) {
  const b = f.player.bootstrap(token);
  if (b.revision === 0 && !Object.keys(b.state.comments_from_lms ?? {}).length) {
    b.state.comments_from_lms = lmsCommentState();
    f.db.prepare('UPDATE scorm_sco_attempts SET runtime_state=? WHERE (attempt_id,sco_id,sco_attempt_number,tenant)=(SELECT attempt_id,sco_id,sco_attempt_number,tenant FROM scorm_engine_launches WHERE id=?)').run(JSON.stringify(b.state),b.launchId);
  }
}
export const lmsCommentVerifyScript = String.raw`(function(api){
  if(api.GetValue('cmi.comments_from_lms._count')!=='100')throw Error('LMS comment count lost');
  for(let i=0;i<100;i++)for(const [key,value] of Object.entries({comment:'🙂'.repeat(4000),location:'page'+i,timestamp:'2020-02-29T12:00:00.00Z'})){
    const path='cmi.comments_from_lms.'+i+'.'+key;
    if(api.GetValue(path)!==value)throw Error('Original LMS comment lost:'+i+'.'+key);
    if(api.SetValue(path,'forged')!=='false'||api.GetLastError()!=='404'||api.GetValue(path)!==value)throw Error('LMS comment readonly lost:'+i+'.'+key);
  }
})(api);`;
