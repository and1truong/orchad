// Original SCO operations;4000 supplementary Unicode scalars, not4000 octets.
export const learnerCommentScript = String.raw`(function(api){
  for(let i=0;i<250;i++)for(const [key,value] of Object.entries({comment:'🙂'.repeat(4000),location:'page'+i,timestamp:'2020-02-29T12:00:00.00Z'}))
    if(api.SetValue('cmi.comments_from_learner.'+i+'.'+key,value)!=='true')throw Error('Learner comment write refused:'+i+'.'+key);
  if(api.SetValue('cmi.exit','suspend')!=='true')throw Error('Comment suspend refused');
})(api);`;
export const learnerCommentVerifyScript = String.raw`(function(api){
  if(api.GetValue('cmi.comments_from_learner._count')!=='250')throw Error('Comment count lost');
  for(let i=0;i<250;i++)for(const [key,value] of Object.entries({comment:'🙂'.repeat(4000),location:'page'+i,timestamp:'2020-02-29T12:00:00.00Z'}))
    if(api.GetValue('cmi.comments_from_learner.'+i+'.'+key)!==value)throw Error('Original learner comment lost:'+i+'.'+key);
})(api);`;
