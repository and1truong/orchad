// Original ordered writes:250 interactions,250 learner and2500 pattern origins.
export const fullResponseOriginsScript=String.raw`(function(api){
 const put=(key,value)=>{if(api.SetValue(key,value)!=='true')throw Error('Original response write refused:'+key);};
 for(let i=0;i<250;i++){
  const base='cmi.interactions.'+i;put(base+'.id','urn:pear:origin:'+i);put(base+'.type','fill-in');put(base+'.learner_response','{lang=en}Original learner');
  for(let j=0;j<10;j++)put(base+'.correct_responses.'+j+'.pattern','{lang=en}Original pattern '+j);
  put(base+'.type','choice');
 }
 put('cmi.exit','suspend');
})(api);`;
export const fullResponseOriginsVerifyScript=String.raw`(function(api){
 if(api.GetValue('cmi.interactions._count')!=='250')throw Error('Original interaction count lost');
 for(let i=0;i<250;i++){
  const base='cmi.interactions.'+i;
  for(const [key,value] of Object.entries({id:'urn:pear:origin:'+i,type:'choice',learner_response:'{lang=en}Original learner','correct_responses._count':'10'}))if(api.GetValue(base+'.'+key)!==value||api.GetLastError()!=='0')throw Error('Original response lost:'+base+'.'+key);
  for(let j=0;j<10;j++)if(api.GetValue(base+'.correct_responses.'+j+'.pattern')!=='{lang=en}Original pattern '+j||api.GetLastError()!=='0')throw Error('Original pattern lost:'+i+':'+j);
 }
})(api);`;
